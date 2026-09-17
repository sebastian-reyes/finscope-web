import { describe, expect, it } from 'vitest';
import { contrast } from './color';
import {
  chipVariant,
  styleChange,
  freeChipColors,
  freeHex,
  presetColor,
  presetIndex,
} from './chip-color';
import { paletteVariant } from './icons';

const LIGHT_PAPERS = ['#f3f5f9', '#fdfdfe'];
const DARK_PAPERS = ['#11161d', '#1a2029'];

describe('presetIndex / presetColor', () => {
  it('lee las ocho fichas y nada más', () => {
    expect(presetIndex('preset-0')).toBe(0);
    expect(presetIndex('preset-7')).toBe(7);
    expect(presetIndex('preset-8')).toBeNull();
    expect(presetIndex('#ffffff')).toBeNull();
    expect(presetIndex(null)).toBeNull();
    expect(presetColor(3)).toBe('preset-3');
  });
});

describe('freeHex', () => {
  it('normaliza el color libre y descarta lo demás', () => {
    expect(freeHex('#E8A33D')).toBe('#e8a33d');
    expect(freeHex('preset-2')).toBeNull();
    expect(freeHex(undefined)).toBeNull();
  });
});

describe('chipVariant', () => {
  it('usa la ficha elegida y, si no hay, la que reparte el nombre', () => {
    expect(chipVariant('Comida', 'preset-5')).toBe(5);
    expect(chipVariant('Comida', null)).toBe(paletteVariant('Comida'));
    expect(chipVariant('Comida', '#000000')).toBe(paletteVariant('Comida'));
  });
});

describe('freeChipColors', () => {
  it('pone letra clara sobre negro y oscura sobre blanco', () => {
    const black = freeChipColors('#000000', LIGHT_PAPERS)!;
    const white = freeChipColors('#ffffff', LIGHT_PAPERS)!;

    expect(contrast(black.ink, '#ffffff')).toBeLessThan(1.2);
    expect(contrast(white.ink, '#000000')).toBeLessThan(2);
  });

  it('llega siempre a AA, también en los tonos medios', () => {
    for (const hex of [
      '#777777',
      '#e11d5e',
      '#0891b2',
      '#d9930b',
      '#7c3aed',
      '#1f9e6a',
      '#ffff00',
    ]) {
      const { bg, ink } = freeChipColors(hex, LIGHT_PAPERS)!;
      expect(contrast(bg, ink), hex).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('le pone filo al color que se funde con el papel', () => {
    expect(freeChipColors('#ffffff', LIGHT_PAPERS)!.edge).toBe(true);
    expect(freeChipColors('#000000', DARK_PAPERS)!.edge).toBe(true);
    expect(freeChipColors('#000000', LIGHT_PAPERS)!.edge).toBe(false);
    expect(freeChipColors('#e11d5e', DARK_PAPERS)!.edge).toBe(false);
  });

  it('devuelve nulo si el valor no es un color', () => {
    expect(freeChipColors('rojo', LIGHT_PAPERS)).toBeNull();
  });
});

describe('styleChange', () => {
  it('no manda nada si el color no ha cambiado', () => {
    expect(styleChange(undefined, null)).toBeUndefined();
    expect(styleChange('preset-2', 'preset-2')).toBeUndefined();
  });

  it('manda auto para quitar un color y el nuevo para cambiarlo', () => {
    expect(styleChange('#000000', null)).toBe('auto');
    expect(styleChange(null, '#ffffff')).toBe('#ffffff');
  });
});
