import { prisma } from '../index';
import { type AuditLogPayload } from '../types/auth.type';

/** Método HTTP inferido por convención desde la acción */
function inferMethod(accion: string | null): string {
  if (!accion) return 'POST';
  const a = accion.toUpperCase();
  if (a.includes('DELETE')) return 'DELETE';
  if (a.includes('UPDATE') || a.includes('PUT')) return 'PUT';
  return 'POST';
}

export type AuditLogEntry = {
  id_aud: number;
  id_usuario: string | null;
  fecha: string | null;
  fecha_iso: string | null;
  dia: string | null;
  hora: string | null;
  anio: number | null;
  accion: string | null;
  tabla_afectada: string | null;
  descripcion: string | null;
  dato_anterior: unknown;
  dato_despues: unknown;
  endpoint: string | null;
  estado: string | null;
  user_agent: string | null;
  tiempo_procesamiento: number | null;
  method: string;
  usuario: {
    id_usuario: string;
    nombre: string | null;
    apellido: string | null;
    email: string | null;
  } | null;
};

export type GetLogsResult = {
  data: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

export type GetLogsFilters = {
  fecha_desde?: string; // YYYY-MM-DD
  fecha_hasta?: string; // YYYY-MM-DD
  accion?: string;
  tabla_afectada?: string;
  method?: string; // GET, POST, PUT, DELETE
  estado?: string;
  tiempo_min?: number;
  tiempo_max?: number;
};

class AuditService {
  private buildWhere(filters: GetLogsFilters): Record<string, unknown> {
    const where: Record<string, unknown> = {};

    if (filters.fecha_desde || filters.fecha_hasta) {
      const fechaCond: { gte?: Date; lte?: Date } = {};
      if (filters.fecha_desde) {
        const d = new Date(filters.fecha_desde);
        d.setUTCHours(0, 0, 0, 0);
        fechaCond.gte = d;
      }
      if (filters.fecha_hasta) {
        const d = new Date(filters.fecha_hasta);
        d.setUTCHours(23, 59, 59, 999);
        fechaCond.lte = d;
      }
      where.fecha = fechaCond;
    }
    if (filters.accion?.trim()) {
      (where as { accion?: { contains: string; mode: string } }).accion = {
        contains: filters.accion.trim(),
        mode: 'insensitive'
      };
    } else if (filters.method?.trim()) {
      const m = filters.method.trim().toUpperCase();
      (where as { accion?: { contains: string; mode: string } }).accion = {
        contains: m === 'PUT' ? 'UPDATE' : m,
        mode: 'insensitive'
      };
    }
    if (filters.tabla_afectada?.trim()) {
      (where as { tabla_afectada?: { contains: string; mode: string } }).tabla_afectada = {
        contains: filters.tabla_afectada.trim(),
        mode: 'insensitive'
      };
    }
    if (filters.estado?.trim()) {
      (where as { estado: string }).estado = filters.estado.trim();
    }
    if (filters.tiempo_min != null && !Number.isNaN(Number(filters.tiempo_min))) {
      const t = (where as { tiempo_procesamiento?: Record<string, number> }).tiempo_procesamiento || {};
      (where as { tiempo_procesamiento: Record<string, number> }).tiempo_procesamiento = { ...t, gte: Number(filters.tiempo_min) };
    }
    if (filters.tiempo_max != null && !Number.isNaN(Number(filters.tiempo_max))) {
      const t = (where as { tiempo_procesamiento?: Record<string, number> }).tiempo_procesamiento || {};
      (where as { tiempo_procesamiento: Record<string, number> }).tiempo_procesamiento = { ...t, lte: Number(filters.tiempo_max) };
    }

    return where;
  }

  private toJsonSafe(data?: unknown) {
    if (!data) {
      return undefined;
    }

    try {
      return JSON.parse(JSON.stringify(data));
    } catch (error) {
      console.error('No se pudo serializar la data para auditoría:', error);
      return undefined;
    }
  }

  async record(payload: AuditLogPayload) {
    try {
      if (payload.adminAudit === true && process.env.ENABLE_ADMIN_AUDIT !== 'true') {
        return;
      }
      await prisma.auditoria.create({
        data: {
          id_usuario: payload.userId ?? null,
          accion: payload.action,
          tabla_afectada: payload.table ?? 'usuarios',
          descripcion: payload.description ?? null,
          dato_anterior: this.toJsonSafe(payload.previousData),
          dato_despues: this.toJsonSafe(payload.currentData),
          user_agent: payload.userAgent ?? null,
          endpoint: payload.endpoint ?? null,
          estado: payload.status ?? 'SUCCESS',
          tiempo_procesamiento: payload.processingTimeMs
            ? Math.round(payload.processingTimeMs)
            : null
        }
      });
    } catch (error) {
      console.error('No se pudo registrar la auditoría:', error);
    }
  }

  async getLogs(
    page: number = 1,
    limit: number = 50,
    filters: GetLogsFilters = {}
  ): Promise<GetLogsResult> {
    const safeLimit = Math.min(Math.max(1, limit), 100);
    const safePage = Math.max(1, page);
    const where = this.buildWhere(filters);

    const [rows, total] = await Promise.all([
      prisma.auditoria.findMany({
        where: Object.keys(where).length ? where : undefined,
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
        orderBy: { fecha: 'desc' },
        include: {
          usuarios: {
            select: {
              id_usuario: true,
              nombre: true,
              apellido: true,
              email: true
            }
          }
        }
      }),
      prisma.auditoria.count({ where: Object.keys(where).length ? where : undefined })
    ]);

    const data: AuditLogEntry[] = rows.map((r) => {
      const fecha = r.fecha;
      const dia = fecha ? fecha.toISOString().slice(0, 10) : null;
      const hora = fecha ? fecha.toTimeString().slice(0, 8) : null;
      const anio = fecha ? fecha.getFullYear() : null;
      const fechaIso = fecha ? fecha.toISOString() : null;

      return {
        id_aud: r.id_aud,
        id_usuario: r.id_usuario,
        fecha: fechaIso,
        fecha_iso: fechaIso,
        dia,
        hora,
        anio,
        accion: r.accion,
        tabla_afectada: r.tabla_afectada,
        descripcion: r.descripcion,
        dato_anterior: r.dato_anterior,
        dato_despues: r.dato_despues,
        endpoint: r.endpoint,
        estado: r.estado,
        user_agent: r.user_agent,
        tiempo_procesamiento: r.tiempo_procesamiento,
        method: inferMethod(r.accion),
        usuario: r.usuarios
          ? {
              id_usuario: r.usuarios.id_usuario,
              nombre: r.usuarios.nombre,
              apellido: r.usuarios.apellido,
              email: r.usuarios.email
            }
          : null
      };
    });

    return {
      data,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(total / safeLimit) || 1
    };
  }
}

export const auditService = new AuditService();

