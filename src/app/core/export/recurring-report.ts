/**
 * El informe de fijos de un mes: qué tocaba, qué se pagó, qué falta y qué se omitió.
 */

import { CURRENCIES, formatMoney } from '../format/money';
import { RecurringOccurrenceResponse, RecurringStatus } from '../models';
import {
  CellValue,
  DocumentCell,
  ExportReport,
  ReportBreakdown,
  ReportTotals,
  Tone,
} from './report';

const SHORT_DAY = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short' });

export interface RecurringReportInput {
  items: RecurringOccurrenceResponse[];
  month: number;
  year: number;
  /** El mes en palabras: «Septiembre 2026». */
  period: string;
  /** Lo escrito en el buscador, que también acota lo exportado. */
  search: string;
  brand: string;
  accent: string;
  now?: Date;
}

/** Orden en que se listan: primero lo que reclama atención. */
const STATUS_ORDER: Record<RecurringStatus, number> = {
  OVERDUE: 0,
  PENDING: 1,
  PAID: 2,
  SKIPPED: 3,
  NOT_DUE: 4,
};

/**
 * Cómo se llama cada ritmo. Es el mismo texto que el selector de la pantalla de fijos, para
 * que el informe no hable de una forma y la aplicación de otra.
 */
export function rhythmLabel(everyMonths: number): string {
  switch (everyMonths) {
    case 1:
      return 'Cada mes';
    case 2:
      return 'Cada dos meses';
    case 3:
      return 'Cada tres meses';
    case 6:
      return 'Cada seis meses';
    case 12:
      return 'Una vez al año';
    default:
      return `Cada ${everyMonths} meses`;
  }
}

/** El estado en palabras y con su color. */
export function statusOf(item: RecurringOccurrenceResponse): { label: string; tone: Tone } {
  switch (item.status) {
    case 'PAID':
      return { label: item.type === 'EXPENSE' ? 'Pagado' : 'Cobrado', tone: 'income' };
    case 'OVERDUE':
      return { label: 'Vencido', tone: 'expense' };
    case 'PENDING':
      return { label: 'Pendiente', tone: 'warning' };
    case 'SKIPPED':
      return { label: 'Omitido', tone: 'muted' };
    case 'NOT_DUE':
      return { label: item.active ? 'No toca este mes' : 'En pausa', tone: 'muted' };
  }
}

/**
 * Lee una fecha de la API. Un día suelto (`2026-09-15`) se toma en hora local: con
 * `new Date` a secas sería medianoche en UTC, que en Lima es aún el día anterior.
 */
function parseDate(value?: string): Date | null {
  if (!value) {
    return null;
  }
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3])) : new Date(value);
}

const isExpense = (item: RecurringOccurrenceResponse) => item.type === 'EXPENSE';
const isOpen = (item: RecurringOccurrenceResponse) =>
  item.status === 'PENDING' || item.status === 'OVERDUE';

function totalsOf(items: RecurringOccurrenceResponse[]): ReportTotals[] {
  const used = new Set(items.map((item) => item.currency));
  return CURRENCIES.filter((currency) => used.has(currency)).map((currency) => {
    const own = items.filter((item) => item.currency === currency);
    const due = own.filter((item) => item.status !== 'NOT_DUE');
    const open = due.filter(isOpen);
    const paid = due.filter((item) => item.status === 'PAID');
    const counts = [
      plural(open.filter((item) => item.status === 'OVERDUE').length, 'vencido', 'vencidos'),
      plural(open.filter((item) => item.status === 'PENDING').length, 'pendiente', 'pendientes'),
      plural(paid.length, 'resuelto', 'resueltos'),
      plural(due.filter((item) => item.status === 'SKIPPED').length, 'omitido', 'omitidos'),
    ];
    return {
      currency,
      figures: [
        {
          label: 'Por pagar',
          amount: sum(open.filter(isExpense).map((item) => item.amount)),
          tone: 'expense',
        },
        {
          label: 'Pagado',
          amount: sum(paid.filter(isExpense).map((item) => item.paidAmount ?? item.amount)),
          tone: 'brand',
        },
        {
          label: 'Ingresos fijos',
          amount: sum(
            due
              .filter((item) => !isExpense(item) && item.status !== 'SKIPPED')
              .map((item) => item.paidAmount ?? item.amount),
          ),
          tone: 'income',
        },
      ],
      note: `${plural(due.length, 'fijo vence', 'fijos vencen')} este mes: ${counts.join(' · ')}`,
    };
  });
}

/**
 * Lo que los gastos fijos del mes se llevan de cada categoría.
 * Cuenta lo pagado por lo que se pagó y lo pendiente por lo previsto; lo omitido no cuenta,
 * porque ese mes no va a salir.
 */
