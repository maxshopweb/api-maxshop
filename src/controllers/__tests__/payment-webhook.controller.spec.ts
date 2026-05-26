import { Request, Response } from 'express';
import { paymentWebhookController } from '../payment-webhook.controller';

const mockProcessWebhook = jest.fn();
const mockProcessManualPayment = jest.fn();
const mockGetStats = jest.fn();
const mockGetPendingRetries = jest.fn();
const mockGetPermanentlyFailed = jest.fn();
const mockRetrySpecificWebhook = jest.fn();
const mockResetFailedWebhook = jest.fn();
const mockGetWebhookSummary = jest.fn();
const mockGetStatsRetry = jest.fn();
const mockRecord = jest.fn();

jest.mock('../../services/payment-webhook.service', () => ({
  paymentWebhookService: {
    processWebhook: (...args: unknown[]) => mockProcessWebhook(...args),
    processManualPayment: (...args: unknown[]) => mockProcessManualPayment(...args),
    getStats: (...args: unknown[]) => mockGetStats(...args),
  },
}));

jest.mock('../../services/failed-webhook-retry.service', () => ({
  failedWebhookRetryService: {
    getPendingRetries: (...args: unknown[]) => mockGetPendingRetries(...args),
    getPermanentlyFailed: (...args: unknown[]) => mockGetPermanentlyFailed(...args),
    retrySpecificWebhook: (...args: unknown[]) => mockRetrySpecificWebhook(...args),
    resetFailedWebhook: (...args: unknown[]) => mockResetFailedWebhook(...args),
    getWebhookSummary: (...args: unknown[]) => mockGetWebhookSummary(...args),
    getStats: (...args: unknown[]) => mockGetStatsRetry(...args),
  },
}));

jest.mock('../../services/audit.service', () => ({
  auditService: {
    record: (...args: unknown[]) => mockRecord(...args),
  },
}));

function mockReq(overrides: Record<string, unknown> = {}): Request {
  return {
    body: {},
    query: {},
    params: {},
    headers: {},
    originalUrl: '/api/webhooks/mercadopago',
    ...overrides,
  } as any;
}

function mockRes(): Response {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res as Response;
}

describe('PaymentWebhookController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockProcessWebhook.mockResolvedValue({ success: true, paymentId: '123', action: 'created' });
    mockProcessManualPayment.mockResolvedValue({ success: true, paymentId: '123', action: 'created' });
    mockGetStats.mockResolvedValue({
      totalProcessed: 10,
      pendingRetries: 2,
      failedPermanently: 1,
      byStatus: { approved: 5, pending: 3, rejected: 2 },
    });
    mockGetPendingRetries.mockResolvedValue([{ id: 1, payment_id: '456' }]);
    mockGetPermanentlyFailed.mockResolvedValue([{ id: 2, payment_id: '789' }]);
    mockRetrySpecificWebhook.mockResolvedValue(true);
    mockResetFailedWebhook.mockResolvedValue(undefined);
    mockGetWebhookSummary.mockResolvedValue({ pending: 2, failed: 1, completed: 10, processing: 0, total: 13 });
    mockGetStatsRetry.mockReturnValue({
      isRunning: false,
      lastRun: new Date(),
      totalProcessed: 5,
      totalSucceeded: 3,
      totalFailed: 2,
    });
    mockRecord.mockResolvedValue(undefined);
  });

  describe('handleWebhook', () => {
    it('responde 200 para payment webhook estándar y procesa async', async () => {
      const req = mockReq({
        body: { action: 'payment.updated', data: { id: '123' }, type: 'payment' },
      });
      const res = mockRes();

      await paymentWebhookController.handleWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(mockProcessWebhook).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'payment.updated', data: { id: '123' } })
      );
    });

    it('responde 200 para merchant_order y procesa async', async () => {
      const req = mockReq({
        query: { topic: 'merchant_order', id: 'order-456' },
      });
      const res = mockRes();

      await paymentWebhookController.handleWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ received: true, type: 'merchant_order' })
      );
    });

    it('responde 200 cuando falta data.id', async () => {
      const req = mockReq({ body: {} });
      const res = mockRes();

      await paymentWebhookController.handleWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ received: true, warning: 'No data.id found' })
      );
      expect(mockProcessWebhook).not.toHaveBeenCalled();
    });
  });

  describe('processManualPayment', () => {
    it('procesa pago manual exitosamente', async () => {
      const req = mockReq({
        params: { paymentId: '123' },
        authenticatedUser: { id: 'user-1' },
      });
      const res = mockRes();

      await paymentWebhookController.processManualPayment(req, res);

      expect(mockProcessManualPayment).toHaveBeenCalledWith('123');
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('rechaza sin paymentId', async () => {
      const req = mockReq({ params: {} });
      const res = mockRes();

      await paymentWebhookController.processManualPayment(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('getStats', () => {
    it('retorna estadísticas combinadas', async () => {
      const req = mockReq();
      const res = mockRes();

      await paymentWebhookController.getStats(req, res);

      expect(mockGetStats).toHaveBeenCalled();
      expect(mockGetStatsRetry).toHaveBeenCalled();
      expect(mockGetWebhookSummary).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('getFailedWebhooks', () => {
    it('retorna pending cuando status=pending', async () => {
      const req = mockReq({ query: { status: 'pending' } });
      const res = mockRes();

      await paymentWebhookController.getFailedWebhooks(req, res);

      expect(mockGetPendingRetries).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('retorna failed cuando status=failed', async () => {
      const req = mockReq({ query: { status: 'failed' } });
      const res = mockRes();

      await paymentWebhookController.getFailedWebhooks(req, res);

      expect(mockGetPermanentlyFailed).toHaveBeenCalled();
    });

    it('retorna ambos sin filtro', async () => {
      const req = mockReq();
      const res = mockRes();

      await paymentWebhookController.getFailedWebhooks(req, res);

      expect(mockGetPendingRetries).toHaveBeenCalled();
      expect(mockGetPermanentlyFailed).toHaveBeenCalled();
    });
  });

  describe('retryWebhook', () => {
    it('reintenta webhook exitosamente', async () => {
      const req = mockReq({
        params: { webhookId: '1' },
        authenticatedUser: { id: 'user-1' },
      });
      const res = mockRes();

      await paymentWebhookController.retryWebhook(req, res);

      expect(mockRetrySpecificWebhook).toHaveBeenCalledWith(BigInt(1));
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('rechaza sin webhookId', async () => {
      const req = mockReq({ params: {} });
      const res = mockRes();

      await paymentWebhookController.retryWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('resetWebhook', () => {
    it('resetea webhook exitosamente', async () => {
      const req = mockReq({
        params: { webhookId: '1' },
        authenticatedUser: { id: 'user-1' },
      });
      const res = mockRes();

      await paymentWebhookController.resetWebhook(req, res);

      expect(mockResetFailedWebhook).toHaveBeenCalledWith(BigInt(1));
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('rechaza sin webhookId', async () => {
      const req = mockReq({ params: {} });
      const res = mockRes();

      await paymentWebhookController.resetWebhook(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('healthCheck', () => {
    it('retorna healthy', async () => {
      const req = mockReq();
      const res = mockRes();

      await paymentWebhookController.healthCheck(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'healthy' })
      );
    });
  });
});
