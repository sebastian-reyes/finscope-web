import { describe, expect, it } from 'vitest';
import {
  AnalysisPeriod,
  categoryRows,
  change,
  fillMonths,
  insights,
  isCurrentPeriod,
  largestExpenses,
  pace,
  periodFilters,
  previousPeriod,
  savingsRate,
  shiftPeriod,
  trendFilters,
  trendStats,
} from './analysis-report';
import {
  SummaryBucketResponse,
  SummarySeriesResponse,
  TransactionResponse,
  TransactionSummaryResponse,
} from '../../core/models';

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

describe('reparto de ingresos por categoría', () => {
  it('reparte lo que entró y deja fuera las categorías sin ingresos', () => {
    const rows = categoryRows(
      [
        { categoryId: 1, category: 'Comida', income: 0, expense: 300, transactionCount: 5 },
        { categoryId: 2, category: 'Sueldo', income: 3000, expense: 0, transactionCount: 1 },
        { categoryId: 4, category: 'Freelance', income: 1000, expense: 0, transactionCount: 2 },
      ],
      null,
      'income',
    );

    expect(rows.map((row) => [row.name, row.amount, row.share])).toEqual([
      ['Sueldo', 3000, 75],
      ['Freelance', 1000, 25],
    ]);
  });
});

function summary(
  income: number,
  expense: number,
  byCategory: TransactionSummaryResponse['byCategory'] = [],
): TransactionSummaryResponse {
  return {
    currency: 'PEN',
    income,
    expense,
    net: income - expense,
    transactionCount: 1,
    byCurrency: [],
    byCategory,
    byTag: [],
  };
}

function cat(categoryId: number, category: string, expense: number) {
  return { categoryId, category, income: 0, expense, transactionCount: 1 };
}

describe('lo que destaca', () => {
  it('explica una subida del gasto con la categoría que más subió', () => {
    const now = summary(3000, 1500, [
      cat(1, 'Comida', 700),
      cat(2, 'Ocio', 500),
      cat(3, 'Casa', 300),
    ]);
    const before = summary(3000, 1200, [
      cat(1, 'Comida', 500),
      cat(2, 'Ocio', 300),
      cat(3, 'Casa', 400),
    ]);

    const [first] = insights(now, before, 'PEN', 'agosto', true);

    // Comida y Ocio suben 200 cada una; gana la primera que llega, y Casa, que bajó, no cuenta.
    expect(first.tone).toBe('bad');
    expect(first).toMatchObject({
      figure: '+S/ 300.00',
      label: 'más de gasto que en agosto',
      detail: 'Lo que más subió: Comida, +S/ 200.00',
    });
    expect(first.text).toBe(
      'Gastaste S/ 300.00 más que en agosto. Lo que más subió: Comida (+S/ 200.00).',
    );
  });

  it('una bajada se cuenta con la categoría donde más se recortó', () => {
    const now = summary(3000, 900, [
      cat(1, 'Comida', 400),
      cat(2, 'Ocio', 100),
      cat(3, 'Casa', 400),
    ]);
    const before = summary(3000, 1200, [
      cat(1, 'Comida', 500),
      cat(2, 'Ocio', 300),
      cat(3, 'Casa', 400),
    ]);

    const [first] = insights(now, before, 'PEN', 'agosto', true);

    expect(first.tone).toBe('good');
    expect(first.text).toContain('Donde más bajó: Ocio (−S/ 200.00)');
  });

  it('con el periodo a medias no compara el gasto, que siempre saldría a la baja', () => {
    const now = summary(3000, 400, [cat(1, 'Comida', 400)]);
    const before = summary(3000, 1200, [cat(1, 'Comida', 1200)]);

    const texts = insights(now, before, 'PEN', 'agosto', false).map((item) => item.text);

    expect(texts.join(' ')).not.toContain('menos que en agosto');
  });

  it('dice cuánto se ahorró, o cuánto se gastó por encima de lo que entró', () => {
    const saved = insights(summary(2000, 1500, [cat(1, 'Comida', 1500)]), null, 'PEN', '', true);
    expect(
      saved.some((item) => item.text === 'Te quedaste con el 25 % de lo que entró: S/ 500.00.'),
    ).toBe(true);

    const over = insights(summary(1000, 1300, [cat(1, 'Comida', 1300)]), null, 'PEN', '', true);
    expect(over[0]).toMatchObject({ tone: 'bad', text: 'Gastaste S/ 300.00 más de lo que entró.' });
  });

  it('avisa si una sola categoría se lleva buena parte del gasto, y nunca dice más de tres cosas', () => {
    const now = summary(3000, 1000, [cat(1, 'Alquiler', 600), cat(2, 'Comida', 400)]);
    const before = summary(3000, 800, [cat(1, 'Alquiler', 600), cat(2, 'Comida', 200)]);

    const found = insights(now, before, 'PEN', 'agosto', true);

    expect(found).toHaveLength(3);
    expect(found[2].text).toBe('Alquiler se lleva el 60 % de lo que gastaste.');
  });
});

function day(date: string, expense: number): SummaryBucketResponse {
  return {
    periodStart: `${date}T00:00:00`,
    income: 0,
    expense,
    net: -expense,
    transactionCount: 1,
  };
}

function daily(...buckets: SummaryBucketResponse[]): SummarySeriesResponse {
  return { currency: 'PEN', granularity: 'DAY', buckets };
}

describe('ritmo del mes', () => {
  const october: AnalysisPeriod = { scope: 'month', month: 10, year: 2026 };

  it('en el mes en curso compara con el anterior el mismo día y proyecta el cierre', () => {
    const result = pace(
      daily(day('2026-10-01', 100), day('2026-10-05', 50)),
      daily(day('2026-09-02', 40), day('2026-09-20', 500)),
      october,
      new Date(2026, 9, 10),
    );

    expect(result.days).toHaveLength(31);
    expect(result.day).toBe(10);
    expect(result.spent).toBe(150);
    expect(result.previousAtDay).toBe(40);
    // 150 en diez días son 15 al día: 465 en los 31 de octubre.
    expect(result.projection).toBe(465);
    // Lo que todavía no ha pasado no es un cero.
    expect(result.current[9]).toBe(150);
    expect(result.current[10]).toBeNull();
  });

  it('alarga el mes anterior con su total cuando tenía menos días', () => {
    const result = pace(daily(), daily(day('2026-09-30', 80)), october, new Date(2026, 11, 1));

    // Septiembre tiene 30 días: el 31 de octubre se compara con su cierre.
    expect(result.previous[30]).toBe(80);
    expect(result.projection).toBeNull();
    expect(result.day).toBe(31);
  });
});

describe('gastos más grandes', () => {
  function tx(id: number, amount: number, currency: 'PEN' | 'USD', exchangeRate?: number) {
    return { id, amount, currency, exchangeRate } as TransactionResponse;
  }

  it('compara monedas distintas convertidas y no por el número a secas', () => {
    const result = largestExpenses(
      [[tx(1, 300, 'PEN'), tx(2, 200, 'PEN')], [tx(3, 100, 'USD', 3.7)]],
      'PEN',
      3.5,
      2,
    );

    // Los cien dólares son S/ 370: pasan por delante de los 300 soles.
    expect(result.map((item) => item.id)).toEqual([3, 1]);
  });

  it('viendo en dólares, pasa los soles con el tipo de referencia', () => {
    const result = largestExpenses([[tx(1, 300, 'PEN')], [tx(2, 90, 'USD')]], 'USD', 3, 2);

    // 300 soles son 100 dólares, más que los 90.
    expect(result.map((item) => item.id)).toEqual([1, 2]);
  });
});
