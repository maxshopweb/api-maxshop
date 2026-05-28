/**
 * Normalización global para búsquedas: ignora mayúsculas, acentos y caracteres especiales.
 */

export function normalizeForSearch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/g, '');
}

export function prepareSearchQuery(value: string): { raw: string; normalized: string } {
  const raw = value.trim();
  return { raw, normalized: normalizeForSearch(raw) };
}

export function getSearchVariants(value: string): string[] {
  const { raw, normalized } = prepareSearchQuery(value);
  const variants = new Set<string>();
  if (raw.length > 0) variants.add(raw);
  if (normalized.length > 0) variants.add(normalized);
  return [...variants];
}

export function normalizedLikePattern(value: string): string | null {
  const n = normalizeForSearch(value);
  return n.length > 0 ? `%${n}%` : null;
}

/** Solo dígitos (DNI, teléfono, códigos numéricos). */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

type ContainsMode = 'insensitive';

/**
 * Condiciones Prisma OR para campos de texto con variantes de búsqueda.
 */
export function buildContainsOrConditions(
  fields: string[],
  busqueda: string,
  mode: ContainsMode = 'insensitive'
): Record<string, { contains: string; mode: ContainsMode }>[] {
  const variants = getSearchVariants(busqueda);
  const conditions: Record<string, { contains: string; mode: ContainsMode }>[] = [];
  for (const term of variants) {
    for (const field of fields) {
      conditions.push({ [field]: { contains: term, mode } });
    }
  }
  return conditions;
}

/** Búsqueda en usuarios: nombre, email, documento (con variantes y solo dígitos). */
export function buildUsuarioSearchOrConditions(
  busqueda: string,
  extraFields: string[] = ['nombre', 'apellido', 'email', 'username']
): Record<string, { contains: string; mode: ContainsMode }>[] {
  const conditions = buildContainsOrConditions(extraFields, busqueda);
  const seen = new Set<string>();
  for (const variant of getSearchVariants(busqueda)) {
    const key = `doc:${variant}`;
    if (!seen.has(key)) {
      seen.add(key);
      conditions.push({ numero_documento: { contains: variant, mode: 'insensitive' } });
    }
  }
  const onlyDigits = digitsOnly(busqueda);
  if (onlyDigits.length > 0) {
    const key = `doc:digits:${onlyDigits}`;
    if (!seen.has(key)) {
      conditions.push({ numero_documento: { contains: onlyDigits, mode: 'insensitive' } });
    }
  }
  return conditions;
}
