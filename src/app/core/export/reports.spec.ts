import { describe, expect, it } from 'vitest';
import { RecurringOccurrenceResponse, TransactionResponse } from '../models';
import { buildRecurringReport } from './recurring-report';
import { buildTransactionsReport } from './transactions-report';

function transaction(overrides: Partial<TransactionResponse> = {}): TransactionResponse {
  return {
    id: 1,
    amount: 50,
    currency: 'PEN',
    description: 'Almuerzo',
    date: '2026-09-14T18:05:00',
    transactionType: { id: 2, name: 'Egreso', code: 'EXPENSE' },
    category: {
      id: 3,
      name: 'Comida',
      appliesTo: 'EXPENSE',
      isSystem: false,
      transactionCount: 0,
    },
    tags: ['equipo'],
    ...overrides,
  };
}

const income = (amount: number, currency: 'PEN' | 'USD' = 'PEN') =>
  transaction({
    amount,
    currency,
    description: 'Sueldo',
    transactionType: { id: 1, name: 'Ingreso', code: 'INCOME' },
    category: { id: 9, name: 'Sueldo', appliesTo: 'INCOME', isSystem: false, transactionCount: 0 },
    tags: [],
  });

const base = {
  period: 'Septiembre 2026',
  periodSlug: '2026-09',
  filters: [{ label: 'Tag', value: 'equipo' }],
  brand: '#2a5cb8',
  accent: '#1f9e6a',
};

describe('buildTransactionsReport', () => {
  it('suma cada moneda por separado, sin mezclar soles con dólares', () => {
    const report = buildTransactionsReport({
      ...base,
      transactions: [
        income(1000),
        transaction({ amount: 120.1 }),
        transaction({ amount: 0.2 }),
        transaction({ amount: 20, currency: 'USD', exchangeRate: 3.7 }),
      ],
    });

    expect(report.totals.map((totals) => totals.currency)).toEqual(['PEN', 'USD']);
    const [soles, dollars] = report.totals;
    expect(soles.figures.map((figure) => figure.amount)).toEqual([1000, 120.3, 879.7]);
    expect(soles.note).toBe('3 movimientos · 1 ingreso · 2 egresos');
    expect(dollars.figures.map((figure) => figure.amount)).toEqual([0, 20, -20]);
    expect(dollars.figures[2].tone).toBe('expense');
  });

  it('pone los egresos en negativo y el equivalente en soles con la tasa de cada uno', () => {
    const report = buildTransactionsReport({
      ...base,
      transactions: [transaction({ amount: 20, currency: 'USD', exchangeRate: 3.7 }), income(10)],
    });
    const [dollars, soles] = report.sheet.rows;

    expect(dollars.slice(1)).toEqual([
      'Almuerzo',
      'Comida',
      'Egreso',
      'equipo',
      'USD',
      -20,
      3.7,
      -74,
    ]);
    expect(soles.slice(5)).toEqual(['PEN', 10, null, 10]);
    expect(dollars[0]).toEqual(new Date('2026-09-14T18:05:00'));
  });

  it('reparte el gasto por categoría, de más a menos, y junta lo que no cabe en «Otras»', () => {
    const transactions = Array.from({ length: 10 }, (_, index) =>
      transaction({
        amount: (index + 1) * 10,
        category: {
          id: index,
          name: `Categoría ${index + 1}`,
          appliesTo: 'EXPENSE',
          isSystem: false,
          transactionCount: 0,
        },
      }),
    );
    const [breakdown] = buildTransactionsReport({ ...base, transactions }).breakdowns;

    expect(breakdown.items[0]).toMatchObject({ label: 'Categoría 10', amount: 100 });
    expect(breakdown.items.at(-1)).toMatchObject({ label: 'Otras (2)', amount: 30 });
    expect(breakdown.items.reduce((total, item) => total + item.share, 0)).toBeCloseTo(1);
  });

  it('lleva los filtros y el periodo al informe y al nombre del archivo', () => {
    const report = buildTransactionsReport({ ...base, transactions: [] });

    expect(report.fileName).toBe('finscope-movimientos-2026-09');
    expect(report.filters).toEqual([{ label: 'Tag', value: 'equipo' }]);
    expect(report.totals).toEqual([]);
    expect(report.sheet.rows).toEqual([]);
  });

  it('en el PDF, la descripción manda y la categoría va en su columna', () => {
    const report = buildTransactionsReport({
      ...base,
      transactions: [transaction({ description: '' })],
    });
    const [date, description, category, amount] = report.document.rows[0];

    expect(date.sub).toBeTruthy();
    expect(description).toMatchObject({ text: 'Comida', sub: '#equipo' });
    expect(category.text).toBe('Comida');
    expect(amount).toMatchObject({ text: '- S/ 50.00', tone: 'expense' });
  });
});

