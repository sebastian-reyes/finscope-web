import { describe, expect, it } from 'vitest';
import { MAX_SLICES } from '../../core/format/chart-palette';
import { CategorySummaryResponse, TagSummaryResponse } from '../../core/models';
import { categorySlices, tagSlices } from './spending-chart';

const COLORS = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5'];
const OTHER = 'gris';

function category(name: string, expense: number, count = 1): CategorySummaryResponse {
  return { categoryId: name.length, category: name, income: 0, expense, transactionCount: count };
}

function tag(name: string | null, expense: number, count = 1): TagSummaryResponse {
  return { tag: name, income: 0, expense, transactionCount: count };
}

describe('categorySlices', () => {
  it('deja fuera lo que no tuvo gasto, que no ocupa sitio en un reparto de egresos', () => {
    const slices = categorySlices([category('Casa', 100), category('Sueldo', 0)], COLORS, OTHER);

    expect(slices.map((slice) => slice.label)).toEqual(['Casa']);
    expect(slices[0].filter).toEqual({ categoria: 4 });
  });

  it('agrupa la cola en «Otras» conservando su suma, para que el reparto siga cuadrando', () => {
    const rows = Array.from({ length: MAX_SLICES + 3 }, (_, index) =>
      category(`Cat ${index}`, 10, 2),
    );

    const slices = categorySlices(rows, COLORS, OTHER);
    const last = slices[slices.length - 1];

    expect(slices).toHaveLength(MAX_SLICES + 1);
    expect(last.label).toBe('Otras (3)');
    expect(last.value).toBe(30);
    expect(last.count).toBe(6);
    expect(last.color).toBe(OTHER);
    // «Otras» son varias categorías a la vez: no hay un filtro que las aísle.
    expect(last.filter).toBeNull();
    // El total dibujado sigue siendo el gasto entero del periodo.
    expect(slices.reduce((sum, slice) => sum + slice.value, 0)).toBe(rows.length * 10);
  });
});

describe('tagSlices', () => {
  it('no agrupa la cola: sumarla contaría dos veces el movimiento con varios tags', () => {
    const rows = Array.from({ length: MAX_SLICES + 3 }, (_, index) => tag(`tag${index}`, 10));

    const slices = tagSlices(rows, COLORS, OTHER);

    expect(slices).toHaveLength(MAX_SLICES + 1);
    expect(slices.some((slice) => slice.label.startsWith('Otr'))).toBe(false);
  });

  it('nombra el grupo sin tag y lo pinta en gris, porque no es un tag más', () => {
    const slices = tagSlices([tag(null, 40, 3), tag('ocio', 25, 2)], COLORS, OTHER);

    expect(slices[0]).toEqual({
      label: 'Sin tag',
      value: 40,
      count: 3,
      color: OTHER,
      // La falta de tag no es un valor por el que el historial pueda filtrar.
      filter: null,
    });
    expect(slices[1].color).toBe(COLORS[1]);
  });

  it('lleva cada tag a su propio filtro del historial', () => {
    const [slice] = tagSlices([tag('ocio', 25, 2)], COLORS, OTHER);

    expect(slice.filter).toEqual({ tag: 'ocio' });
  });

  it('conserva la cuenta de movimientos, que es lo que la leyenda enseña en vez del reparto', () => {
    const [slice] = tagSlices([tag('viaje', 90, 7)], COLORS, OTHER);

    expect(slice.count).toBe(7);
  });
});
