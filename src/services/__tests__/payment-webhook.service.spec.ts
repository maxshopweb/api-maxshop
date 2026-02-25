/**
 * =============================================================================
 * TESTS: PaymentWebhookService — Procesamiento de webhooks de Mercado Pago
 * =============================================================================
 *
 * OBJETIVO: Garantizar que el flujo de pagos sea idempotente, sin duplicados
 * y que los errores no rompan la respuesta a MP (siempre 200).
 *
 * CÓMO EJECUTAR:
 *   npm test -- payment-webhook
 *   npm test -- --watch
 */

import { PaymentWebhookService } from '../payment-webhook.service';
import { MercadoPagoPaymentResponse } from '../mercado-pago.service';

// -----------------------------------------------------------------------------
// Mocks (factory sin referencias externas por hoisting de Jest)
// -----------------------------------------------------------------------------
jest.mock('../../index', () => ({
  prisma: {
    venta: { findUnique: jest.fn(), update: jest.fn() },
    mercado_pago_payments: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    failed_webhooks: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  },
}));
jest.mock('../mercado-pago.service', () => ({
  mercadoPagoService: { getPayment: jest.fn() },
  MercadoPagoService: { extractVentaIdFromExternalReference: jest.fn() },
}));
jest.mock('../payment-processing.service', () => ({
  paymentProcessingService: { confirmPayment: jest.fn() },
}));

const { prisma } = require('../../index');
const { mercadoPagoService, MercadoPagoService } = require('../mercado-pago.service');
const { paymentProcessingService } = require('../payment-processing.service');

// -----------------------------------------------------------------------------
// Datos de prueba
// -----------------------------------------------------------------------------
const PAYMENT_ID = '123456789';
const ID_VENTA = 100;

function buildWebhook(opts: { action?: string; type?: string; id?: string | number } = {}) {
  return {
    action: opts.action ?? 'payment.updated',
    data: { id: opts.id ?? PAYMENT_ID },
    type: opts.type ?? 'payment',
  };
}

function buildMpPayment(overrides: Partial<MercadoPagoPaymentResponse> = {}): MercadoPagoPaymentResponse {
  return {
    id: Number(PAYMENT_ID),
    status: 'approved',
    external_reference: `venta_${ID_VENTA}`,
    date_created: '2025-01-01T12:00:00Z',
    date_approved: '2025-01-01T12:01:00Z',
    date_last_updated: '2025-01-01T12:01:00Z',
    money_release_date: null,
    operation_type: 'regular_payment',
    issuer_id: null,
    payment_method_id: 'visa',
    payment_type_id: 'credit_card',
    status_detail: 'accredited',
    currency_id: 'ARS',
    description: null,
    live_mode: true,
    sponsor_id: null,
    authorization_code: null,
    money_release_schema: null,
    collector_id: 1,
    payer: {
      id: 1,
      email: 'comprador@test.com',
      identification: { type: 'DNI', number: '12345678' },
      first_name: 'Test',
      last_name: 'User',
      phone: null,
    },
    metadata: {},
    additional_info: null,
    order: null,
    transaction_amount: 5000,
    transaction_amount_refunded: 0,
    coupon_amount: 0,
    differential_pricing_id: null,
    deduction_schema: null,
    transaction_details: {
      payment_method_reference_id: null,
      net_received_amount: 4800,
      total_paid_amount: 5000,
      overpaid_amount: 0,
      external_resource_url: null,
      installment_amount: 5000,
      financial_institution: null,
      payable_deferral_period: null,
    },
    fee_details: [],
    captured: true,
    binary_mode: false,
    call_for_authorize_id: null,
    statement_descriptor: null,
    installments: 1,
    preference_id: null,
    ...overrides,
  } as MercadoPagoPaymentResponse;
}

