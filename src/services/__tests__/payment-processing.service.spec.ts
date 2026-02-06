/**
 * =============================================================================
 * TESTS: PaymentProcessingService.confirmPayment
 * =============================================================================
 *
 * OBJETIVO: Garantizar que al confirmar un pago:
 *   1. Se descuenta stock, se actualiza estado y se emiten eventos.
 *   2. Se envía UN email de confirmación al cliente.
 *   3. El email SIEMPRE incluye el número de pedido (orderId).
 *   4. Si la venta tiene envío (no es retiro), el email incluye trackingCode y carrier.
 *
 * CÓMO EJECUTAR:
 *   Desde api-maxshop:  npm test
 *   Solo este archivo:  npm test -- payment-processing
 *   Modo watch:         npm test -- --watch
 *
 * CÓMO EDITAR / AÑADIR CASOS:
 *   - Añadir un nuevo "it('...')" dentro del describe correspondiente.
 *   - Para probar otro flujo: definir venta de prueba (objeto con detalles, cliente, etc.)
 *     y usar mockVentasGetById.mockResolvedValueOnce(venta1).mockResolvedValueOnce(venta2)...
 *   - Para comprobar que se llamó al mail: expect(mailService.sendOrderConfirmation).toHaveBeenCalledWith(...)
 *
 * MOCKS (qué se simula y por qué):
 *   - prisma: no tocamos BD real.
 *   - cacheService: no necesitamos Redis.
 *   - mailService: no enviamos emails reales; solo comprobamos que se llama con los datos correctos.
 *   - handlerExecutorService: no llamamos a Andreani ni a otros handlers reales; en el test
 *     "con envío" hacemos que getById devuelva una venta con envio.cod_seguimiento para simular
 *     que Andreani ya creó el envío.
 *   - VentasService.getById: controlamos qué venta "existe" en cada paso.
 *   - ProductosService.updateStock: no modificamos stock real.
 */

import { PaymentProcessingService } from '../payment-processing.service';
import mailService from '../../mail';

// -----------------------------------------------------------------------------
// Estado compartido para mocks (permite que VentasService mock devuelva getById
// configurable desde el test).
// -----------------------------------------------------------------------------
const ventasState = {
  getById: jest.fn(),
};

// -----------------------------------------------------------------------------
// Mocks de módulos (rutas relativas al archivo de test: services/__tests__/)
// -----------------------------------------------------------------------------
jest.mock('../../index', () => ({
  prisma: {
    venta: {
      update: jest.fn().mockResolvedValue({}),
    },
  },
}));

