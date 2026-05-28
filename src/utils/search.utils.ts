import { Prisma } from '@prisma/client';

/**
 * Normalización global para búsquedas: ignora mayúsculas, acentos y caracteres especiales.
 */

/** Pares acento → ASCII para PostgreSQL translate(). */
const PG_ACCENT_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['á', 'a'], ['à', 'a'], ['ä', 'a'], ['â', 'a'], ['ã', 'a'], ['å', 'a'],
  ['é', 'e'], ['è', 'e'], ['ê', 'e'], ['ë', 'e'],
  ['í', 'i'], ['ì', 'i'], ['î', 'i'], ['ï', 'i'],
  ['ó', 'o'], ['ò', 'o'], ['ô', 'o'], ['ö', 'o'], ['õ', 'o'],
  ['ú', 'u'], ['ù', 'u'], ['û', 'u'], ['ü', 'u'],
  ['ñ', 'n'], ['ç', 'c'], ['ý', 'y'], ['ÿ', 'y'],
  ['Á', 'a'], ['À', 'a'], ['Ä', 'a'], ['Â', 'a'], ['Ã', 'a'], ['Å', 'a'],
  ['É', 'e'], ['È', 'e'], ['Ê', 'e'], ['Ë', 'e'],
  ['Í', 'i'], ['Ì', 'i'], ['Î', 'i'], ['Ï', 'i'],
  ['Ó', 'o'], ['Ò', 'o'], ['Ô', 'o'], ['Ö', 'o'], ['Õ', 'o'],
  ['Ú', 'u'], ['Ù', 'u'], ['Û', 'u'], ['Ü', 'u'],
  ['Ñ', 'n'], ['Ç', 'c'], ['Ý', 'y'],
] as const;

const PG_TRANSLATE_FROM = PG_ACCENT_PAIRS.map(([from]) => from).join('');
const PG_TRANSLATE_TO = PG_ACCENT_PAIRS.map(([, to]) => to).join('');

export function normalizeForSearch(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/g, '');
}

/** Sin acentos; conserva espacios y signos. */
export function stripDiacritics(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

export function prepareSearchQuery(value: string): { raw: string; normalized: string } {
  const raw = value.trim();
  return { raw, normalized: normalizeForSearch(raw) };
}

/** Tokens alfanuméricos (cada palabra sin acentos). */
export function getSearchTokens(value: string): string[] {
  if (!value?.trim()) return [];
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

export function getSearchVariants(value: string): string[] {
  const { raw, normalized } = prepareSearchQuery(value);
  const accentStripped = stripDiacritics(raw);
  const variants = new Set<string>();
  if (raw.length > 0) variants.add(raw);
  if (accentStripped.length > 0) variants.add(accentStripped);
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

/** Expresión SQL: columna → solo a-z0-9 sin acentos. `columnRef` ej. `p.nombre`. */
export function sqlExprNormalizeColumn(columnRef: string): Prisma.Sql {
  return Prisma.sql`regexp_replace(translate(lower(COALESCE(${Prisma.raw(columnRef)}, '')), ${PG_TRANSLATE_FROM}, ${PG_TRANSLATE_TO}), '[^a-z0-9]', '', 'g')`;
}

/**
 * Cada token debe aparecer en al menos un campo (AND tokens, OR campos).
 */
export function buildTokenFieldSearchSql(
  busqueda: string,
  tableAlias: string,
  fields: string[]
): Prisma.Sql | null {
  const tokens = getSearchTokens(busqueda);
  if (tokens.length === 0) return null;

  const tokenParts = tokens.map((token) => {
    const pattern = `%${token}%`;
    const fieldMatches = fields.map((field) => {
      const col = `${tableAlias}.${field}`;
      return Prisma.sql`${sqlExprNormalizeColumn(col)} LIKE ${pattern}`;
    });
    return Prisma.sql`(${Prisma.join(fieldMatches, ' OR ')})`;
  });

  return Prisma.sql`(${Prisma.join(tokenParts, ' AND ')})`;
}

const PRODUCTO_SEARCH_FIELDS = ['nombre', 'descripcion', 'codi_arti', 'codi_barras'] as const;

/** Búsqueda de producto (tokens + id_prod opcional). */
export function buildProductoTextSearchSql(
  busqueda: string,
  tableAlias = 'p'
): Prisma.Sql | null {
  const parts: Prisma.Sql[] = [];

  const tokenPart = buildTokenFieldSearchSql(
    busqueda,
    tableAlias,
    [...PRODUCTO_SEARCH_FIELDS]
  );
  if (tokenPart) parts.push(tokenPart);

  const idNum = parseInt(normalizeForSearch(busqueda), 10);
  if (!isNaN(idNum) && idNum > 0) {
    parts.push(Prisma.sql`${Prisma.raw(tableAlias)}.id_prod = ${idNum}`);
  }

  if (parts.length === 0) return null;
  return Prisma.sql`(${Prisma.join(parts, ' OR ')})`;
}

const USUARIO_SEARCH_FIELDS = [
  'nombre',
  'apellido',
  'email',
  'telefono',
  'username',
  'numero_documento',
] as const;

/** Búsqueda en usuarios (tokens en campos + documento solo dígitos). */
export function buildUsuarioTextSearchSql(
  busqueda: string,
  tableAlias = 'u'
): Prisma.Sql | null {
  const parts: Prisma.Sql[] = [];

  const tokenPart = buildTokenFieldSearchSql(
    busqueda,
    tableAlias,
    [...USUARIO_SEARCH_FIELDS]
  );
  if (tokenPart) parts.push(tokenPart);

  const onlyDigits = digitsOnly(busqueda);
  if (onlyDigits.length > 0) {
    const col = `${tableAlias}.numero_documento`;
    parts.push(
      Prisma.sql`${sqlExprNormalizeColumn(col)} LIKE ${'%' + onlyDigits + '%'}`
    );
  }

  if (parts.length === 0) return null;
  return Prisma.sql`(${Prisma.join(parts, ' OR ')})`;
}

/** Búsqueda en venta: cod_interno, id_venta o datos del cliente (usuarios). */
export function buildVentaTextSearchSql(busqueda: string): Prisma.Sql | null {
  const parts: Prisma.Sql[] = [];

  const codPart = buildTokenFieldSearchSql(busqueda, 'v', ['cod_interno']);
  if (codPart) parts.push(codPart);

  const usuarioPart = buildUsuarioTextSearchSql(busqueda, 'u');
  if (usuarioPart) parts.push(usuarioPart);

  const idNum = parseInt(normalizeForSearch(busqueda), 10);
  if (!isNaN(idNum) && idNum > 0) {
    parts.push(Prisma.sql`v.id_venta = ${idNum}`);
  }

  if (parts.length === 0) return null;
  return Prisma.sql`(${Prisma.join(parts, ' OR ')})`;
}

/** Maestros: código + nombre (marca, grupo, categoría, lista). */
export function buildCodigoNombreSearchSql(
  busqueda: string,
  tableAlias: string,
  codiField: string,
  nombreField = 'nombre'
): Prisma.Sql | null {
  return buildTokenFieldSearchSql(busqueda, tableAlias, [codiField, nombreField]);
}

type ContainsMode = 'insensitive';

/**
 * Condiciones Prisma OR (fallback; preferir SQL normalizado en listados).
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

/** @deprecated Preferir buildUsuarioTextSearchSql + search-queries */
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