describe('PaymentWebhookService', () => {
  let service: PaymentWebhookService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PaymentWebhookService();
    (MercadoPagoService.extractVentaIdFromExternalReference as jest.Mock).mockImplementation((ref: string) => {
      const m = ref.match(/^venta_(\d+)$/);
      return m ? parseInt(m[1], 10) : null;
    });
  });

  afterEach(() => {
    service.destroy();
  });

  afterAll(() => {
    const { paymentWebhookService: singleton } = require('../payment-webhook.service');
    if (singleton && typeof singleton.destroy === 'function') singleton.destroy();
  });

  describe('validación de estructura', () => {
    it('retorna success: false si falta action o data.id', async () => {
      const r1 = await service.processWebhook({ action: '', data: { id: PAYMENT_ID }, type: 'payment' });
      expect(r1.success).toBe(false);
      expect(r1.error).toContain('Invalid');

      const r2 = await service.processWebhook({ action: 'payment.updated', data: {} as any, type: 'payment' });
      expect(r2.success).toBe(false);
    });

    it('ignora eventos que no son type=payment (retorna success sin procesar)', async () => {
      const r = await service.processWebhook(buildWebhook({ type: 'merchant_order' }));
      expect(r.success).toBe(true);
      expect(r.action).toBe('skipped');
      expect(mercadoPagoService.getPayment).not.toHaveBeenCalled();
    });

    it('ignora acciones que no incluyen "payment"', async () => {
      const r = await service.processWebhook(buildWebhook({ action: 'order.updated' }));
      expect(r.success).toBe(true);
      expect(r.action).toBe('skipped');
      expect(mercadoPagoService.getPayment).not.toHaveBeenCalled();
    });
  });

  describe('idempotencia', () => {
    it('NO procesa dos veces el mismo paymentId con el mismo status (skipped)', async () => {
      mercadoPagoService.getPayment.mockResolvedValue(buildMpPayment());
      prisma.venta.findUnique.mockResolvedValue({ id_venta: ID_VENTA, estado_pago: 'pendiente' });
      prisma.mercado_pago_payments.findUnique.mockResolvedValue({
        id: 1,
        status_mp: 'approved',
        updated_at: new Date(),
      });

      const r1 = await service.processWebhook(buildWebhook());
      expect(r1.success).toBe(true);
      expect(r1.action).toBe('skipped');
      expect(paymentProcessingService.confirmPayment).not.toHaveBeenCalled();

      const r2 = await service.processWebhook(buildWebhook());
      expect(r2.success).toBe(true);
      expect(r2.action).toBe('skipped');
      expect(paymentProcessingService.confirmPayment).not.toHaveBeenCalled();
    });

    it('SÍ procesa si el pago existe pero con otro status (updated)', async () => {
      mercadoPagoService.getPayment.mockResolvedValue(buildMpPayment({ status: 'approved' }));
      prisma.venta.findUnique.mockResolvedValue({ id_venta: ID_VENTA, estado_pago: 'pendiente' });
      prisma.mercado_pago_payments.findUnique.mockResolvedValue({
        id: 1,
        status_mp: 'pending',
        updated_at: new Date(),
      });
      prisma.mercado_pago_payments.update.mockResolvedValue({});
      prisma.venta.update.mockResolvedValue({});
      paymentProcessingService.confirmPayment.mockResolvedValue({});

      const r = await service.processWebhook(buildWebhook());
      expect(r.success).toBe(true);
      expect(r.action).toBe('updated');
      expect(paymentProcessingService.confirmPayment).toHaveBeenCalledWith(ID_VENTA, expect.any(Object));
    });
  });

  describe('flujo aprobado', () => {
    beforeEach(() => {
      mercadoPagoService.getPayment.mockResolvedValue(buildMpPayment());
      prisma.venta.findUnique.mockResolvedValue({ id_venta: ID_VENTA, estado_pago: 'pendiente' });
      prisma.mercado_pago_payments.findUnique.mockResolvedValue(null);
      prisma.mercado_pago_payments.create.mockResolvedValue({});
      prisma.venta.update.mockResolvedValue({});
      paymentProcessingService.confirmPayment.mockResolvedValue({});
    });

    it('llama a confirmPayment cuando MP devuelve approved', async () => {
      const r = await service.processWebhook(buildWebhook());
      expect(r.success).toBe(true);
      expect(r.action).toBe('created');
      expect(r.ventaId).toBe(ID_VENTA);
      expect(paymentProcessingService.confirmPayment).toHaveBeenCalledWith(ID_VENTA, expect.objectContaining({
        metodoPago: 'mercadopago',
        transactionId: PAYMENT_ID,
      }));
    });

    it('guarda el pago en mercado_pago_payments con payment_id y venta_id correctos', async () => {
      await service.processWebhook(buildWebhook());
      expect(prisma.mercado_pago_payments.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          payment_id: PAYMENT_ID,
          venta_id: ID_VENTA,
          status_mp: 'approved',
          external_reference: `venta_${ID_VENTA}`,
        }),
      });
    });
  });

  describe('flujo rechazado', () => {
    it('NO llama a confirmPayment cuando MP devuelve rejected', async () => {
      mercadoPagoService.getPayment.mockResolvedValue(buildMpPayment({ status: 'rejected' }));
      prisma.venta.findUnique.mockResolvedValue({ id_venta: ID_VENTA, estado_pago: 'pendiente' });
      prisma.mercado_pago_payments.findUnique.mockResolvedValue(null);
      prisma.mercado_pago_payments.create.mockResolvedValue({});
      prisma.venta.update.mockResolvedValue({});

      const r = await service.processWebhook(buildWebhook());
      expect(r.success).toBe(true);
      expect(paymentProcessingService.confirmPayment).not.toHaveBeenCalled();
      expect(prisma.venta.update).toHaveBeenCalledWith({
        where: { id_venta: ID_VENTA },
        data: expect.objectContaining({ estado_pago: 'rechazado' }),
      });
    });
  });

  describe('manejo de errores', () => {
    it('guarda en failed_webhooks cuando getPayment falla y retorna success: false', async () => {
      mercadoPagoService.getPayment.mockResolvedValue(null);
      prisma.failed_webhooks.findFirst.mockResolvedValue(null);
      prisma.failed_webhooks.create.mockResolvedValue({});

      const r = await service.processWebhook(buildWebhook());
      expect(r.success).toBe(false);
      expect(r.error).toBeDefined();
      expect(prisma.failed_webhooks.create).toHaveBeenCalled();
    });

    it('retorna success: false sin lanzar excepción (para responder 200 a MP)', async () => {
      mercadoPagoService.getPayment.mockRejectedValue(new Error('Network error'));
      prisma.failed_webhooks.findFirst.mockResolvedValue(null);
      prisma.failed_webhooks.create.mockResolvedValue({});

      const r = await service.processWebhook(buildWebhook());
      expect(r.success).toBe(false);
      expect(r.paymentId).toBe(PAYMENT_ID);
      expect(r.action).toBe('skipped');
    });

    it('skipped cuando external_reference está vacío', async () => {
      mercadoPagoService.getPayment.mockResolvedValue(buildMpPayment({ external_reference: null }));
      const r = await service.processWebhook(buildWebhook());
      expect(r.success).toBe(true);
      expect(r.action).toBe('skipped');
      expect(r.error).toContain('external_reference');
    });

    it('skipped cuando no se puede extraer idVenta del external_reference', async () => {
      mercadoPagoService.getPayment.mockResolvedValue(buildMpPayment({ external_reference: 'venta_999' }));
      MercadoPagoService.extractVentaIdFromExternalReference.mockReturnValue(null);
      const r = await service.processWebhook(buildWebhook());
      expect(r.success).toBe(true);
      expect(r.action).toBe('skipped');
      expect(r.error).toContain('external_reference');
    });

    it('lanza y guarda en failed_webhooks cuando la venta no existe', async () => {
      mercadoPagoService.getPayment.mockResolvedValue(buildMpPayment());
      prisma.venta.findUnique.mockResolvedValue(null);
      prisma.failed_webhooks.findFirst.mockResolvedValue(null);
      prisma.failed_webhooks.create.mockResolvedValue({});

      const r = await service.processWebhook(buildWebhook());
      expect(r.success).toBe(false);
      expect(prisma.failed_webhooks.create).toHaveBeenCalled();
    });
  });

  describe('lock de procesamiento', () => {
    it('el segundo webhook del mismo paymentId mientras el primero corre retorna skipped (lock activo)', async () => {
      mercadoPagoService.getPayment.mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(buildMpPayment()), 50)));
      prisma.venta.findUnique.mockResolvedValue({ id_venta: ID_VENTA, estado_pago: 'pendiente' });
      prisma.mercado_pago_payments.findUnique.mockResolvedValue(null);
      prisma.mercado_pago_payments.create.mockResolvedValue({});
      prisma.venta.update.mockResolvedValue({});
      paymentProcessingService.confirmPayment.mockImplementation(() => new Promise((r) => setTimeout(r, 100)));

      const [r1, r2] = await Promise.all([
        service.processWebhook(buildWebhook()),
        service.processWebhook(buildWebhook()),
      ]);

      const skipped = r1.action === 'skipped' ? r1 : r2;
      const processed = r1.action !== 'skipped' ? r1 : r2;
      expect(skipped.action).toBe('skipped');
      expect(processed.action).toBe('created');
      expect(paymentProcessingService.confirmPayment).toHaveBeenCalledTimes(1);
    });
  });
});
