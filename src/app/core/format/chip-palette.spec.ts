import { describe, expect, it } from 'vitest';
import { CHIP_VARIANTS, chipPalette } from './chip-palette';
import { contrast, hueOf } from './color';

/** El azul de fábrica, que es contra el que se midieron los colores originales. */
const DEFAULT_PRIMARY = '#2a5cb8';

/** Las ocho fichas que había escritas a mano antes de que la paleta girara. */
const ORIGINAL_LIGHT = [
  { bg: '#e8eefb', ink: '#2c4c8f' },
  { bg: '#e6f2ec', ink: '#216b50' },
  { bg: '#fdeee2', ink: '#8f5220' },
  { bg: '#f0e9fa', ink: '#5a3f96' },
  { bg: '#fbe9ef', ink: '#91375a' },
  { bg: '#e4f1f6', ink: '#1f5f78' },
  { bg: '#f2f0e4', ink: '#6a6425' },
  { bg: '#eceef1', ink: '#454f5c' },
];

/** Separación mínima en grados entre dos fichas seguidas de la rueda. */
function hueGaps(colors: readonly string[]): number[] {
  return colors.map((color, index) => {
    const next = colors[(index + 1) % colors.length];
    return Math.abs(((hueOf(next) - hueOf(color) + 540) % 360) - 180);
  });
}

describe('chipPalette', () => {
  it('devuelve las mismas fichas de siempre con el color de fábrica', () => {
    // Es la comprobación que permite girar la paleta sin rehacerla: si esto falla, la
    // aplicación cambió de aspecto sin que nadie lo pidiera.
    expect(chipPalette(DEFAULT_PRIMARY, 'light')).toEqual(ORIGINAL_LIGHT);
  });

  it('da una pareja por variante en los dos temas', () => {
    for (const theme of ['light', 'dark'] as const) {
      expect(chipPalette('#d9930b', theme)).toHaveLength(CHIP_VARIANTS);
    }
  });

  it('gira la rueda entera sin acercar unas fichas a otras', () => {
    const original = hueGaps(chipPalette(DEFAULT_PRIMARY, 'light').map((chip) => chip.ink));
    const rotated = hueGaps(chipPalette('#d9930b', 'light').map((chip) => chip.ink));

    // Tres grados de holgura, frente a huecos de decenas: los colores se guardan en
    // hexadecimal, y redondear tres canales a 256 pasos mueve el tono resultante una pizca.
    rotated.forEach((gap, index) => expect(Math.abs(gap - original[index])).toBeLessThan(3));
  });

  it('deja la tinta legible sobre su propio fondo, se elija lo que se elija', () => {
    for (const primary of ['#2a5cb8', '#d9930b', '#7c3aed', '#e11d5e', '#0891b2']) {
      for (const theme of ['light', 'dark'] as const) {
        for (const chip of chipPalette(primary, theme)) {
          expect(contrast(chip.ink, chip.bg)).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });
});
