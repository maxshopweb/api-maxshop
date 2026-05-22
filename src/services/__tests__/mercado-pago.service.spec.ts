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
        sub_total: 1500,
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

describe('MercadoPagoService — pricing estático', () => {
  it('getDetalleUnitPriceForMp usa sub_total / cantidad', () => {
    expect(
      MercadoPagoService.getDetalleUnitPriceForMp({
        id_detalle: 1,
        cantidad: 1,
        precio_unitario: 1210,
        descuento_aplicado: 121,
        sub_total: 1089,
      } as any)
    ).toBe(1089);
  });

  it('buildPreferenceItemsFromVenta valida total_neto', () => {
    const venta = {
      id_venta: 1,
      total_neto: 1089,
      detalles: [
        {
          id_prod: 1,
          cantidad: 1,
          precio_unitario: 1210,
          sub_total: 1089,
          producto: { nombre: 'P' },
        },
      ],
    };
    const items = MercadoPagoService.buildPreferenceItemsFromVenta(venta as any, 1089);
    expect(items[0].unit_price).toBe(1089);
  });
});

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
    expect(req.items[0].unit_price).toBe(750);
    expect(req.external_reference).toBe('venta_42');
    expect(req.back_urls?.success).toBe(BACK_URLS.success);
  });

  it('cobra precio final con bonificación (caso venta #49: lista 1210, boni 121, paga 1089)', async () => {
    const venta = buildVenta({
      id_venta: 49,
      total_neto: 1089,
      detalles: [
        {
          id_prod: 8182,
          cantidad: 1,
          precio_unitario: 1210,
          descuento_aplicado: 121,
          sub_total: 1089,
          bonificacion_porcentaje: 10,
          producto: { id_prod: 8182, nombre: 'HIDROLAVADORA' },
        },
      ],
    });
    await service.createPreferenceFromVenta({ venta: venta as any, backUrls: BACK_URLS });
    const req = mockCreatePreference.mock.calls[0][0];
    expect(req.items[0].unit_price).toBe(1089);
    expect(req.items[0].quantity).toBe(1);
    expect(req.items[0].unit_price * req.items[0].quantity).toBe(1089);
  });

  it('rechaza si suma de ítems no coincide con total_neto', async () => {
    const venta = buildVenta({
      total_neto: 50,
      detalles: [
        {
          id_prod: 10,
          cantidad: 1,
          precio_unitario: 100,
          sub_total: 100,
          producto: { id_prod: 10, nombre: 'X' },
        },
      ],
    });
    await expect(
      service.createPreferenceFromVenta({ venta: venta as any, backUrls: BACK_URLS })
    ).rejects.toThrow(/no coincide con total_neto/i);
    expect(mockCreatePreference).not.toHaveBeenCalled();
  });

  it('agrega ítem Envío cuando total_neto incluye costo de envío', async () => {
    const venta = buildVenta({
      total_neto: 1600,
      detalles: [
        {
          id_prod: 10,
          cantidad: 1,
          precio_unitario: 1500,
          sub_total: 1500,
          producto: { id_prod: 10, nombre: 'Prod' },
        },
      ],
    });
    await service.createPreferenceFromVenta({ venta: venta as any, backUrls: BACK_URLS });
    const req = mockCreatePreference.mock.calls[0][0];
    expect(req.items).toHaveLength(2);
    expect(req.items[1].title).toBe('Envío');
    expect(req.items[1].unit_price).toBe(100);
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
      total_neto: 100,
      detalles: [
        {
          id_prod: 10,
          cantidad: 1,
          precio_unitario: 100,
          sub_total: 100,
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
