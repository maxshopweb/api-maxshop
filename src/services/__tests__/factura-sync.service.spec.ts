/**
 * =============================================================================
 * TESTS: FacturaSyncService — Sincronización de facturas desde FTP (Tekno)
 * =============================================================================
 *
 * OBJETIVO: Matching de facturas (F4-0004-{cod_interno}.pdf o id_venta 8 dígitos),
 * envío de emails, limpieza FTP, actualización de intentos.
 *
 * CÓMO EJECUTAR:
 *   npm test -- factura-sync
 *   npm test -- --watch
 */

import { FacturaSyncService } from '../factura-sync.service';
import type { FileInfo } from 'basic-ftp';

// -----------------------------------------------------------------------------
// Mocks (inline en factories por hoisting de Jest)
// -----------------------------------------------------------------------------
jest.mock('../../index', () => ({
  prisma: {
    ventas_pendientes_factura: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    venta: { findUnique: jest.fn(), update: jest.fn() },
  },
}));
jest.mock('../ftp.service', () => ({
  __esModule: true,
  default: {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    listFiles: jest.fn().mockResolvedValue([]),
    downloadExcel: jest.fn().mockResolvedValue(undefined),
    deleteFile: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('../../mail/mail.service', () => ({
  __esModule: true,
  default: {
    sendEmailWithAttachment: jest.fn().mockResolvedValue(undefined),
    sendShippingSent: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('../audit.service', () => ({ auditService: { record: jest.fn().mockResolvedValue(undefined) } }));

const { prisma } = require('../../index');
const ftpService = require('../ftp.service').default;
const mailService = require('../../mail/mail.service').default;
const { auditService } = require('../audit.service');

jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

/** Objeto mínimo que cumple lo que usa FacturaSyncService (archivo.name) */
function fileInfo(name: string): FileInfo {
  return { name, size: 0, rawModifiedAt: '' } as unknown as FileInfo;
}

/** Venta tal como la devuelve Prisma findUnique (include cliente.usuarios, usuarios, envios) */
function buildVentaPrisma(overrides: Record<string, unknown> = {}) {
  return {
    id_venta: 1,
    total_neto: 1000,
    metodo_pago: 'mercadopago',
    estado_pago: 'aprobado',
    estado_envio: 'pendiente',
    tipo_venta: 'web',
    direcciones: [],
    usuarios: null,
    cliente: {
      usuarios: {
        email: 'cliente@test.com',
        nombre: 'Cliente',
        apellido: 'Test',
        estado: 'activo',
      },
    },
    envios: [{ cod_seguimiento: 'ANDREANI-123', costo_envio: 500, estado_envio: 'preparando' }],
    ...overrides,
  };
}

describe('FacturaSyncService', () => {
  let service: FacturaSyncService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FacturaSyncService();
    const fs = require('fs');
    fs.existsSync.mockReturnValue(true);
  });

  describe('syncFacturasPendientes', () => {
    it('retorna procesadas=0 si no hay ventas pendientes y no conecta FTP', async () => {
      prisma.ventas_pendientes_factura.findMany.mockResolvedValue([]);

      const r = await service.syncFacturasPendientes();

      expect(r.procesadas).toBe(0);
      expect(r.noEncontradas).toBe(0);
      expect(r.errores).toBe(0);
      expect(ftpService.connect).not.toHaveBeenCalled();
    });

    it('conecta y desconecta FTP una vez cuando hay ventas pendientes', async () => {
      prisma.ventas_pendientes_factura.findMany.mockResolvedValue([
        {
          id: 1,
          venta_id: 1,
          fecha_creacion: new Date(),
          fecha_ultimo_intento: null,
          intentos: 0,
          estado: 'pendiente',
          error_mensaje: null,
          factura_encontrada: false,
          factura_nombre_archivo: null,
          procesado_en: null,
          venta: { cod_interno: '001' },
        },
      ]);
      ftpService.listFiles.mockResolvedValue([fileInfo('F4-0004-001.pdf')]);
      prisma.ventas_pendientes_factura.update.mockResolvedValue({});
      prisma.venta.findUnique.mockResolvedValue(buildVentaPrisma({ id_venta: 1 }));
      ftpService.downloadExcel.mockResolvedValue(undefined);
      prisma.venta.update.mockResolvedValue({});

      const r = await service.syncFacturasPendientes();

      expect(ftpService.connect).toHaveBeenCalledTimes(1);
      expect(ftpService.disconnect).toHaveBeenCalledTimes(1);
      expect(r.procesadas).toBe(1);
      expect(mailService.sendEmailWithAttachment).toHaveBeenCalled();
      expect(mailService.sendShippingSent).toHaveBeenCalled();
      expect(ftpService.deleteFile).toHaveBeenCalledWith(expect.stringContaining('F4-0004-001.pdf'));
    });

    it('encuentra factura por cod_interno (formato F4-0004-{cod}.pdf)', async () => {
      prisma.ventas_pendientes_factura.findMany.mockResolvedValue([
        {
          id: 1,
          venta_id: 10,
          venta: { cod_interno: '12345' },
          estado: 'pendiente',
          intentos: 0,
          fecha_creacion: new Date(),
          fecha_ultimo_intento: null,
          error_mensaje: null,
          factura_encontrada: false,
          factura_nombre_archivo: null,
          procesado_en: null,
        },
      ]);
      ftpService.listFiles.mockResolvedValue([fileInfo('F4-0004-12345.pdf')]);
      prisma.ventas_pendientes_factura.update.mockResolvedValue({});
      prisma.venta.findUnique.mockResolvedValue(buildVentaPrisma({ id_venta: 10 }));
      ftpService.downloadExcel.mockResolvedValue(undefined);
      prisma.venta.update.mockResolvedValue({});

      const r = await service.syncFacturasPendientes();

      expect(r.procesadas).toBe(1);
      expect(ftpService.deleteFile).toHaveBeenCalledWith(expect.stringContaining('F4-0004-12345.pdf'));
    });

    it('cuando no hay PDF para la venta, incrementa noEncontradas y actualiza intento', async () => {
      prisma.ventas_pendientes_factura.findMany.mockResolvedValue([
        {
          id: 1,
          venta_id: 2,
          venta: { cod_interno: '002' },
          estado: 'pendiente',
          intentos: 0,
          fecha_creacion: new Date(),
          fecha_ultimo_intento: null,
          error_mensaje: null,
          factura_encontrada: false,
          factura_nombre_archivo: null,
          procesado_en: null,
        },
      ]);
      ftpService.listFiles.mockResolvedValue([]);
      prisma.ventas_pendientes_factura.findUnique.mockResolvedValue({ venta_id: 2, intentos: 0 });
      prisma.ventas_pendientes_factura.update.mockResolvedValue({});

      const r = await service.syncFacturasPendientes();

      expect(r.noEncontradas).toBe(1);
      expect(prisma.ventas_pendientes_factura.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { venta_id: 2 },
          data: expect.objectContaining({ intentos: 1 }),
        })
      );
    });

    it('encuentra factura por cod_interno en formato MAX-00000001 y envía email con número de pedido', async () => {
      prisma.ventas_pendientes_factura.findMany.mockResolvedValue([
        {
          id: 1,
          venta_id: 42,
          venta: { cod_interno: 'MAX-00000042' },
          estado: 'pendiente',
          intentos: 0,
          fecha_creacion: new Date(),
          fecha_ultimo_intento: null,
          error_mensaje: null,
          factura_encontrada: false,
          factura_nombre_archivo: null,
          procesado_en: null,
        },
      ]);
      ftpService.listFiles.mockResolvedValue([fileInfo('F4-0004-MAX-00000042.pdf')]);
      prisma.ventas_pendientes_factura.update.mockResolvedValue({});
      prisma.venta.findUnique.mockResolvedValue(
        buildVentaPrisma({ id_venta: 42, cod_interno: 'MAX-00000042' })
      );
      ftpService.downloadExcel.mockResolvedValue(undefined);
      prisma.venta.update.mockResolvedValue({});

      const r = await service.syncFacturasPendientes();

      expect(r.procesadas).toBe(1);
      expect(ftpService.deleteFile).toHaveBeenCalledWith(expect.stringContaining('F4-0004-MAX-00000042.pdf'));
      expect(mailService.sendEmailWithAttachment).toHaveBeenCalledWith(
        expect.any(String),
        'Tu factura está lista - Pedido MAX-00000042',
        expect.any(String),
        expect.any(String),
        'Factura_MAX-00000042.pdf',
        expect.any(Object)
      );
    });

    it('usa id_venta a 8 dígitos cuando cod_interno es null', async () => {
      prisma.ventas_pendientes_factura.findMany.mockResolvedValue([
        {
          id: 1,
          venta_id: 123,
          venta: { cod_interno: null },
          estado: 'pendiente',
          intentos: 0,
          fecha_creacion: new Date(),
          fecha_ultimo_intento: null,
          error_mensaje: null,
          factura_encontrada: false,
          factura_nombre_archivo: null,
          procesado_en: null,
        },
      ]);
      ftpService.listFiles.mockResolvedValue([fileInfo('F4-0004-00000123.pdf')]);
      prisma.ventas_pendientes_factura.update.mockResolvedValue({});
      prisma.venta.findUnique.mockResolvedValue(buildVentaPrisma({ id_venta: 123 }));
      ftpService.downloadExcel.mockResolvedValue(undefined);
      prisma.venta.update.mockResolvedValue({});

      const r = await service.syncFacturasPendientes();

      expect(r.procesadas).toBe(1);
      expect(ftpService.deleteFile).toHaveBeenCalledWith(expect.stringContaining('F4-0004-00000123.pdf'));
    });

    it('siempre desconecta FTP en finally aunque haya error en el loop', async () => {
      prisma.ventas_pendientes_factura.findMany.mockResolvedValue([
        {
          id: 1,
          venta_id: 1,
          venta: { cod_interno: 'X' },
          estado: 'pendiente',
          intentos: 0,
          fecha_creacion: new Date(),
          fecha_ultimo_intento: null,
          error_mensaje: null,
          factura_encontrada: false,
          factura_nombre_archivo: null,
          procesado_en: null,
        },
      ]);
      ftpService.listFiles.mockResolvedValue([fileInfo('F4-0004-X.pdf')]);
      prisma.ventas_pendientes_factura.update.mockResolvedValue({});
      prisma.venta.findUnique.mockResolvedValue(null); // venta no encontrada → error en el loop

      const r = await service.syncFacturasPendientes();

      expect(r.errores).toBe(1);
      expect(ftpService.disconnect).toHaveBeenCalledTimes(1);
    });
  });
});
