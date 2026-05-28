jest.mock('../../index', () => ({
  prisma: {},
}));

jest.mock('../ventas-excel-export.service', () => ({
  ventasExcelExportService: {},
  VENTA_EXCEL_INCLUDE: {},
}));

jest.mock('../../utils/search-queries', () => ({
  findVentaIdsByTextSearch: jest.fn().mockResolvedValue([10, 20]),
  EMPTY_ID_FILTER: -1,
}));

import { VentasService } from '../ventas.service';
import { findVentaIdsByTextSearch } from '../../utils/search-queries';

describe('VentasService.buildWhereClause', () => {
  const service = new VentasService();

  it('excluye canceladas por defecto', () => {
    const where = service.buildWhereClause({});
    expect(where.estado_pago).toEqual({ not: 'cancelado' });
  });

  it('permite incluir canceladas con flag', () => {
    const where = service.buildWhereClause({ incluir_canceladas: true });
    expect(where.estado_pago).toBeUndefined();
  });

  it('filtra por cod_interno parcial', () => {
    const where = service.buildWhereClause({ cod_interno: 'MAX-0001' });
    expect(where.cod_interno).toEqual({ contains: 'MAX-0001', mode: 'insensitive' });
  });

  it('no aplica búsqueda de texto en buildWhereClause sincrónico', () => {
    const where = service.buildWhereClause({ busqueda: 'MAX-99' });
    expect(where.id_venta).toBeUndefined();
    expect(where.OR).toBeUndefined();
  });

  it('filtra por id_venta exacto', () => {
    const where = service.buildWhereClause({ id_venta: 42 });
    expect(where.id_venta).toBe(42);
  });

  it('aplica rango de fechas', () => {
    const where = service.buildWhereClause({
      fecha_desde: '2025-01-01',
      fecha_hasta: '2025-01-31',
    });
    const fecha = where.fecha as { gte?: Date; lte?: Date };
    expect(fecha.gte).toEqual(new Date('2025-01-01'));
    expect(fecha.lte).toEqual(new Date('2025-01-31'));
  });
});

describe('VentasService.buildWhereClauseWithSearch', () => {
  const service = new VentasService();

  it('aplica ids devueltos por búsqueda SQL normalizada', async () => {
    const where = await service.buildWhereClauseWithSearch({ busqueda: 'garcia' });
    expect(findVentaIdsByTextSearch).toHaveBeenCalledWith('garcia');
    expect(where.id_venta).toEqual({ in: [10, 20] });
  });
});