function recurring(overrides: Partial<RecurringOccurrenceResponse>): RecurringOccurrenceResponse {
  return {
    id: 1,
    categoryId: 1,
    transactionTypeId: 2,
    description: 'Internet',
    amount: 100,
    currency: 'PEN',
    dayOfMonth: 10,
    everyMonths: 1,
    startMonth: 1,
    startYear: 2026,
    active: true,
    tags: [],
    category: 'Servicios',
    type: 'EXPENSE',
    month: 9,
    year: 2026,
    dueDate: '2026-09-10',
    status: 'PENDING',
    ...overrides,
  };
}

describe('buildRecurringReport', () => {
  const items = [
    recurring({ id: 1, description: 'Luz', status: 'PAID', amount: 90, paidAmount: 95.5 }),
    recurring({ id: 2, description: 'Agua', status: 'OVERDUE', amount: 40 }),
    recurring({ id: 3, description: 'Internet', status: 'PENDING', amount: 100 }),
    recurring({ id: 4, description: 'Gimnasio', status: 'SKIPPED', amount: 150 }),
    recurring({ id: 5, description: 'Seguro', status: 'NOT_DUE', dueDate: undefined }),
    recurring({ id: 6, description: 'Sueldo', status: 'PENDING', type: 'INCOME', amount: 3000 }),
  ];
  const report = buildRecurringReport({
    items,
    month: 9,
    year: 2026,
    period: 'Septiembre 2026',
    search: '',
    brand: '#2a5cb8',
    accent: '#1f9e6a',
  });

  it('ordena primero lo que reclama atención', () => {
    expect(report.sheet.rows.map((row) => row[0])).toEqual([
      'Agua',
      'Internet',
      'Sueldo',
      'Luz',
      'Gimnasio',
      'Seguro',
    ]);
  });

  it('suma lo que falta, lo pagado por lo que se pagó y deja fuera lo omitido', () => {
    const [soles] = report.totals;
    expect(soles.figures.map((figure) => [figure.label, figure.amount])).toEqual([
      ['Por pagar', 140],
      ['Pagado', 95.5],
      ['Ingresos fijos', 3000],
    ]);
    expect(soles.note).toBe(
      '5 fijos vencen este mes: 1 vencido · 2 pendientes · 1 resuelto · 1 omitido',
    );
  });

  it('lee el día de vencimiento en hora local', () => {
    const due = report.sheet.rows[0][6] as Date;
    expect([due.getFullYear(), due.getMonth(), due.getDate()]).toEqual([2026, 8, 10]);
  });

  it('marca el estado como pastilla en el PDF', () => {
    expect(report.document.rows[0][2]).toEqual({ text: 'Vencido', tone: 'expense', pill: true });
    expect(report.document.rows.at(-1)![2].text).toBe('No toca este mes');
  });

  it('dice la búsqueda cuando acota', () => {
    const searched = buildRecurringReport({
      items: [],
      month: 9,
      year: 2026,
      period: 'Septiembre 2026',
      search: ' netflix ',
      brand: '#2a5cb8',
      accent: '#1f9e6a',
    });
    expect(searched.filters).toEqual([{ label: 'Búsqueda', value: 'netflix' }]);
    expect(searched.emptyText).toContain('netflix');
    expect(searched.fileName).toBe('finscope-fijos-2026-09');
  });
});
