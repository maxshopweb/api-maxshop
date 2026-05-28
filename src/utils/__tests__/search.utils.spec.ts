import {
  normalizeForSearch,
  getSearchVariants,
  buildContainsOrConditions,
} from '../search.utils';

describe('search.utils', () => {
  it('normalizeForSearch ignora acentos y caracteres especiales', () => {
    expect(normalizeForSearch('Taladro 1/2"')).toBe('taladro12');
    expect(normalizeForSearch('  Café-Müller  ')).toBe('cafemuller');
  });

  it('getSearchVariants incluye raw y normalizado', () => {
    const variants = getSearchVariants('Taladro-1');
    expect(variants).toContain('Taladro-1');
    expect(variants).toContain('taladro1');
  });

  it('buildContainsOrConditions genera OR por campo y variante', () => {
    const conditions = buildContainsOrConditions(['nombre'], 'a-b');
    expect(conditions.length).toBeGreaterThanOrEqual(2);
    expect(conditions.some((c) => c.nombre?.contains === 'a-b')).toBe(true);
    expect(conditions.some((c) => c.nombre?.contains === 'ab')).toBe(true);
  });
});
