import { describe, expect, it } from 'vitest';
import { filterParams } from './finscope.service';

describe('filterParams', () => {
  it('manda la categoría junto al resto de filtros del periodo', () => {
    const params = filterParams({
      month: 8,
      year: 2026,
      transactionTypeId: 2,
      categoryId: 5,
      tag: 'gab',
    });

    expect(params.get('month')).toBe('8');
    expect(params.get('year')).toBe('2026');
    expect(params.get('transactionTypeId')).toBe('2');
    expect(params.get('categoryId')).toBe('5');
    expect(params.get('tag')).toBe('gab');
  });

  it('omite los filtros sin informar, que para la API significan sin acotar', () => {
    const params = filterParams({ categoryId: null, tag: '   ', transactionTypeId: undefined });

    expect(params.has('categoryId')).toBe(false);
    expect(params.has('tag')).toBe(false);
    expect(params.has('transactionTypeId')).toBe(false);
  });
});
