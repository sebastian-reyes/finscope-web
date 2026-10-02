/**
 * El informe de movimientos: las filas que dejan pasar los filtros de la pantalla.
 */

import { BASE_CURRENCY, CURRENCIES, formatMoney, toBaseCurrency } from '../format/money';
import { Currency, TransactionResponse } from '../models';
import { CellValue, DocumentCell, ExportReport, ReportBreakdown, ReportTotals } from './report';

/** Cuántas categorías se nombran en el reparto; el resto se junta en «Otras». */
const BREAKDOWN_SIZE = 8;

const DAY = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', year: 'numeric' });
const TIME = new Intl.DateTimeFormat('es-PE', { hour: '2-digit', minute: '2-digit' });

export interface TransactionsReportInput {
  transactions: TransactionResponse[];
  /** El periodo en palabras, como lo enseña la pantalla. */
  period: string;
  /** El periodo para el nombre del archivo: `2026-09`, `historial`… */
  periodSlug: string;
  filters: { label: string; value: string }[];
  brand: string;
  accent: string;
  now?: Date;
}

const isIncome = (transaction: TransactionResponse) =>
  transaction.transactionType.code === 'INCOME';

/** Las monedas que aparecen, en el orden de la aplicación. */
function currenciesOf(transactions: TransactionResponse[]): Currency[] {
  const used = new Set(transactions.map((transaction) => transaction.currency));
  return CURRENCIES.filter((currency) => used.has(currency));
}

/**
 * Los totales de cada moneda, sacados de las mismas filas que se exportan.
 * No se piden al resumen de la API para que el número de arriba y la suma de la tabla no
 * puedan discrepar: son la misma lista sumada.
 */
function totalsOf(transactions: TransactionResponse[]): ReportTotals[] {
  return currenciesOf(transactions).map((currency) => {
    const own = transactions.filter((transaction) => transaction.currency === currency);
    const incomes = own.filter(isIncome);
    const expenses = own.filter((transaction) => !isIncome(transaction));
    const income = sum(incomes.map((transaction) => transaction.amount));
    const expense = sum(expenses.map((transaction) => transaction.amount));
    return {
      currency,
      figures: [
        { label: 'Ingresos', amount: income, tone: 'income' },
        { label: 'Egresos', amount: expense, tone: 'expense' },
        {
          label: 'Balance',
          amount: round(income - expense),
          tone: income - expense < 0 ? 'expense' : 'income',
          signed: true,
        },
      ],
      note: [
        plural(own.length, 'movimiento', 'movimientos'),
        plural(incomes.length, 'ingreso', 'ingresos'),
        plural(expenses.length, 'egreso', 'egresos'),
      ].join(' · '),
    };
  });
}

/** El gasto de cada moneda repartido por categoría, de más a menos. */
function breakdownsOf(transactions: TransactionResponse[]): ReportBreakdown[] {
  return currenciesOf(transactions).flatMap((currency) => {
    const byCategory = new Map<string, number>();
    for (const transaction of transactions) {
      if (transaction.currency === currency && !isIncome(transaction)) {
        const name = transaction.category.name;
        byCategory.set(name, (byCategory.get(name) ?? 0) + transaction.amount);
      }
    }
    const total = sum([...byCategory.values()]);
    if (!total) {
      return [];
    }
    const sorted = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
    const shown = sorted.slice(0, BREAKDOWN_SIZE);
    const rest = sorted.slice(BREAKDOWN_SIZE);
    if (rest.length) {
      shown.push([`Otras (${rest.length})`, sum(rest.map(([, amount]) => amount))]);
    }
    return [
      {
        title: 'Gasto por categoría',
        currency,
        items: shown.map(([label, amount]) => ({
          label,
          amount: round(amount),
          share: amount / total,
        })),
      },
    ];
  });
}

/**
 * Arma el informe de movimientos.
 *
 * @param input movimientos ya filtrados y el contexto con el que se pidieron
 * @return el informe, listo para cualquiera de los tres formatos
 */
