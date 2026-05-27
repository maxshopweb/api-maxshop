import { Request, Response } from 'express';
import { VentasController } from '../ventas.controller';

const mockGetAll = jest.fn();
const mockGetById = jest.fn();
const mockCreate = jest.fn();
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockCreateFromCheckout = jest.fn();
const mockUpdateEstadoPago = jest.fn();
const mockUpdateEstadoEnvio = jest.fn();
const mockUpdateEnvio = jest.fn();
const mockGetMyPedidos = jest.fn();
const mockGetStats = jest.fn();
const mockExportVentasCsv = jest.fn();
const mockExportVentasExcel = jest.fn();
const mockConfirmPayment = jest.fn();

jest.mock('../../services/ventas.service', () => ({
  VentasService: jest.fn().mockImplementation(() => ({
    getAll: (...args: unknown[]) => mockGetAll(...args),
    getById: (...args: unknown[]) => mockGetById(...args),
    create: (...args: unknown[]) => mockCreate(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
    delete: (...args: unknown[]) => mockDelete(...args),
    createFromCheckout: (...args: unknown[]) => mockCreateFromCheckout(...args),
    updateEstadoPago: (...args: unknown[]) => mockUpdateEstadoPago(...args),
    updateEstadoEnvio: (...args: unknown[]) => mockUpdateEstadoEnvio(...args),
    updateEnvio: (...args: unknown[]) => mockUpdateEnvio(...args),
    getMyPedidos: (...args: unknown[]) => mockGetMyPedidos(...args),
    getStats: (...args: unknown[]) => mockGetStats(...args),
    exportVentasCsv: (...args: unknown[]) => mockExportVentasCsv(...args),
    exportVentasExcel: (...args: unknown[]) => mockExportVentasExcel(...args),
  })),
}));

jest.mock('../../services/payment-processing.service', () => ({
  paymentProcessingService: {
    confirmPayment: (...args: unknown[]) => mockConfirmPayment(...args),
  },
}));

function mockReq(overrides: Record<string, unknown> = {}): Request {
  return { body: {}, query: {}, params: {}, headers: {}, ...overrides } as any;
}

function mockRes(): Response {
  const res: Partial<Response> = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res as Response;
}

const controller = new VentasController();

describe('VentasController', () => {
  const fakeVenta = { id_venta: 1, total_neto: 1000, estado_pago: 'pendiente' };
  const fakePaginated = { data: [fakeVenta], total: 1, page: 1, limit: 25, totalPages: 1 };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAll.mockResolvedValue(fakePaginated);
    mockGetById.mockResolvedValue(fakeVenta);
    mockCreate.mockResolvedValue(fakeVenta);
    mockUpdate.mockResolvedValue(fakeVenta);
    mockDelete.mockResolvedValue(undefined);
    mockCreateFromCheckout.mockResolvedValue(fakeVenta);
    mockUpdateEstadoPago.mockResolvedValue(fakeVenta);
    mockUpdateEstadoEnvio.mockResolvedValue(fakeVenta);
    mockUpdateEnvio.mockResolvedValue(fakeVenta);
    mockGetMyPedidos.mockResolvedValue(fakePaginated);
    mockGetStats.mockResolvedValue({ total: 10, amount: 50000 });
    mockExportVentasCsv.mockResolvedValue(Buffer.from('csv,data'));
    mockExportVentasExcel.mockResolvedValue({
      buffer: Buffer.from('xlsx'),
      filename: 'Ventas-2025-01-01.xlsx',
      ventasCount: 2,
      rowsCount: 3,
    });
    mockConfirmPayment.mockResolvedValue(fakeVenta);
  });

  describe('getAll', () => {
    it('retorna lista paginada', async () => {
      const req = mockReq({ query: { page: '1', limit: '10' } });
      const res = mockRes();

      await controller.getAll(req, res);

      expect(mockGetAll).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 10 }));
      expect(res.json).toHaveBeenCalledWith(fakePaginated);
    });
  });

  describe('getById', () => {
    it('retorna venta por ID', async () => {
      const req = mockReq({ params: { id: '1' } });
      const res = mockRes();

      await controller.getById(req, res);

      expect(mockGetById).toHaveBeenCalledWith(1);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('retorna 400 para ID inválido', async () => {
      const req = mockReq({ params: { id: 'abc' } });
      const res = mockRes();

      await controller.getById(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('create', () => {
    it('crea venta exitosamente', async () => {
      const req = mockReq({ body: { detalles: [{ id_prod: 1, cantidad: 2 }] } });
      const res = mockRes();

      await controller.create(req, res);

      expect(mockCreate).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('rechaza sin detalles', async () => {
      const req = mockReq({ body: {} });
      const res = mockRes();

      await controller.create(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('createFromCheckout', () => {
    it('crea pedido desde checkout', async () => {
      const req = mockReq({
        body: { metodo_pago: 'mercadopago', detalles: [{ id_prod: 1, cantidad: 1 }] },
        authenticatedUser: { id: 'user-1' },
      });
      const res = mockRes();

      await controller.createFromCheckout(req, res);

      expect(mockCreateFromCheckout).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('rechaza sin metodo_pago', async () => {
      const req = mockReq({ body: { detalles: [{ id_prod: 1, cantidad: 1 }] } });
      const res = mockRes();

      await controller.createFromCheckout(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('confirmarPago', () => {
    it('confirma pago exitosamente', async () => {
      const req = mockReq({ params: { id: '1' }, body: { notas: 'Pagado' } });
      const res = mockRes();

      await controller.confirmarPago(req, res);

      expect(mockConfirmPayment).toHaveBeenCalledWith(1, expect.objectContaining({ notas: expect.stringContaining('Pagado') }));
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('rechaza ID inválido', async () => {
      const req = mockReq({ params: { id: 'abc' } });
      const res = mockRes();

      await controller.confirmarPago(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('updateEstadoPago', () => {
    it('actualiza estado de pago', async () => {
      const req = mockReq({ params: { id: '1' }, body: { estado_pago: 'aprobado' } });
      const res = mockRes();

      await controller.updateEstadoPago(req, res);

      expect(mockUpdateEstadoPago).toHaveBeenCalledWith(1, 'aprobado');
    });
  });

  describe('getMyPedidos', () => {
    it('retorna pedidos del usuario autenticado', async () => {
      const req = mockReq({ authenticatedUser: { id: 'user-1' } });
      const res = mockRes();

      await controller.getMyPedidos(req, res);

      expect(mockGetMyPedidos).toHaveBeenCalledWith('user-1', expect.any(Object));
    });

    it('retorna 401 sin autenticación', async () => {
      const req = mockReq();
      const res = mockRes();

      await controller.getMyPedidos(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('getStats', () => {
    it('retorna estadísticas', async () => {
      const req = mockReq();
      const res = mockRes();

      await controller.getStats(req, res);

      expect(mockGetStats).toHaveBeenCalled();
    });
  });

  describe('exportVentas', () => {
    it('exporta CSV', async () => {
      const req = mockReq({ query: { ids: '1,2,3' } });
      const res = mockRes();

      await controller.exportVentas(req, res);

      expect(mockExportVentasCsv).toHaveBeenCalledWith([1, 2, 3]);
    });

    it('rechaza sin ids', async () => {
      const req = mockReq({ query: {} });
      const res = mockRes();

      await controller.exportVentas(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('exportVentasExcel', () => {
    it('exporta Excel filtrado con headers correctos', async () => {
      const req = mockReq({ body: { fecha_desde: '2025-01-01', cod_interno: 'MAX-1' } });
      const res = mockRes();

      await controller.exportVentasExcel(req, res);

      expect(mockExportVentasExcel).toHaveBeenCalledWith({
        fecha_desde: '2025-01-01',
        cod_interno: 'MAX-1',
      });
      expect(res.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      expect(res.send).toHaveBeenCalledWith(Buffer.from('xlsx'));
    });

    it('retorna 413 cuando hay demasiadas ventas', async () => {
      mockExportVentasExcel.mockRejectedValue(new Error('Demasiadas ventas (6000). Refiná los filtros.'));
      const req = mockReq({ body: {} });
      const res = mockRes();

      await controller.exportVentasExcel(req, res);

      expect(res.status).toHaveBeenCalledWith(413);
    });
  });
});
