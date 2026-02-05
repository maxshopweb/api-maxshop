/**
 * Normaliza req.params / req.query (string | string[]) a un único string.
 * Express tipa params/query como string | string[]; usar este helper evita TS2345.
 */
export const asSingleString = (value: string | string[] | undefined): string => {
  if (value === undefined) return '';
  return Array.isArray(value) ? (value[0] ?? '') : value;
};

export const sanitizeString = (value?: string | null): string | null => {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

export const parseTelefono = (value?: string | number | null): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'number') {
    // Convertir número a string, pero validar que no sea NaN
    return Number.isNaN(value) ? null : String(value);
  }

  // Si es string, eliminar caracteres no numéricos
  const digits = value.replace(/\D/g, '');
  if (!digits) {
    return null;
  }

  // Retornar como string para evitar problemas con números grandes
  return digits;
};

export const parseDate = (value?: string | Date | null): Date | null => {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

