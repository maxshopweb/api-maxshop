/**
 * Servicio de vencimiento de ventas pendientes de pago (efectivo/transferencia).
 * Expira ventas que superan N días sin confirmación.
 */

import { prisma } from '../index';
import { auditService } from './audit.service';
import mailService from '../mail';

const METODOS_PAGO_MANUALES = ['efectivo', 'transferencia'] as const;
const ESTADO_PENDIENTE = 'pendiente';
const ESTADO_VENCIDO = 'vencido';
const ACCION_VENTA_VENCIDA = 'VENTA_VENCIDA';
const TABLA_VENTA = 'venta';
const DEFAULT_DIAS = 3;

function getDiasVencimiento(): number {
  const env = process.env.DIAS_VENCIMIENTO_VENTA;
  if (env == null || env === '') return DEFAULT_DIAS;
  const n = parseInt(env, 10);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_DIAS;
}

/**
 * Fecha límite: ventas con creado_en anterior a esta se consideran vencidas.
 */
function getFechaLimite(dias: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  d.setHours(0, 0, 0, 0);
  return d;
}

export type ExpirarVentasResult = {
  vencidasCount: number;
  ids: number[];
  duracionMs: number;
};

export type VencimientoAuditContext = {
  userId: string;
  userAgent?: string | null;
  endpoint?: string | null;
};

/**
 * Expira ventas pendientes de pago manual que superaron N días sin confirmación.
 * Idempotente: si no hay candidatas o ya están vencidas, no hace nada.
 */
export async function expirarVentasPendientes(
  auditContext?: VencimientoAuditContext
): Promise<ExpirarVentasResult> {
  const start = Date.now();
  const dias = getDiasVencimiento();
  const fechaLimite = getFechaLimite(dias);

  const where = {
    estado_pago: ESTADO_PENDIENTE,
    metodo_pago: { in: [...METODOS_PAGO_MANUALES] },
    creado_en: { lt: fechaLimite },
  };

  const candidatas = await prisma.venta.findMany({
    where,
    select: { id_venta: true },
  });
  const ids = candidatas.map((v) => v.id_venta);

  if (ids.length === 0) {
    const duracionMs = Date.now() - start;
    await registrarEventLog(0, [], duracionMs);
    return { vencidasCount: 0, ids: [], duracionMs };
  }

  await prisma.venta.updateMany({
    where,
    data: { estado_pago: ESTADO_VENCIDO, actualizado_en: new Date() },
  });

  const ventasParaEmail = await prisma.venta.findMany({
    where: { id_venta: { in: ids } },
    select: {
      id_venta: true,
      cod_interno: true,
      total_neto: true,
      cliente: {
        select: {
          usuarios: {
            select: { email: true, nombre: true, apellido: true },
          },
        },
      },
    },
  });

  for (const v of ventasParaEmail) {
    const email = v.cliente?.usuarios?.email;
    if (email) {
      mailService
        .sendOrderExpired({
          orderId: v.id_venta,
          orderNumber: v.cod_interno ?? undefined,
          total: v.total_neto ? Number(v.total_neto) : undefined,
          cliente: {
            email,
            nombre: v.cliente?.usuarios?.nombre ?? undefined,
            apellido: v.cliente?.usuarios?.apellido ?? undefined,
          },
        })
        .catch((err) =>
          console.error(`[vencimiento.service] Error enviando email vencida venta #${v.id_venta}:`, err)
        );
    }
  }

  if (auditContext) {
    await auditService.record({
      action: 'VENTAS_EXPIRAR',
      table: TABLA_VENTA,
      description: `Admin expiró ${ids.length} ventas pendientes`,
      previousData: { ids, estado_pago: ESTADO_PENDIENTE, count: ids.length },
      currentData: { ids, estado_pago: ESTADO_VENCIDO, vencidasCount: ids.length },
      userId: auditContext.userId,
      userAgent: auditContext.userAgent ?? null,
      endpoint: auditContext.endpoint ?? null,
      status: 'SUCCESS',
      processingTimeMs: Date.now() - start,
      adminAudit: true,
    });
  }

  for (const id_venta of ids) {
    await auditService.record({
      action: ACCION_VENTA_VENCIDA,
      table: TABLA_VENTA,
      description: `Venta ${id_venta} marcada como vencida`,
      previousData: { id_venta, estado_pago: ESTADO_PENDIENTE },
      currentData: { id_venta, estado_pago: ESTADO_VENCIDO },
      userId: auditContext?.userId ?? null,
      status: 'SUCCESS',
      adminAudit: !!auditContext,
    });
  }

  const duracionMs = Date.now() - start;
  await registrarEventLog(ids.length, ids, duracionMs);

  return { vencidasCount: ids.length, ids, duracionMs };
}

export type AprobarVentaVencidaResult = {
  id_venta: number;
  estado_pago_anterior: string;
  estado_pago: string;
  venta?: import('../types').IVenta;
};

/**
 * Revoca el vencimiento: pasa una venta de estado_pago 'vencido' a 'aprobado'.
 * Usa confirmPayment para descontar stock, ejecutar handlers (Andreani, factura, etc.) y enviar email de confirmación.
 * @throws Error si la venta no existe o no está en estado 'vencido'
 */
export async function aprobarVentaVencida(
  id_venta: number,
  auditContext?: VencimientoAuditContext
): Promise<AprobarVentaVencidaResult> {
  const venta = await prisma.venta.findUnique({
    where: { id_venta },
    select: { id_venta: true, estado_pago: true },
  });

  if (!venta) {
    throw new Error('Venta no encontrada');
  }

  if (venta.estado_pago !== ESTADO_VENCIDO) {
    throw new Error(
      `Solo se puede aprobar una venta en estado vencido. Estado actual: ${venta.estado_pago ?? 'null'}`
    );
  }

  const { paymentProcessingService } = await import('./payment-processing.service');
  const ventaActualizada = await paymentProcessingService.confirmPayment(id_venta, {
    notas: 'Aprobada desde estado vencido (admin)',
  });

  await auditService.record({
    action: 'VENTA_VENCIDA_APROBADA',
    table: TABLA_VENTA,
    description: `Venta ${id_venta} aprobada desde estado vencido (revocación de vencimiento)`,
    previousData: { id_venta, estado_pago: ESTADO_VENCIDO },
    currentData: { id_venta, estado_pago: 'aprobado' },
    userId: auditContext?.userId ?? null,
    userAgent: auditContext?.userAgent ?? null,
    endpoint: auditContext?.endpoint ?? null,
    status: 'SUCCESS',
    adminAudit: !!auditContext,
  });

  return {
    id_venta,
    estado_pago_anterior: ESTADO_VENCIDO,
    estado_pago: ventaActualizada.estado_pago ?? 'aprobado',
    venta: ventaActualizada as import('../types').IVenta,
  };
}

async function registrarEventLog(
  vencidasCount: number,
  ids: number[],
  duracionMs: number
): Promise<void> {
  try {
    await prisma.event_logs.create({
      data: {
        event_type: 'VENCIMIENTO_VENTAS_JOB',
        payload: {
          vencidasCount,
          ids,
          duracionMs,
          diasConfigurados: getDiasVencimiento(),
        },
        handlers_executed: 1,
        handlers_succeeded: 1,
        handlers_failed: 0,
        total_duration_ms: duracionMs,
        source: 'vencimiento-cron',
        triggered_by: 'system',
      },
    });
  } catch (error) {
    console.error('[vencimiento.service] Error al registrar en event_logs:', error);
  }
}