jest.mock('../cache.service', () => ({
  __esModule: true,
  default: {
    delete: jest.fn().mockResolvedValue(undefined),
    deletePattern: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../mail', () => ({
  __esModule: true,
  default: {
    sendOrderConfirmation: jest.fn().mockResolvedValue({ messageId: 'test-id' }),
  },
}));

jest.mock('../handlers/handler-executor.service', () => ({
  handlerExecutorService: {
    runHandlersAndEmit: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../ventas.service', () => ({
  VentasService: jest.fn().mockImplementation(() => ({
    getById: ventasState.getById,
  })),
}));

jest.mock('../productos.service', () => ({
  ProductosService: jest.fn().mockImplementation(() => ({
    updateStock: jest.fn().mockResolvedValue(undefined),
  })),
}));

// -----------------------------------------------------------------------------
// Datos de prueba reutilizables
// -----------------------------------------------------------------------------
const ID_VENTA = 999;

/** Venta pendiente con detalle y cliente con email (caso típico para confirmar). */
function buildVentaPendiente(overrides: Record<string, unknown> = {}) {
  return {
    id_venta: ID_VENTA,
    estado_pago: 'pendiente',
    estado_envio: 'pendiente',
    total_neto: 1500,
    fecha: new Date(),
    metodo_pago: 'mercadopago',
    observaciones: null,
    cliente: {
      usuario: {
        email: 'cliente@ejemplo.com',
        nombre: 'Juan',
        apellido: 'Pérez',
      },
    },
    usuario: null,
    detalles: [
      {
        id_detalle: 1,
        id_prod: 10,
        cantidad: 2,
        precio_unitario: 500,
        sub_total: 1000,
        producto: {
          id_prod: 10,
          nombre: 'Producto Test',
          stock: 10,
        },
      },
    ],
    envio: null,
    ...overrides,
  };
}

/** Misma venta ya aprobada (después de confirmPayment actualiza en BD). */
function buildVentaAprobadaSinEnvio(overrides: Record<string, unknown> = {}) {
  return buildVentaPendiente({
    estado_pago: 'aprobado',
    estado_envio: 'pendiente',
    ...overrides,
  });
}

/** Venta aprobada con envío Andreani (después de runHandlersAndEmit). */
function buildVentaAprobadaConEnvio(overrides: Record<string, unknown> = {}) {
  return buildVentaAprobadaSinEnvio({
    envio: {
      cod_seguimiento: 'ANDREANI-TRACK-123',
      id_envio: 1,
    },
    estado_envio: 'preparando',
    ...overrides,
  });
}

describe('PaymentProcessingService.confirmPayment', () => {
  let service: PaymentProcessingService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PaymentProcessingService();
  });

  describe('flujo básico (stock, estado, evento)', () => {
    it('descuenta stock y deja la venta en estado aprobado', async () => {
      const ventaPendiente = buildVentaPendiente();
      const ventaAprobada = buildVentaAprobadaSinEnvio();

      ventasState.getById
        .mockResolvedValueOnce(ventaPendiente)
        .mockResolvedValueOnce(ventaAprobada)
        .mockResolvedValue(ventaAprobada);

      const result = await service.confirmPayment(ID_VENTA);

      expect(result.estado_pago).toBe('aprobado');
      expect(ventasState.getById).toHaveBeenCalledWith(ID_VENTA);
    });

    it('no envía email ni ejecuta handlers si la venta ya estaba aprobada (idempotencia)', async () => {
      const ventaAprobada = buildVentaAprobadaSinEnvio();
      ventasState.getById.mockResolvedValue(ventaAprobada);

      const { handlerExecutorService } = require('../handlers/handler-executor.service');

      await service.confirmPayment(ID_VENTA);

      expect(handlerExecutorService.runHandlersAndEmit).not.toHaveBeenCalled();
      expect(mailService.sendOrderConfirmation).not.toHaveBeenCalled();
    });
  });

  describe('email al cliente (número de pedido y seguimiento)', () => {
    it('envía exactamente un email de confirmación al cliente', async () => {
      const ventaPendiente = buildVentaPendiente();
      const ventaAprobada = buildVentaAprobadaSinEnvio();

      ventasState.getById
        .mockResolvedValueOnce(ventaPendiente)
        .mockResolvedValueOnce(ventaAprobada)
        .mockResolvedValue(ventaAprobada);

      await service.confirmPayment(ID_VENTA);

      expect(mailService.sendOrderConfirmation).toHaveBeenCalledTimes(1);
    });

    it('el email incluye SIEMPRE el número de pedido (orderId)', async () => {
      const ventaPendiente = buildVentaPendiente();
      const ventaAprobada = buildVentaAprobadaSinEnvio();

      ventasState.getById
        .mockResolvedValueOnce(ventaPendiente)
        .mockResolvedValueOnce(ventaAprobada)
        .mockResolvedValue(ventaAprobada);

      await service.confirmPayment(ID_VENTA);

      const call = (mailService.sendOrderConfirmation as jest.Mock).mock.calls[0][0];
      expect(call).toBeDefined();
      expect(call.orderId).toBe(ID_VENTA);
    });

    it('cuando la venta tiene envío (no retiro), el email incluye trackingCode y carrier', async () => {
      const ventaPendiente = buildVentaPendiente();
      const ventaAprobadaSinEnvio = buildVentaAprobadaSinEnvio();
      const ventaAprobadaConEnvio = buildVentaAprobadaConEnvio();

      // Primera getById: venta pendiente
      // Segunda: después de actualizar estado (aún sin envío)
      // Tercera: después de runHandlersAndEmit (simulamos que Andreani creó el envío)
      ventasState.getById
        .mockResolvedValueOnce(ventaPendiente)
        .mockResolvedValueOnce(ventaAprobadaSinEnvio)
        .mockResolvedValueOnce(ventaAprobadaConEnvio)
        .mockResolvedValue(ventaAprobadaConEnvio);

      await service.confirmPayment(ID_VENTA);

      const call = (mailService.sendOrderConfirmation as jest.Mock).mock.calls[0][0];
      expect(call.orderId).toBe(ID_VENTA);
      expect(call.trackingCode).toBe('ANDREANI-TRACK-123');
      expect(call.carrier).toBe('Andreani');
    });

    it('cuando la venta es retiro en tienda, el email puede no incluir trackingCode', async () => {
      const ventaPendiente = buildVentaPendiente({
        observaciones: 'Retiro en tienda',
        envio: null,
      });
      const ventaAprobada = buildVentaAprobadaSinEnvio({
        observaciones: 'Retiro en tienda',
        envio: null,
      });

      ventasState.getById
        .mockResolvedValueOnce(ventaPendiente)
        .mockResolvedValueOnce(ventaAprobada)
        .mockResolvedValue(ventaAprobada);

      await service.confirmPayment(ID_VENTA);

      const call = (mailService.sendOrderConfirmation as jest.Mock).mock.calls[0][0];
      expect(call.orderId).toBe(ID_VENTA);
      // Retiro: no hay envío, por tanto no hay tracking
      expect(call.trackingCode).toBeUndefined();
      expect(call.carrier).toBeUndefined();
    });
  });
});
