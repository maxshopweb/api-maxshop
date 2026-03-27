import { Prisma } from '@prisma/client';
import { z } from 'zod';

const GENERIC_DB =
  'Ocurrió un problema al guardar los datos. Intentá de nuevo en unos minutos.';

/** Patrones que no deben mostrarse al usuario final (Prisma, SQL, stacks, etc.) */
function isLikelyTechnicalMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  if (m.length > 500) return true;
  if (/\n/.test(msg)) return true;
  if (/prisma/i.test(msg)) return true;
  if (/postgres/i.test(msg)) return true;
  if (/invalid `/i.test(msg)) return true;
  if (/unique constraint/i.test(msg)) return true;
  if (/foreign key/i.test(msg)) return true;
  if (/relation violation/i.test(msg)) return true;
  if (/sql/i.test(m) && /error/i.test(m)) return true;
  if (/record(s)? to (update|delete) not found/i.test(m)) return true;
  if (/request failed with status code/i.test(m)) return true;
  if (/network error/i.test(m)) return true;
  if (/econnrefused/i.test(m)) return true;
  if (/timeout/i.test(m) && /exceeded/i.test(m)) return true;
  return false;
}

function mapPrismaKnownError(e: Prisma.PrismaClientKnownRequestError): string {
  switch (e.code) {
    case 'P2002':
      return 'Ese dato ya está en uso. Probá con otro valor.';
    case 'P2003':
      return 'No se puede completar la operación por datos relacionados.';
    case 'P2025':
      return 'No se encontró el registro solicitado.';
    case 'P2014':
      return 'La operación no es válida por cómo están relacionados los datos.';
    case 'P2016':
      return 'No se pudo interpretar la consulta. Si el problema continúa, contactá al soporte.';
    default:
      return GENERIC_DB;
  }
}

function zodToPublic(err: z.ZodError): string {
  const first = err.issues[0];
  if (first?.message && !isLikelyTechnicalMessage(first.message)) {
    return first.message;
  }
  return 'Los datos enviados no son válidos. Revisá los campos e intentá de nuevo.';
}

/**
 * Convierte cualquier error de servidor en un mensaje seguro para el cliente.
 * Los errores técnicos se reemplazan por `fallback` o mensajes genéricos.
 * Los `Error` con mensajes claros (p. ej. lanzados por los servicios) se respetan.
 */
export function toPublicErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return mapPrismaKnownError(error);
  }
  if (error instanceof Prisma.PrismaClientValidationError) {
    return GENERIC_DB;
  }
  if (error instanceof z.ZodError) {
    return zodToPublic(error);
  }
  if (error instanceof Error) {
    const msg = error.message?.trim() ?? '';
    if (msg && !isLikelyTechnicalMessage(msg)) {
      return msg;
    }
  }
  return fallback;
}

export function logServerError(context: string, error: unknown): void {
  console.error(`[${context}]`, error);
}
