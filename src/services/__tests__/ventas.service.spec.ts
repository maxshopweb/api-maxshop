jest.setTimeout(30000);

const mockGetConfig = jest.fn();
const mockGetPaymentInstallmentsConfig = jest.fn();
const mockGetDatosBancarios = jest.fn();

jest.mock('../../index', () => ({
  prisma: {
    cliente: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    usuarios: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    envios: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    venta: {
      update: jest.fn(),
    },
  },
}));

jest.mock('../mercado-pago.service', () => ({
  mercadoPagoService: {
    isConfigured: jest.fn(),
    getMode: jest.fn(),
    createPreferenceFromVenta: jest.fn(),
  },
}));

jest.mock('../direcciones.service', () => ({
  direccionesService: {
    getById: jest.fn(),
  },
}));

jest.mock('../config-tienda.service', () => ({
  ConfigTiendaService: jest.fn(() => ({
    getConfig: mockGetConfig,
    getPaymentInstallmentsConfig: mockGetPaymentInstallmentsConfig,
    getDatosBancarios: mockGetDatosBancarios,
  })),
}));

jest.mock('../../infrastructure/event-bus/event-bus', () => ({
  eventBus: {
    emit: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../domain/events/sale.events', () => ({
  SaleEventType: { SALE_CREATED: 'SALE_CREATED' },
  SaleEventFactory: {
    createSaleCreated: jest.fn().mockReturnValue({
      type: 'SALE_CREATED',
      payload: { id_venta: 999, estado_pago: 'pendiente', fecha: '2025-01-01T12:00:00.000Z', venta: {} },
      timestamp: '2025-01-01T12:00:00.000Z',
    }),
  },
}));

jest.mock('../../mail', () => ({
  __esModule: true,
  default: {
    sendPaymentInstructions: jest.fn().mockResolvedValue({ messageId: 'test-id' }),
    sendOrderPending: jest.fn().mockResolvedValue({ messageId: 'test-id' }),
  },
}));

jest.mock('../cache.service', () => ({
  __esModule: true,
  default: {
    delete: jest.fn().mockResolvedValue(undefined),
    deletePattern: jest.fn().mockResolvedValue(undefined),
  },
}));

import { VentasService } from '../ventas.service';
import { prisma } from '../../index';
import mailService from '../../mail';
import { mercadoPagoService } from '../mercado-pago.service';
import { direccionesService } from '../direcciones.service';
import { eventBus } from '../../infrastructure/event-bus/event-bus';
import { SaleEventType, SaleEventFactory } from '../../domain/events/sale.events';

const ID_VENTA = 999;
const ID_USUARIO = 'user-abc-123';
const ID_DIRECCION = 'dir-456-def';

function buildVentaPendiente(overrides: Record<string, unknown> = {}) {
  return {
    id_venta: ID_VENTA,
    cod_interno: 'MAX-00000999',
    estado_pago: 'pendiente',
    estado_envio: 'pendiente',
    fecha: new Date('2025-01-01T12:00:00.000Z'),
    total_neto: 15000,
    metodo_pago: 'mercadopago',
    observaciones: null,
    cliente: {
      id_usuario: ID_USUARIO,
      usuario: {
        email: 'cliente@ejemplo.com',
        nombre: 'Juan',
        apellido: 'Perez',
      },
      direccion: 'Av. Siempre Viva',
      altura: '742',
      ciudad: 'CABA',
      cod_postal: 1425,
    },
    usuario: null,
    detalles: [
      {
        id_detalle: 1,
        id_prod: 10,
        cantidad: 2,
        precio_unitario: 5000,
        sub_total: 10000,
        producto: {
          id_prod: 10,
          nombre: 'Producto Test',
          cuotas_habilitadas: true,
        },
      },
    ],
    envio: null,
    ...overrides,
  };
}

function buildCliente(overrides: Record<string, unknown> = {}) {
  return { id_usuario: ID_USUARIO, ...overrides };
}

function buildUsuario(overrides: Record<string, unknown> = {}) {
  return {
    id_usuario: ID_USUARIO,
    nombre: 'Juan',
    apellido: 'Perez',
    email: 'cliente@ejemplo.com',
    telefono: null,
    tipo_documento: null,
    numero_documento: null,
    ...overrides,
  };
}

function buildCheckoutData(overrides: Record<string, unknown> = {}) {
  return {
    id_cliente: ID_USUARIO,
    metodo_pago: 'mercadopago',
    detalles: [{ id_prod: 10, cantidad: 2 }],
    ...overrides,
  };
}

describe('VentasService.createFromCheckout', () => {
  let service: VentasService;

  beforeAll(() => {
    jest.spyOn(VentasService.prototype, 'create');
  });

  beforeEach(() => {
    jest.clearAllMocks();

    (VentasService.prototype.create as jest.Mock).mockResolvedValue(buildVentaPendiente() as any);

    (prisma.cliente.findUnique as jest.Mock).mockResolvedValue(buildCliente());
    (prisma.cliente.create as jest.Mock).mockResolvedValue(buildCliente());
    (prisma.cliente.update as jest.Mock).mockResolvedValue(buildCliente());
    (prisma.usuarios.findUnique as jest.Mock).mockResolvedValue(buildUsuario());
    (prisma.usuarios.update as jest.Mock).mockResolvedValue(buildUsuario());
    (prisma.envios.findFirst as jest.Mock).mockResolvedValue(null);
    (prisma.envios.create as jest.Mock).mockResolvedValue({ id_envio: 'envio-1' });
    (prisma.envios.update as jest.Mock).mockResolvedValue({});
    (prisma.venta.update as jest.Mock).mockResolvedValue(buildVentaPendiente());

    (mercadoPagoService.isConfigured as jest.Mock).mockReturnValue(true);
    (mercadoPagoService.getMode as jest.Mock).mockReturnValue('sandbox');
    (mercadoPagoService.createPreferenceFromVenta as jest.Mock).mockResolvedValue({
      id: 'pref-abc-123',
      init_point: 'https://www.mercadopago.com.ar/init',
      sandbox_init_point: 'https://sandbox.mercadopago.com.ar/init',
    });

    (direccionesService.getById as jest.Mock).mockResolvedValue({
      id_direccion: ID_DIRECCION,
      direccion: 'Calle Falsa',
      altura: '123',
      piso: '2',
      dpto: 'A',
      ciudad: 'Springfield',
      provincia: 'NA',
      cod_postal: 5000,
    });

    mockGetConfig.mockResolvedValue({
      cuotas_sin_interes_activo: true,
    });
    mockGetPaymentInstallmentsConfig.mockResolvedValue({
      cuotasSinInteres: 3,
      cuotasSinInteresMinimo: 80000,
    });
    mockGetDatosBancarios.mockResolvedValue({
      banco: 'Test Bank',
      tipo_cuenta: 'Corriente',
      numero_cuenta: '123-456',
      cbu: '0000000000000000000001',
      alias: 'test.banco',
      titular: 'Test SA',
      cuit: '30-12345678-9',
      instrucciones: 'Transferir el monto exacto',
    });

    (eventBus.emit as jest.Mock).mockResolvedValue(undefined);

    service = new VentasService();
  });

  describe('flujo basico con mercadopago', () => {
    it('crea venta, preferencia MP y envia email pendiente', async () => {
      const result = await service.createFromCheckout(buildCheckoutData(), ID_USUARIO);

      expect(prisma.cliente.findUnique).toHaveBeenCalledWith({ where: { id_usuario: ID_USUARIO } });
      expect(VentasService.prototype.create).toHaveBeenCalledWith(
        expect.objectContaining({
          id_cliente: ID_USUARIO,
          metodo_pago: 'mercadopago',
          tipo_venta: 'online',
          detalles: expect.arrayContaining([
            expect.objectContaining({ id_prod: 10, cantidad: 2 }),
          ]),
        }),
        ID_USUARIO,
      );
      expect(mercadoPagoService.isConfigured).toHaveBeenCalled();
      expect(mercadoPagoService.createPreferenceFromVenta).toHaveBeenCalledWith(
        expect.objectContaining({
          venta: expect.objectContaining({ id_venta: ID_VENTA }),
          backUrls: expect.objectContaining({
            success: expect.stringContaining(`id_venta=${ID_VENTA}`),
            failure: expect.stringContaining(`id_venta=${ID_VENTA}`),
            pending: expect.stringContaining(`id_venta=${ID_VENTA}`),
          }),
        }),
      );
      expect(mailService.sendOrderPending).toHaveBeenCalledTimes(1);
      expect(mailService.sendPaymentInstructions).not.toHaveBeenCalled();
      expect(eventBus.emit).toHaveBeenCalledWith('SALE_CREATED', expect.any(Object));
      expect((result as any).mercadoPagoPreferenceUrl).toBe('https://sandbox.mercadopago.com.ar/init');
      expect(result.id_venta).toBe(ID_VENTA);
    });

    it('incluye id_venta y cod_interno en back_urls cuando hay DEFAULT_*_URL', async () => {
      const prevSuccess = process.env.DEFAULT_SUCCESS_URL;
      const prevFailure = process.env.DEFAULT_FAILURE_URL;
      const prevPending = process.env.DEFAULT_PENDING_URL;
      process.env.DEFAULT_SUCCESS_URL =
        'https://www.maxshop.com.ar/checkout/resultado?status=approved';
      process.env.DEFAULT_FAILURE_URL =
        'https://www.maxshop.com.ar/checkout/resultado?status=rejected';
      process.env.DEFAULT_PENDING_URL =
        'https://www.maxshop.com.ar/checkout/resultado?status=pending';

      try {
        await service.createFromCheckout(buildCheckoutData(), ID_USUARIO);

        const calls = (mercadoPagoService.createPreferenceFromVenta as jest.Mock).mock.calls;
        const { backUrls } = calls[calls.length - 1][0];

        expect(backUrls.success).toContain('www.maxshop.com.ar/checkout/resultado');
        expect(backUrls.success).toContain('status=approved');
        expect(backUrls.success).toContain(`id_venta=${ID_VENTA}`);
        expect(backUrls.success).toContain('cod_interno=MAX-00000999');
        expect(backUrls.failure).toContain('status=rejected');
        expect(backUrls.pending).toContain('status=pending');
      } finally {
        if (prevSuccess === undefined) delete process.env.DEFAULT_SUCCESS_URL;
        else process.env.DEFAULT_SUCCESS_URL = prevSuccess;
        if (prevFailure === undefined) delete process.env.DEFAULT_FAILURE_URL;
        else process.env.DEFAULT_FAILURE_URL = prevFailure;
        if (prevPending === undefined) delete process.env.DEFAULT_PENDING_URL;
        else process.env.DEFAULT_PENDING_URL = prevPending;
      }
    });

    it('usa init_point en modo production', async () => {
      (mercadoPagoService.getMode as jest.Mock).mockReturnValue('production');
      (mercadoPagoService.createPreferenceFromVenta as jest.Mock).mockResolvedValue({
        id: 'pref-abc-123',
        init_point: 'https://www.mercadopago.com.ar/init',
        sandbox_init_point: 'https://sandbox.mercadopago.com.ar/init',
      });

      const result = await service.createFromCheckout(buildCheckoutData(), ID_USUARIO);
      expect((result as any).mercadoPagoPreferenceUrl).toBe('https://www.mercadopago.com.ar/init');
    });

    it('normaliza metodo_pago "mp" a mercadopago', async () => {
      await service.createFromCheckout(buildCheckoutData({ metodo_pago: 'mp' }), ID_USUARIO);
      expect(VentasService.prototype.create).toHaveBeenCalledWith(
        expect.objectContaining({ metodo_pago: 'mercadopago' }),
        expect.any(String),
      );
    });

    it('normaliza metodo_pago "mercado_pago" a mercadopago', async () => {
      await service.createFromCheckout(buildCheckoutData({ metodo_pago: 'mercado_pago' }), ID_USUARIO);
      expect(VentasService.prototype.create).toHaveBeenCalledWith(
        expect.objectContaining({ metodo_pago: 'mercadopago' }),
        expect.any(String),
      );
    });
  });

  describe('pago externo (efectivo / transferencia)', () => {
    it.each(['efectivo', 'transferencia'])('envia instrucciones de pago + email pendiente para %s', async (metodo) => {
      const result = await service.createFromCheckout(buildCheckoutData({ metodo_pago: metodo }), ID_USUARIO);

      expect(mercadoPagoService.createPreferenceFromVenta).not.toHaveBeenCalled();
      expect(mailService.sendPaymentInstructions).toHaveBeenCalledTimes(1);
      expect(mailService.sendOrderPending).toHaveBeenCalledTimes(1);
      expect((result as any).mercadoPagoPreferenceUrl).toBeUndefined();
    });
  });

  describe('creacion de cliente', () => {
    it('crea cliente cuando id_cliente existe como usuario pero no como cliente', async () => {
      (prisma.cliente.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.usuarios.findUnique as jest.Mock).mockResolvedValue(buildUsuario());

      await service.createFromCheckout(buildCheckoutData(), ID_USUARIO);

      expect(prisma.cliente.create).toHaveBeenCalledWith({
        data: { id_usuario: ID_USUARIO },
      });
    });

    it('lanza error cuando id_cliente no existe ni como cliente ni como usuario', async () => {
      (prisma.cliente.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.usuarios.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.createFromCheckout(buildCheckoutData(), ID_USUARIO),
      ).rejects.toThrow(/Usuario con id/);

      expect(prisma.cliente.create).not.toHaveBeenCalled();
      expect(VentasService.prototype.create).not.toHaveBeenCalled();
    });
  });

  describe('direccion desde id_direccion guardada', () => {
    it('obtiene direccion guardada y actualiza cliente', async () => {
      await service.createFromCheckout(
        buildCheckoutData({ id_direccion: ID_DIRECCION }),
        ID_USUARIO,
      );

      expect(direccionesService.getById).toHaveBeenCalledWith(ID_DIRECCION, ID_USUARIO);
      expect(prisma.cliente.update).toHaveBeenCalledWith({
        where: { id_usuario: ID_USUARIO },
        data: {
          direccion: 'Calle Falsa',
          altura: '123',
          piso: '2',
          dpto: 'A',
          ciudad: 'Springfield',
          provincia: 'NA',
          cod_postal: 5000,
        },
      });
    });

    it('continua si getById falla (logea warning)', async () => {
      (direccionesService.getById as jest.Mock).mockRejectedValue(new Error('Not found'));

      const result = await service.createFromCheckout(
        buildCheckoutData({ id_direccion: ID_DIRECCION }),
        ID_USUARIO,
      );

      expect(result.id_venta).toBe(ID_VENTA);
    });
  });

  describe('direccion desde datos proporcionados', () => {
    it('actualiza cliente con datos de direccion', async () => {
      const direccion = {
        direccion: 'Av. Siempre Viva',
        altura: '742',
        piso: '3',
        dpto: 'B',
        ciudad: 'CABA',
        provincia: 'BS AS',
        cod_postal: 1425,
      };

      await service.createFromCheckout(
        buildCheckoutData({ direccion, id_direccion: undefined }),
        ID_USUARIO,
      );

      expect(prisma.cliente.update).toHaveBeenCalledWith({
        where: { id_usuario: ID_USUARIO },
        data: {
          direccion: 'Av. Siempre Viva',
          altura: '742',
          piso: '3',
          dpto: 'B',
          ciudad: 'CABA',
          provincia: 'BS AS',
          cod_postal: 1425,
        },
      });
    });

    it('actualiza telefono en usuarios cuando se proporciona en direccion', async () => {
      const direccion = { telefono: '1144445555' };

      await service.createFromCheckout(
        buildCheckoutData({ direccion, id_direccion: undefined }),
        ID_USUARIO,
      );

      expect(prisma.usuarios.update).toHaveBeenCalledWith({
        where: { id_usuario: ID_USUARIO },
        data: { telefono: '1144445555' },
      });
    });

    it('no actualiza cod_postal si es null', async () => {
      const direccion = {
        direccion: 'Av. Siempre Viva',
        cod_postal: null,
      };

      await service.createFromCheckout(
        buildCheckoutData({ direccion, id_direccion: undefined }),
        ID_USUARIO,
      );

      const calls = (prisma.cliente.update as jest.Mock).mock.calls;
      const lastCall = calls[calls.length - 1];
      expect(lastCall[0].data.cod_postal).toBeUndefined();
    });
  });

  describe('actualizacion de documento', () => {
    it('actualiza tipo_documento y numero_documento en usuarios', async () => {
      await service.createFromCheckout(
        buildCheckoutData({ tipo_documento: 'DNI', numero_documento: '12345678' }),
        ID_USUARIO,
      );

      expect(prisma.usuarios.update).toHaveBeenCalledWith({
        where: { id_usuario: ID_USUARIO },
        data: { numero_documento: '12345678', tipo_documento: 'DNI' },
      });
    });
  });

  describe('costo de envio', () => {
    it('crea envio cuando costo_envio > 0 y no existe envio previo', async () => {
      (prisma.envios.findFirst as jest.Mock).mockResolvedValue(null);

      await service.createFromCheckout(
        buildCheckoutData({ costo_envio: 500 }),
        ID_USUARIO,
      );

      expect(prisma.envios.findFirst).toHaveBeenCalledWith({
        where: { id_venta: ID_VENTA },
      });
      expect(prisma.envios.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id_venta: ID_VENTA,
          empresa_envio: 'andreani',
          costo_envio: 500,
          estado_envio: 'pendiente',
        }),
      });
      expect(prisma.envios.update).not.toHaveBeenCalled();
    });

    it('actualiza envio existente cuando ya hay registro', async () => {
      (prisma.envios.findFirst as jest.Mock).mockResolvedValue({ id_envio: 'envio-1' });

      await service.createFromCheckout(
        buildCheckoutData({ costo_envio: 500 }),
        ID_USUARIO,
      );

      expect(prisma.envios.update).toHaveBeenCalledWith({
        where: { id_envio: 'envio-1' },
        data: { costo_envio: 500 },
      });
      expect(prisma.envios.create).not.toHaveBeenCalled();
    });

    it('no crea envio si costo_envio es 0', async () => {
      await service.createFromCheckout(
        buildCheckoutData({ costo_envio: 0 }),
        ID_USUARIO,
      );

      expect(prisma.envios.findFirst).not.toHaveBeenCalled();
      expect(prisma.envios.create).not.toHaveBeenCalled();
      expect(prisma.envios.update).not.toHaveBeenCalled();
    });
  });

  describe('configuracion cuotas sin interes', () => {
    it('respeta defaultInstallments y maxInstallments cuando cuotas activas y cumple minimo', async () => {
      mockGetConfig.mockResolvedValue({ cuotas_sin_interes_activo: true });
      mockGetPaymentInstallmentsConfig.mockResolvedValue({
        cuotasSinInteres: 6,
        cuotasSinInteresMinimo: 10000,
      });
      (VentasService.prototype.create as jest.Mock).mockResolvedValue(
        buildVentaPendiente({ total_neto: 15000 }) as any,
      );

      await service.createFromCheckout(buildCheckoutData(), ID_USUARIO);

      expect(mercadoPagoService.createPreferenceFromVenta).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultInstallments: 6,
          maxInstallments: 6,
        }),
      );
    });

    it('fuerza 1 cuota cuando cuotas_sin_interes_activo es false', async () => {
      mockGetConfig.mockResolvedValue({ cuotas_sin_interes_activo: false });

      await service.createFromCheckout(buildCheckoutData(), ID_USUARIO);

      expect(mercadoPagoService.createPreferenceFromVenta).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultInstallments: undefined,
          maxInstallments: 1,
        }),
      );
    });

    it('fuerza 1 cuota cuando un producto del carrito tiene cuotas_habilitadas=false', async () => {
      (VentasService.prototype.create as jest.Mock).mockResolvedValue(
        buildVentaPendiente({
          detalles: [
            {
              id_detalle: 1,
              id_prod: 10,
              cantidad: 1,
              precio_unitario: 5000,
              sub_total: 5000,
              producto: {
                id_prod: 10,
                nombre: 'Producto Sin Cuotas',
                cuotas_habilitadas: false,
              },
            },
          ],
        }) as any,
      );

      await service.createFromCheckout(buildCheckoutData(), ID_USUARIO);

      expect(mercadoPagoService.createPreferenceFromVenta).toHaveBeenCalledWith(
        expect.objectContaining({
          defaultInstallments: undefined,
          maxInstallments: 1,
        }),
      );
    });
  });

  describe('fallo de preferencia MP', () => {
    it('cancela la venta y lanza error 502', async () => {
      (mercadoPagoService.createPreferenceFromVenta as jest.Mock).mockRejectedValue(
        new Error('MP API error'),
      );

      let error: any;
      try {
        await service.createFromCheckout(buildCheckoutData(), ID_USUARIO);
      } catch (err) {
        error = err;
      }

      expect(error).toBeDefined();
      expect(error.message).toContain('No se pudo iniciar el pago');
      expect(error.statusCode).toBe(502);
      expect(prisma.venta.update).toHaveBeenCalledWith({
        where: { id_venta: ID_VENTA },
        data: expect.objectContaining({
          estado_pago: 'cancelado',
        }),
      });
    });
  });

  describe('emails', () => {
    it('errores de email no interrumpen el flujo (catch)', async () => {
      (mailService.sendOrderPending as jest.Mock).mockRejectedValue(new Error('SMTP error'));

      const result = await service.createFromCheckout(
        buildCheckoutData({ metodo_pago: 'transferencia' }),
        ID_USUARIO,
      );

      expect(result.id_venta).toBe(ID_VENTA);
    });
  });

  describe('evento SALE_CREATED', () => {
    it('emite SALE_CREATED via eventBus', async () => {
      await service.createFromCheckout(buildCheckoutData(), ID_USUARIO);

      expect(eventBus.emit).toHaveBeenCalledWith('SALE_CREATED', expect.any(Object));
      expect(SaleEventFactory.createSaleCreated).toHaveBeenCalledWith(
        expect.objectContaining({
          id_venta: ID_VENTA,
          estado_pago: 'pendiente',
        }),
      );
    });
  });
});
