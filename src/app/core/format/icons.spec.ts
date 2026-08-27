import { describe, expect, it } from 'vitest';
import { PALETTE_SIZE, iconFor, paletteVariant } from './icons';

describe('iconFor', () => {
  it('reconoce la categoría por una palabra de su nombre', () => {
    expect(iconFor('Comida')).toBe('bi-basket');
    expect(iconFor('Transporte')).toBe('bi-car-front');
    expect(iconFor('Regalos')).toBe('bi-gift');
    expect(iconFor('Salario')).toBe('bi-cash-coin');
  });

  it('ignora las tildes y las mayúsculas', () => {
    expect(iconFor('EDUCACIÓN')).toBe(iconFor('educacion'));
  });

  it('reconoce la palabra dentro de un nombre compuesto', () => {
    expect(iconFor('Regalo para Gab')).toBe('bi-gift');
  });

  it('cae en una etiqueta genérica cuando no reconoce nada', () => {
    expect(iconFor('zzz')).toBe('bi-tag');
  });
});

describe('paletteVariant', () => {
  it('devuelve siempre la misma variante para el mismo nombre', () => {
    expect(paletteVariant('Comida')).toBe(paletteVariant('Comida'));
  });

  it('se mantiene dentro de la paleta', () => {
    for (const name of ['Comida', 'gab', 'Transporte', 'x', '', 'Mascotas']) {
      const variant = paletteVariant(name);
      expect(variant).toBeGreaterThanOrEqual(0);
      expect(variant).toBeLessThan(PALETTE_SIZE);
    }
  });
});