function breakdownsOf(items: RecurringOccurrenceResponse[]): ReportBreakdown[] {
  const used = new Set(items.map((item) => item.currency));
  return CURRENCIES.filter((currency) => used.has(currency)).flatMap((currency) => {
    const byCategory = new Map<string, number>();
    for (const item of items) {
      if (
        item.currency === currency &&
        isExpense(item) &&
        item.status !== 'NOT_DUE' &&
        item.status !== 'SKIPPED'
      ) {
        const amount = item.paidAmount ?? item.amount;
        byCategory.set(item.category, (byCategory.get(item.category) ?? 0) + amount);
      }
    }
    const total = sum([...byCategory.values()]);
    if (!total) {
      return [];
    }
    return [
      {
        title: 'Gasto fijo por categoría',
        currency,
        items: [...byCategory.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([label, amount]) => ({ label, amount: sum([amount]), share: amount / total })),
      },
    ];
  });
}

/**
 * Arma el informe de fijos de un mes.
 *
 * @param input fijos del mes, ya acotados por la búsqueda, y el contexto
 * @return el informe, listo para cualquiera de los tres formatos
 */
export function buildRecurringReport(input: RecurringReportInput): ExportReport {
  const items = [...input.items].sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      (a.dueDate ?? '').localeCompare(b.dueDate ?? '') ||
      a.description.localeCompare(b.description, 'es'),
  );

  const rows: CellValue[][] = items.map((item) => {
    const sign = isExpense(item) ? -1 : 1;
    return [
      item.description,
      item.category,
      isExpense(item) ? 'Egreso' : 'Ingreso',
      item.tags.join(', '),
      rhythmLabel(item.everyMonths),
      item.dayOfMonth,
      parseDate(item.dueDate),
      statusOf(item).label,
      item.currency,
      sign * item.amount,
      item.paidAmount === undefined || item.paidAmount === null ? null : sign * item.paidAmount,
      parseDate(item.paidDate),
    ];
  });

  const documentRows: DocumentCell[][] = items.map((item) => {
    const status = statusOf(item);
    const due = parseDate(item.dueDate);
    const paid = parseDate(item.paidDate);
    const sign = isExpense(item) ? '-' : '+';
    const tone: Tone = isExpense(item) ? 'expense' : 'income';
    const muted = item.status === 'NOT_DUE' || item.status === 'SKIPPED';
    return [
      {
        text: item.description,
        sub: [item.category, ...item.tags.map((tag) => `#${tag}`)].join('  ·  '),
        bold: true,
      },
      {
        text: due ? SHORT_DAY.format(due) : `Día ${item.dayOfMonth}`,
        sub: rhythmLabel(item.everyMonths),
      },
      { text: status.label, tone: status.tone, pill: true },
      {
        text: `${sign} ${formatMoney(item.amount, item.currency)}`,
        tone: muted ? 'muted' : tone,
        bold: !muted,
      },
      item.paidAmount === undefined || item.paidAmount === null
        ? { text: '—', tone: 'muted' }
        : {
            text: `${sign} ${formatMoney(item.paidAmount, item.currency)}`,
            tone,
            bold: true,
            sub: paid ? `el ${SHORT_DAY.format(paid)}` : undefined,
          },
    ];
  });

  const filters = input.search.trim() ? [{ label: 'Búsqueda', value: input.search.trim() }] : [];
  const notes = [
    'Previsto es lo que dice la plantilla; pagado, lo que se registró al confirmar el mes.',
    'Por pagar suma los gastos pendientes y vencidos; lo omitido no cuenta este mes.',
  ];
  if (new Set(items.map((item) => item.currency)).size > 1) {
    notes.push('Cada moneda se suma por separado: soles y dólares no se mezclan.');
  }

  return {
    fileName: `finscope-fijos-${input.year}-${String(input.month).padStart(2, '0')}`,
    title: 'Movimientos fijos',
    period: input.period,
    generatedAt: input.now ?? new Date(),
    filters,
    totals: totalsOf(items),
    breakdowns: breakdownsOf(items),
    sheet: {
      name: 'Fijos',
      columns: [
        { header: 'Descripción', kind: 'text', width: 30 },
        { header: 'Categoría', kind: 'text', width: 20 },
        { header: 'Tipo', kind: 'text', width: 10 },
        { header: 'Tags', kind: 'text', width: 24 },
        { header: 'Frecuencia', kind: 'text', width: 16 },
        { header: 'Día', kind: 'integer', width: 7 },
        { header: 'Vence', kind: 'date', width: 12 },
        { header: 'Estado', kind: 'text', width: 16 },
        { header: 'Moneda', kind: 'text', width: 9 },
        { header: 'Previsto', kind: 'money', width: 14 },
        { header: 'Pagado', kind: 'money', width: 14 },
        { header: 'Fecha de pago', kind: 'date', width: 14 },
      ],
      rows,
    },
    document: {
      columns: [
        { header: 'Fijo', width: 36 },
        { header: 'Vence', width: 16 },
        { header: 'Estado', width: 17 },
        { header: 'Previsto', width: 17, align: 'right' },
        { header: 'Pagado', width: 17, align: 'right' },
      ],
      rows: documentRows,
    },
    emptyText: input.search.trim()
      ? `Ningún fijo responde a «${input.search.trim()}».`
      : 'No tienes movimientos fijos.',
    notes,
    brand: input.brand,
    accent: input.accent,
  };
}

function sum(amounts: number[]): number {
  return Math.round(amounts.reduce((total, amount) => total + amount, 0) * 100) / 100;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}
