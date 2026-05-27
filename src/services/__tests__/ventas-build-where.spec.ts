jest.mock('../../index', () => ({
  prisma: {},
}));

jest.mock('../ventas-excel-export.service', () => ({
  ventasExcelExportService: {},
  VENTA_EXCEL_INCLUDE: {},
}));

import { VentasService } from '../ventas.service';

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

  it('incluye cod_interno en búsqueda general', () => {
    const where = service.buildWhereClause({ busqueda: 'MAX-99' });
    expect(where.OR).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cod_interno: { contains: 'MAX-99', mode: 'insensitive' },
        }),
      ]),
    );
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
