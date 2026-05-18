/**
 * TESTS: MercadoPagoService — utilidades y createPreferenceFromVenta
 * npm test -- mercado-pago
 */

import { MercadoPagoService } from '../mercado-pago.service';

const mockCreatePreference = jest.fn();

function buildVenta(overrides: Record<string, unknown> = {}) {
  return {
    id_venta: 42,
    total_neto: 1500,
    detalles: [
      {
        id_prod: 10,
        cantidad: 2,
        precio_unitario: 750,
        producto: {
          id_prod: 10,
          nombre: 'Producto Test',
          descripcion: 'Desc',
          img_principal: 'https://cdn.example.com/img.jpg',
        },
      },
    ],
    cliente: {
      usuario: {
        email: 'cliente@test.com',
        nombre: 'Juan',
        apellido: 'Pérez',
        telefono: '23025551234',
      },
    },
    usuario: null,
    ...overrides,
  };
}

const BACK_URLS = {
  success: 'https://shop.example.com/checkout/resultado?status=approved',
  failure: 'https://shop.example.com/checkout/resultado?status=rejected',
  pending: 'https://shop.example.com/checkout/resultado?status=pending',
};

describe('MercadoPagoService — utilidades estáticas', () => {
  it.each([
    ['venta_42', 42],
    ['venta_1', 1],
  ])('extractVentaIdFromExternalReference válido (%s)', (ref, expected) => {
    expect(MercadoPagoService.extractVentaIdFromExternalReference(ref)).toBe(expected);
  });

  it.each([
    ['pedido_42'],
    [''],
    ['venta_abc'],
  ])('extractVentaIdFromExternalReference inválido (%s)', (ref) => {
    expect(MercadoPagoService.extractVentaIdFromExternalReference(ref)).toBeNull();
  });

  it('generateExternalReference', () => {
    expect(MercadoPagoService.generateExternalReference(7)).toBe('venta_7');
  });

  it('isApprovedStatus', () => {
    expect(MercadoPagoService.isApprovedStatus('approved')).toBe(true);
    expect(MercadoPagoService.isApprovedStatus('authorized')).toBe(true);
    expect(MercadoPagoService.isApprovedStatus('pending')).toBe(false);
  });

  it('isPendingStatus', () => {
    expect(MercadoPagoService.isPendingStatus('pending')).toBe(true);
    expect(MercadoPagoService.isPendingStatus('in_process')).toBe(true);
    expect(MercadoPagoService.isPendingStatus('approved')).toBe(false);
  });

  it('isRejectedStatus', () => {
    expect(MercadoPagoService.isRejectedStatus('rejected')).toBe(true);
    expect(MercadoPagoService.isRejectedStatus('refunded')).toBe(true);
    expect(MercadoPagoService.isRejectedStatus('approved')).toBe(false);
  });
});

describe('MercadoPagoService — createPreferenceFromVenta', () => {
  let service: MercadoPagoService;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      MERCADOPAGO_ENV: 'test',
      MERCADOPAGO_ACCESS_TOKEN_TEST: 'TEST-token',
    };
    service = new MercadoPagoService();
    jest.spyOn(service, 'createPreference').mockImplementation(mockCreatePreference);
    mockCreatePreference.mockResolvedValue({
      id: 'pref-123',
      init_point: 'https://mp.com/init',
      sandbox_init_point: 'https://mp.com/sandbox',
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  it('happy path: items, external_reference y moneda ARS', async () => {
    const venta = buildVenta();
    await service.createPreferenceFromVenta({ venta: venta as any, backUrls: BACK_URLS });

    expect(mockCreatePreference).toHaveBeenCalledTimes(1);
    const req = mockCreatePreference.mock.calls[0][0];
    expect(req.items).toHaveLength(1);
    expect(req.items[0].currency_id).toBe('ARS');
    expect(req.items[0].quantity).toBe(2);
    expect(req.external_reference).toBe('venta_42');
    expect(req.back_urls?.success).toBe(BACK_URLS.success);
  });

  it('rechaza total_neto inválido', async () => {
    const venta = buildVenta({ total_neto: 0 });
    await expect(
      service.createPreferenceFromVenta({ venta: venta as any, backUrls: BACK_URLS })
    ).rejects.toThrow(/total_neto/i);
  });

  it('rechaza venta sin detalles', async () => {
    const venta = buildVenta({ detalles: [] });
    await expect(
      service.createPreferenceFromVenta({ venta: venta as any, backUrls: BACK_URLS })
    ).rejects.toThrow(/detalles/i);
  });

  it('ignora imagen local Windows en picture_url', async () => {
    const venta = buildVenta({
      detalles: [
        {
          id_prod: 10,
          cantidad: 1,
          precio_unitario: 100,
          producto: {
            id_prod: 10,
            nombre: 'Local',
            img_principal: 'F:\\images\\prod.jpg',
          },
        },
      ],
    });
    await service.createPreferenceFromVenta({ venta: venta as any, backUrls: BACK_URLS });
    const req = mockCreatePreference.mock.calls[0][0];
    expect(req.items[0].picture_url).toBeUndefined();
  });

  it('sandbox: payer sin email', async () => {
    const venta = buildVenta();
    await service.createPreferenceFromVenta({ venta: venta as any, backUrls: BACK_URLS });
    const req = mockCreatePreference.mock.calls[0][0];
    expect(req.payer?.email).toBeUndefined();
    expect(req.payer?.name).toBe('Juan');
  });

  it('producción: payer con email', async () => {
    process.env.MERCADOPAGO_ENV = 'production';
    process.env.MERCADOPAGO_ACCESS_TOKEN = 'PROD-token';
    const prodService = new MercadoPagoService();
    jest.spyOn(prodService, 'createPreference').mockImplementation(mockCreatePreference);

    const venta = buildVenta();
    await prodService.createPreferenceFromVenta({ venta: venta as any, backUrls: BACK_URLS });
    const req = mockCreatePreference.mock.calls[0][0];
    expect(req.payer?.email).toBe('cliente@test.com');
  });

  it('incluye payment_methods cuando maxInstallments > 1', async () => {
    const venta = buildVenta();
    await service.createPreferenceFromVenta({
      venta: venta as any,
      backUrls: BACK_URLS,
      maxInstallments: 3,
      defaultInstallments: 3,
    });
    const req = mockCreatePreference.mock.calls[0][0];
    expect(req.payment_methods?.installments).toBe(3);
    expect(req.payment_methods?.default_installments).toBe(3);
  });

  it('requiere backUrls.success', async () => {
    const venta = buildVenta();
    await expect(
      service.createPreferenceFromVenta({ venta: venta as any, backUrls: {} })
    ).rejects.toThrow(/back_urls/i);
  });

  it('useAutoReturn agrega auto_return cuando hay success https', async () => {
    const venta = buildVenta();
    await service.createPreferenceFromVenta({
      venta: venta as any,
      backUrls: BACK_URLS,
      useAutoReturn: true,
    });
    const req = mockCreatePreference.mock.calls[0][0];
    expect(req.auto_return).toBe('approved');
  });
});
