import { describe, expect, it } from 'vitest';
import {
  AnalysisPeriod,
  categoryRows,
  change,
  fillMonths,
  isCurrentPeriod,
  periodFilters,
  previousPeriod,
  savingsRate,
  shiftPeriod,
  trendFilters,
  trendStats,
} from './analysis-report';
import { SummaryBucketResponse, SummarySeriesResponse } from '../../core/models';

const march: AnalysisPeriod = { scope: 'month', month: 3, year: 2026 };
const year2025: AnalysisPeriod = { scope: 'year', month: 3, year: 2025 };

function bucket(month: string, income: number, expense: number): SummaryBucketResponse {
  return {
    periodStart: `${month}-01T00:00:00`,
    income,
    expense,
    net: income - expense,
    transactionCount: 1,
  };
}

function series(...buckets: SummaryBucketResponse[]): SummarySeriesResponse {
  return { currency: 'PEN', granularity: 'MONTH', buckets };
}

describe('periodo', () => {
  it('pide un mes como mes natural', () => {
    expect(periodFilters(march)).toEqual({ month: 3, year: 2026 });
  });

  it('pide un año como rango de fechas, que es lo único que la API admite', () => {
    expect(periodFilters(year2025)).toEqual({
      dateFrom: '2025-01-01T00:00:00',
      dateTo: '2025-12-31T23:59:59',
    });
  });

  it('compara enero con el diciembre del año anterior', () => {
    expect(previousPeriod({ scope: 'month', month: 1, year: 2026 })).toEqual({
      scope: 'month',
      month: 12,
      year: 2025,
    });
  });

  it('compara un año con el anterior', () => {
    expect(previousPeriod(year2025).year).toBe(2024);
  });

  it('avanza de diciembre a enero', () => {
    expect(shiftPeriod({ scope: 'month', month: 12, year: 2025 }, 1)).toMatchObject({
      month: 1,
      year: 2026,
    });
  });

  it('no deja pasar del mes en curso', () => {
    const today = new Date(2026, 2, 15);
    expect(isCurrentPeriod(march, today)).toBe(true);
    expect(isCurrentPeriod({ ...march, month: 2 }, today)).toBe(false);
    expect(isCurrentPeriod({ scope: 'year', month: 1, year: 2026 }, today)).toBe(true);
  });
});

describe('evolución', () => {
  it('abarca el mes elegido y los once de antes', () => {
    expect(trendFilters(march)).toEqual({
      dateFrom: '2025-04-01T00:00:00',
      dateTo: '2026-03-31T23:59:59',
    });
  });

  it('abarca el año entero en la vista anual', () => {
    expect(trendFilters(year2025)).toEqual({
      dateFrom: '2025-01-01T00:00:00',
      dateTo: '2025-12-31T23:59:59',
    });
  });

  it('rellena con ceros los meses sin movimientos', () => {
    const filled = fillMonths(
      series(bucket('2025-04', 100, 50), bucket('2026-03', 200, 80)),
      march,
      new Date(2026, 2, 20),
    );

    expect(filled.buckets).toHaveLength(12);
    expect(filled.buckets[0].expense).toBe(50);
    expect(filled.buckets[5]).toMatchObject({ periodStart: '2025-09-01T00:00:00', expense: 0 });
    expect(filled.buckets[11].expense).toBe(80);
  });

  it('no inventa los meses que todavía no han llegado', () => {
    const filled = fillMonths(
      series(bucket('2026-01', 100, 50)),
      { scope: 'year', month: 1, year: 2026 },
      new Date(2026, 2, 20),
    );

    expect(filled.buckets.map((b) => b.periodStart.slice(0, 7))).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
    ]);
  });

  it('saca la media, el mes de más gasto y el de mejor balance', () => {
    const stats = trendStats(
      series(bucket('2026-01', 100, 90), bucket('2026-02', 300, 40), bucket('2026-03', 50, 170)),
    );

    expect(stats.averageExpense).toBe(100);
    expect(stats.topExpense?.periodStart).toBe('2026-03-01T00:00:00');
    expect(stats.bestNet?.periodStart).toBe('2026-02-01T00:00:00');
  });

  it('no señala un mes de más gasto si no se gastó nada', () => {
    const stats = trendStats(series(bucket('2026-01', 100, 0)));

    expect(stats.topExpense).toBeNull();
  });
});

describe('cifras', () => {
  it('calcula el cambio frente al periodo anterior', () => {
    expect(change(120, 100)).toEqual({ percent: 20, direction: 'up' });
    expect(change(80, 100)).toEqual({ percent: 20, direction: 'down' });
    expect(change(100, 100)).toEqual({ percent: 0, direction: 'same' });
  });

  it('no da porcentaje contra un periodo en cero', () => {
    expect(change(50, 0)).toBeNull();
    expect(change(50, null)).toBeNull();
  });

  it('mide el ahorro sobre lo que entró', () => {
    expect(savingsRate(1000, 750)).toBe(25);
    expect(savingsRate(1000, 1200)).toBe(-20);
    expect(savingsRate(0, 100)).toBeNull();
  });
});

describe('gasto por categoría', () => {
  const current = [
    { categoryId: 1, category: 'Comida', income: 0, expense: 300, transactionCount: 5 },
    { categoryId: 2, category: 'Sueldo', income: 3000, expense: 0, transactionCount: 1 },
    { categoryId: 3, category: 'Ocio', income: 0, expense: 100, transactionCount: 2 },
  ];

  it('deja fuera lo que no tuvo gasto y ordena de más a menos', () => {
    const rows = categoryRows(current, null);

    expect(rows.map((row) => row.name)).toEqual(['Comida', 'Ocio']);
    expect(rows.map((row) => row.share)).toEqual([75, 25]);
    expect(rows[1].bar).toBeCloseTo(33.33, 1);
  });

  it('compara cada categoría con la misma del periodo anterior', () => {
    const rows = categoryRows(current, [
      { categoryId: 1, category: 'Comida', income: 0, expense: 200, transactionCount: 4 },
    ]);

    expect(rows[0].change).toEqual({ percent: 50, direction: 'up' });
    expect(rows[1].change).toBeNull();
  });
});
