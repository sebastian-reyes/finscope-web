import { describe, expect, it } from 'vitest';
import { matchesSearch } from './search';

describe('matchesSearch', () => {
  it('sin nada escrito encaja con todo', () => {
    expect(matchesSearch('', ['Netflix'])).toBe(true);
    expect(matchesSearch('   ', ['Netflix'])).toBe(true);
  });

  it('no distingue mayúsculas ni tildes, ni en lo escrito ni en la fila', () => {
    expect(matchesSearch('educacion', ['Educación'])).toBe(true);
    expect(matchesSearch('EDUCACIÓN', ['educacion'])).toBe(true);
  });

  it('cada palabra puede encajar en un texto distinto, pero tienen que encajar todas', () => {
    expect(matchesSearch('netflix ocio', ['Netflix', 'Ocio'])).toBe(true);
    expect(matchesSearch('netflix salud', ['Netflix', 'Ocio'])).toBe(false);
  });

  it('busca trozos y no solo palabras enteras', () => {
    expect(matchesSearch('alqu', ['Alquiler'])).toBe(true);
  });
});
