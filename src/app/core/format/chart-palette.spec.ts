import { describe, expect, it } from 'vitest';
import { MAX_SLICES, chartPalette } from './chart-palette';
import { buildRamp, contrast } from './color';

const DEFAULT = { primary: '#2a5cb8', secondary: '#1f9e6a' } as const;

describe('chartPalette', () => {
  it('deja fuera de la elección el verde del ingreso y el rojo del egreso', () => {
    // Son los dos únicos colores del gráfico que informan: si siguieran al gusto de cada uno
    // dejarían de querer decir lo que dicen en el resto de la aplicación.
    const chosen = chartPalette('light', '#7c3aed', '#d9930b');
    const factory = chartPalette('light', DEFAULT.primary, DEFAULT.secondary);

    expect(chosen.income).toBe(factory.income);
    expect(chosen.expense).toBe(factory.expense);
  });

  it('mete los dos colores elegidos entre las porciones, ya ajustados al papel', () => {
    // No entran crudos: un ámbar claro sobre papel blanco no se ve, así que lo que aparece
    // es el mismo color con la claridad que hace falta para distinguirlo del fondo.
    const palette = chartPalette('light', '#7c3aed', '#d9930b');

    expect(palette.categorical).toContain(buildRamp('#7c3aed', 'light').base);
    expect(palette.categorical).toContain(buildRamp('#d9930b', 'light').base);
  });

  it('sigue repartiendo una porción más de las que se dibujan antes de agrupar', () => {
    expect(chartPalette('dark', DEFAULT.primary, DEFAULT.secondary).categorical).toHaveLength(
      MAX_SLICES + 1,
    );
  });

  it('no repite ninguna porción, que es lo que las hace distinguibles', () => {
    for (const [primary, secondary] of [
      [DEFAULT.primary, DEFAULT.secondary],
      ['#d9930b', '#0891b2'],
      // Los dos casi iguales: es el peor caso, porque el secundario desplaza justo a la
      // porción a la que más se parece.
      ['#2a5cb8', '#4f46e5'],
    ]) {
      for (const theme of ['light', 'dark'] as const) {
        const slices = chartPalette(theme, primary, secondary).categorical;
        expect(new Set(slices).size).toBe(slices.length);
      }
    }
  });

  it('deja cada porción legible sobre el papel del gráfico', () => {
    for (const theme of ['light', 'dark'] as const) {
      const palette = chartPalette(theme, '#d9930b', '#0891b2');
      for (const slice of [...palette.categorical, palette.other]) {
        expect(contrast(slice, palette.surface)).toBeGreaterThanOrEqual(2.5);
      }
    }
  });

  it('tiñe la rejilla y las tintas con el color elegido', () => {
    // El papel del gráfico queda fuera a propósito: en claro es casi blanco, y ahí el tinte
    // no llega ni a un paso de los 256 que tiene un canal.
    const warm = chartPalette('light', '#d9930b', '#0891b2');
    const cool = chartPalette('light', '#2a5cb8', '#1f9e6a');

    expect(warm.grid).not.toBe(cool.grid);
    expect(warm.ink).not.toBe(cool.ink);
    expect(warm.inkMuted).not.toBe(cool.inkMuted);
  });
});
