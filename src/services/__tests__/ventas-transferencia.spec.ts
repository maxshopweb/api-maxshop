/**
 * TESTS: descuento por transferencia en VentasService.create
 * npm test -- ventas-transferencia
 */

const mockGetConfig = jest.fn();

jest.mock('../../index', () => ({
  prisma: {
    productos: { findUnique: jest.fn() },
    cliente: { findUnique: jest.fn(), create: jest.fn() },
    usuarios: { findUnique: jest.fn() },
    venta: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('../productos.service', () => ({
  ProductosService: jest.fn(() => ({
    assertStockDisponibleParaLineas: jest.fn().mockResolvedValue(undefined),
    getPrecioFinalConIva: jest.fn().mockReturnValue(1248000),
    getPrecioFinalAPagar: jest.fn().mockReturnValue(1248000),
  })),
}));

jest.mock('../config-tienda.service', () => ({
  ConfigTiendaService: jest.fn(() => ({
    getConfig: mockGetConfig,
  })),
}));

jest.mock('../cupones.service', () => ({
  cuponesService: {
    resolveForCheckout: jest.fn(),
    redeemAtomically: jest.fn(),
  },
}));

jest.mock('../cache.service', () => ({
  __esModule: true,
  default: {
    delete: jest.fn().mockResolvedValue(undefined),
    deletePattern: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../handlers/handler-executor.service', () => ({
  handlerExecutorService: {
    runHandlersAndEmit: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../domain/events/sale.events', () => ({
  SaleEventType: { SALE_CREATED: 'SALE_CREATED' },
  SaleEventFactory: {
    createSaleCreated: jest.fn().mockReturnValue({
      type: 'SALE_CREATED',
      payload: {},
      timestamp: '2025-01-01T12:00:00.000Z',
    }),
  },
}));

import { VentasService } from '../ventas.service';
import { prisma } from '../../index';
import { cuponesService } from '../cupones.service';
import { computeCabeceraDiferenciaEnvio } from '../../utils/ventas-excel-cabecera.utils';

const ID_USUARIO = 'user-transfer-1';

function buildProductoDb() {
  return {
    bonificacion_porcentaje: null,
    lista_precio_activa: 'V',
    precio_venta: 1248000,
    precio_especial: null,
    precio_pvp: null,
    precio_campanya: null,
    precio_manual: null,
    iva: { porcentaje: 21 },
  };
}

describe('VentasService.create — descuento transferencia', () => {
  let service: VentasService;
  let lastCreateData: Record<string, unknown> | null;

  beforeEach(() => {
    jest.clearAllMocks();
    lastCreateData = null;

    mockGetConfig.mockResolvedValue({
      descuento_transferencia_activo: true,
      descuento_transferencia_pct: 23,
    });

    (prisma.productos.findUnique as jest.Mock).mockResolvedValue(buildProductoDb());
    (prisma.cliente.findUnique as jest.Mock).mockResolvedValue({ id_usuario: ID_USUARIO });
    (prisma.usuarios.findUnique as jest.Mock).mockResolvedValue({
      id_usuario: ID_USUARIO,
      activo: true,
    });

    (prisma.$transaction as jest.Mock).mockImplementation(async (fn: any) => {
      const tx = {
        venta: {
          create: jest.fn().mockImplementation(async ({ data }: any) => {
            lastCreateData = data;
            return { id_venta: 501, ...data };
          }),
          update: jest.fn().mockImplementation(async ({ data }: any) => ({
            id_venta: 501,
            cod_interno: data.cod_interno,
            ...lastCreateData,
            venta_detalle: [],
            cliente: null,
            usuarios: null,
          })),
        },
      };
      return fn(tx);
    });

    service = new VentasService();
    jest.spyOn(service, 'getById').mockResolvedValue({
      id_venta: 501,
      cod_interno: 'MAX-00000501',
      estado_pago: 'pendiente',
      fecha: new Date('2025-01-01T12:00:00.000Z'),
      total_con_iva: 1248000,
      total_neto: 960960,
      descuento_total: 0,
      descuento_transferencia: 287040,
      descuento_cupon: null,
      metodo_pago: 'transferencia',
      detalles: [],
    } as any);
  });

  it('venta por transferencia aplica % y no toca descuento_total ni líneas', async () => {
    await service.create(
      {
        id_cliente: ID_USUARIO,
        metodo_pago: 'transferencia',
        tipo_venta: 'online',
        detalles: [{ id_prod: 10, cantidad: 1 }],
      },
      ID_USUARIO
    );

    expect(lastCreateData).toBeTruthy();
    expect(lastCreateData!.total_con_iva).toBe(1248000);
    expect(lastCreateData!.descuento_transferencia).toBe(287040);
    expect(lastCreateData!.total_neto).toBe(960960);
    expect(lastCreateData!.descuento_total).toBe(0);
    const lineas = (lastCreateData!.venta_detalle as any).create;
    expect(lineas).toHaveLength(1);
    expect(lineas[0].sub_total).toBe(1248000);
    expect(lineas[0].descuento_aplicado).toBe(0);
  });

  it.each(['mercadopago', 'efectivo'] as const)(
    'venta por %s no aplica descuento transferencia',
    async (metodo) => {
      await service.create(
        {
          id_cliente: ID_USUARIO,
          metodo_pago: metodo,
          tipo_venta: 'online',
          detalles: [{ id_prod: 10, cantidad: 1 }],
        },
        ID_USUARIO
      );

      expect(lastCreateData!.descuento_transferencia).toBeNull();
      expect(lastCreateData!.total_neto).toBe(1248000);
      expect(mockGetConfig).not.toHaveBeenCalled();
    }
  );

  it('regla apagada no descuenta aunque el medio sea transferencia', async () => {
    mockGetConfig.mockResolvedValue({
      descuento_transferencia_activo: false,
      descuento_transferencia_pct: 23,
    });

    await service.create(
      {
        id_cliente: ID_USUARIO,
        metodo_pago: 'transferencia',
        tipo_venta: 'online',
        detalles: [{ id_prod: 10, cantidad: 1 }],
      },
      ID_USUARIO
    );

    expect(lastCreateData!.descuento_transferencia).toBeNull();
    expect(lastCreateData!.total_neto).toBe(1248000);
  });

  it('cupón se resuelve sobre subtotal ya descontado por transferencia', async () => {
    (cuponesService.resolveForCheckout as jest.Mock).mockResolvedValue({
      id_cupon: 1,
      codigo: 'SAVE10',
      monto_descuento: 10000,
    });

    await service.create(
      {
        id_cliente: ID_USUARIO,
        metodo_pago: 'transferencia',
        tipo_venta: 'online',
        codigo_cupon: 'SAVE10',
        detalles: [{ id_prod: 10, cantidad: 1 }],
      },
      ID_USUARIO
    );

    expect(cuponesService.resolveForCheckout).toHaveBeenCalledWith('SAVE10', 960960);
    expect(lastCreateData!.descuento_cupon).toBe(10000);
    expect(lastCreateData!.total_neto).toBe(950960);
  });
});

describe('Excel cabecera — diferencia envío con transferencia', () => {
  it('no mezcla descuento transferencia con envío', () => {
    // total_con_iva 1000, transfer 200, cupón 50, envío 100 → total_neto = 850
    const diferencia = computeCabeceraDiferenciaEnvio(1000, 850, 50, 200);
    expect(diferencia).toBe(-100); // solo el envío (con signo en AH: -abs)
    expect(Math.abs(diferencia)).toBe(100);
  });

  it('sin transferencia ni cupón, diferencia = envío', () => {
    expect(computeCabeceraDiferenciaEnvio(1000, 1100, 0, 0)).toBe(-100);
  });
});
