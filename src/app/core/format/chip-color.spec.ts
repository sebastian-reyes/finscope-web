import { describe, expect, it } from 'vitest';
import { contrast, toOklch } from './color';
import {
  chipVariant,
  styleChange,
  freeChipColors,
  freeHex,
  presetColor,
  presetIndex,
} from './chip-color';
import { paletteVariant } from './icons';

/** Distancia entre dos tonos en grados, dando la vuelta al círculo. */
function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

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
  it('solo el negro y los casi negros sin color llevan letra blanca', () => {
    expect(freeChipColors('#000000', LIGHT_PAPERS)!.ink).toBe('#ffffff');
    expect(freeChipColors('#1a1a1a', LIGHT_PAPERS)!.ink).toBe('#ffffff');
    for (const hex of ['#ffffff', '#e8a33d', '#ff0000', '#2a5cb8', '#14532d']) {
      expect(freeChipColors(hex, LIGHT_PAPERS)!.ink, hex).not.toBe('#ffffff');
    }
  });

  it('la letra es el mismo color más oscuro, como en las fichas de la paleta', () => {
    for (const hex of [
      '#e8a33d',
      '#e11d5e',
      '#ff0000',
      '#0891b2',
      '#1f9e6a',
      '#ffff00',
      '#f9a8d4',
    ]) {
      const { bg, ink } = freeChipColors(hex, LIGHT_PAPERS)!;
      const background = toOklch(bg);
      const letter = toOklch(ink);
      expect(letter.l, hex).toBeLessThan(background.l);
      expect(hueDistance(letter.h, background.h), hex).toBeLessThan(6);
      // Oscura, pero no negra: se sigue viendo de qué color es.
      expect(letter.l, hex).toBeGreaterThanOrEqual(0.29);
      expect(letter.c, hex).toBeGreaterThan(0.05);
    }
  });

  it('en un azul o un violeta medios, donde lo oscuro sería negro, usa el mismo tono claro', () => {
    for (const hex of ['#2a5cb8', '#7c3aed', '#1e3a8a']) {
      const { bg, ink } = freeChipColors(hex, LIGHT_PAPERS)!;
      const background = toOklch(bg);
      const letter = toOklch(ink);
      expect(letter.l, hex).toBeGreaterThan(background.l);
      expect(hueDistance(letter.h, background.h), hex).toBeLessThan(6);
    }
  });

  it('siempre se lee', () => {
    for (const hex of [
      '#777777',
      '#e11d5e',
      '#0891b2',
      '#d9930b',
      '#7c3aed',
      '#1f9e6a',
      '#ffff00',
      '#2a5cb8',
      '#3f2a1d',
      '#ffffff',
    ]) {
      const { bg, ink } = freeChipColors(hex, LIGHT_PAPERS)!;
      expect(contrast(bg, ink), hex).toBeGreaterThanOrEqual(3);
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