export function buildTransactionsReport(input: TransactionsReportInput): ExportReport {
  const { transactions } = input;
  const severalCurrencies = currenciesOf(transactions).length > 1;
  const hasForeign = transactions.some((transaction) => transaction.currency !== BASE_CURRENCY);

  const rows: CellValue[][] = transactions.map((transaction) => {
    const sign = isIncome(transaction) ? 1 : -1;
    const base =
      transaction.currency === BASE_CURRENCY
        ? transaction.amount
        : transaction.exchangeRate
          ? toBaseCurrency(transaction.amount, transaction.exchangeRate)
          : null;
    return [
      new Date(transaction.date),
      transaction.description?.trim() ?? '',
      transaction.category.name,
      isIncome(transaction) ? 'Ingreso' : 'Egreso',
      transaction.tags.join(', '),
      transaction.currency,
      sign * transaction.amount,
      transaction.currency === BASE_CURRENCY ? null : (transaction.exchangeRate ?? null),
      base === null ? null : sign * base,
    ];
  });

  const documentRows: DocumentCell[][] = transactions.map((transaction) => {
    const date = new Date(transaction.date);
    const income = isIncome(transaction);
    const description = transaction.description?.trim();
    return [
      { text: DAY.format(date), sub: TIME.format(date) },
      {
        text: description || transaction.category.name,
        sub: transaction.tags.length
          ? transaction.tags.map((tag) => `#${tag}`).join('  ')
          : undefined,
        bold: true,
      },
      { text: transaction.category.name },
      {
        text: `${income ? '+' : '-'} ${formatMoney(transaction.amount, transaction.currency)}`,
        tone: income ? 'income' : 'expense',
        bold: true,
        sub:
          transaction.currency !== BASE_CURRENCY && transaction.exchangeRate
            ? `T. C. ${transaction.exchangeRate}`
            : undefined,
      },
    ];
  });

  const notes = [
    'Los egresos van en negativo, de modo que sumar la columna de montos da el balance.',
  ];
  if (severalCurrencies) {
    notes.push(
      'Cada moneda se suma por separado: soles y dólares no se mezclan en un mismo total.',
    );
  }
  if (hasForeign) {
    notes.push(
      'El equivalente en soles usa el tipo de cambio con el que se registró cada movimiento.',
    );
  }

  return {
    fileName: `finscope-movimientos-${input.periodSlug}`,
    title: 'Movimientos',
    period: input.period,
    generatedAt: input.now ?? new Date(),
    filters: input.filters,
    totals: totalsOf(transactions),
    breakdowns: breakdownsOf(transactions),
    sheet: {
      name: 'Movimientos',
      columns: [
        { header: 'Fecha', kind: 'datetime', width: 17 },
        { header: 'Descripción', kind: 'text', width: 34 },
        { header: 'Categoría', kind: 'text', width: 20 },
        { header: 'Tipo', kind: 'text', width: 11 },
        { header: 'Tags', kind: 'text', width: 26 },
        { header: 'Moneda', kind: 'text', width: 9 },
        { header: 'Monto', kind: 'money', width: 14 },
        { header: 'Tipo de cambio', kind: 'rate', width: 15 },
        { header: 'Monto en soles', kind: 'money', width: 16 },
      ],
      rows,
    },
    document: {
      columns: [
        { header: 'Fecha', width: 15 },
        { header: 'Descripción', width: 40 },
        { header: 'Categoría', width: 22 },
        { header: 'Monto', width: 20, align: 'right' },
      ],
      rows: documentRows,
    },
    emptyText: 'No hay movimientos con estos filtros.',
    notes,
    brand: input.brand,
    accent: input.accent,
  };
}

function sum(amounts: number[]): number {
  return round(amounts.reduce((total, amount) => total + amount, 0));
}

/** Redondea a céntimos, para que sumar decimales no deje restos como `0.30000000000000004`. */
function round(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
