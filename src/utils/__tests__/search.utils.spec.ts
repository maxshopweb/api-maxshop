import {
  normalizeForSearch,
  getSearchVariants,
  getSearchTokens,
  stripDiacritics,
  buildContainsOrConditions,
} from '../search.utils';

describe('search.utils', () => {
  it('normalizeForSearch ignora acentos y caracteres especiales', () => {
    expect(normalizeForSearch('Taladro 1/2"')).toBe('taladro12');
    expect(normalizeForSearch('  Café-Müller  ')).toBe('cafemuller');
  });

  it('stripDiacritics quita tildes pero conserva espacios', () => {
    expect(stripDiacritics('Batería 20V')).toBe('bateria 20v');
  });

  it('getSearchTokens separa palabras sin acentos', () => {
    expect(getSearchTokens('rotomartillo 20v + 1 bateri')).toEqual([
      'rotomartillo',
      '20v',
      '1',
      'bateri',
    ]);
  });

  it('getSearchVariants incluye raw, sin acentos y alfanumérico', () => {
    const variants = getSearchVariants('Taladro-1');
    expect(variants).toContain('Taladro-1');
    expect(variants).toContain('taladro-1');
    expect(variants).toContain('taladro1');
  });

  it('buildContainsOrConditions genera OR por campo y variante', () => {
    const conditions = buildContainsOrConditions(['nombre'], 'a-b');
    expect(conditions.length).toBeGreaterThanOrEqual(2);
    expect(conditions.some((c) => c.nombre?.contains === 'a-b')).toBe(true);
    expect(conditions.some((c) => c.nombre?.contains === 'ab')).toBe(true);
  });

  it('bateri coincide con batería al normalizar', () => {
    expect(normalizeForSearch('Batería')).toBe('bateria');
    expect(normalizeForSearch('bateri')).toBe('bateri');
    expect(normalizeForSearch('Batería 20V').includes('bateri')).toBe(true);
  });

  it('getSearchTokens separa palabras para búsqueda AND', () => {
    expect(getSearchTokens('José García')).toEqual(['jose', 'garcia']);
  });
});
