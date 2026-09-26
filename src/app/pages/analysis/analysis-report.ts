import {
  CategorySummaryResponse,
  SummaryBucketResponse,
  SummarySeriesResponse,
  TransactionFilters,
} from '../../core/models';
import { endOfDay, startOfDay } from '../../core/format/period';

/**
 * Las cuentas de la pantalla de análisis, sin plantilla ni peticiones.
 *
 * Viven aparte porque son lo que hay que poder comprobar: qué periodo se pide, cómo se rellenan
 * los meses sin movimientos y contra qué se compara cada cifra.
 */

/** De qué tamaño es el periodo que se analiza. */
export type AnalysisScope = 'month' | 'year';

/** El periodo que se mira: un mes concreto o un año entero. */
export interface AnalysisPeriod {
  scope: AnalysisScope;
  year: number;
  /** Entre 1 y 12. En la vista anual no se usa, pero se conserva para volver al mismo mes. */
  month: number;
}

/** Cuántos meses enseña la evolución en la vista mensual: el mes elegido y los once de antes. */
export const TREND_MONTHS = 12;

/** Cómo ha cambiado una cifra frente al periodo anterior. */
export interface Change {
  /** Porcentaje de cambio, siempre positivo: el sentido lo dice `direction`. */
  percent: number;
  direction: 'up' | 'down' | 'same';
}

/** Una fila del gasto por categoría. */
export interface CategoryRow {
  categoryId: number;
  name: string;
  expense: number;
  /** Parte del gasto del periodo, de 0 a 100. */
  share: number;
  /** Largo de la barra, de 0 a 100, relativo a la categoría que más gastó. */
  bar: number;
  /** Cambio frente al periodo anterior; nulo si allí no hubo gasto en ella. */
  change: Change | null;
}

/** Lo que dice la evolución de un vistazo, debajo del gráfico. */
export interface TrendStats {
  /** Gasto medio de los meses que ya han pasado o están en curso. */
  averageExpense: number;
  /** El mes que más se gastó, o nulo si no se gastó en ninguno. */
  topExpense: SummaryBucketResponse | null;
  /** El mes con mejor balance, o nulo si no hubo movimientos. */
  bestNet: SummaryBucketResponse | null;
}

/**
 * Los filtros que acotan un periodo.
 *
 * El mes va como mes natural. El año va como rango de fechas: la API solo entiende `year`
 * acompañado de `month`, y un año entero es del 1 de enero al 31 de diciembre.
 *
 * @param period periodo que se mira
 * @return los filtros para el resumen
 */
export function periodFilters(period: AnalysisPeriod): TransactionFilters {
  if (period.scope === 'month') {
    return { month: period.month, year: period.year };
  }
  return {
    dateFrom: startOfDay(`${period.year}-01-01`),
    dateTo: endOfDay(`${period.year}-12-31`),
  };
}

/**
 * El periodo de antes, del mismo tamaño: el mes anterior o el año anterior.
 *
 * @param period periodo que se mira
 * @return el periodo con el que se compara
 */
export function previousPeriod(period: AnalysisPeriod): AnalysisPeriod {
  if (period.scope === 'year') {
    return { ...period, year: period.year - 1 };
  }
  const before = new Date(period.year, period.month - 2, 1);
  return { ...period, month: before.getMonth() + 1, year: before.getFullYear() };
}

/**
 * Mueve el periodo un paso: un mes o un año, según la vista.
 *
 * @param period periodo que se mira
 * @param delta  pasos hacia delante (positivo) o hacia atrás (negativo)
 * @return el periodo nuevo
 */
export function shiftPeriod(period: AnalysisPeriod, delta: number): AnalysisPeriod {
  if (period.scope === 'year') {
    return { ...period, year: period.year + delta };
  }
  const moved = new Date(period.year, period.month - 1 + delta, 1);
  return { ...period, month: moved.getMonth() + 1, year: moved.getFullYear() };
}

/**
 * Si el periodo es el actual o uno futuro, que es cuando no se puede avanzar más.
 *
 * @param period periodo que se mira
 * @param today  hoy, que se recibe para poder probarlo
 * @return si ya está en el presente
 */
export function isCurrentPeriod(period: AnalysisPeriod, today = new Date()): boolean {
  if (period.scope === 'year') {
    return period.year >= today.getFullYear();
  }
  return (
    period.year > today.getFullYear() ||
    (period.year === today.getFullYear() && period.month >= today.getMonth() + 1)
  );
}

/**
 * Los meses que abarca la evolución, del primero al último.
 *
 * En la vista mensual, el mes elegido y los once de antes: así un mes se lee en su contexto
 * y no solo contra el anterior. En la anual, de enero a diciembre de ese año.
 *
 * @param period periodo que se mira
 * @return primer mes del tramo, como año y mes
 */
export function trendStart(period: AnalysisPeriod): { year: number; month: number } {
  if (period.scope === 'year') {
    return { year: period.year, month: 1 };
  }
  const first = new Date(period.year, period.month - TREND_MONTHS, 1);
  return { year: first.getFullYear(), month: first.getMonth() + 1 };
}

/**
 * Los filtros de la evolución: un rango que cubre los doce meses enteros.
 *
 * @param period periodo que se mira
 * @return los filtros para la serie mensual
 */
export function trendFilters(period: AnalysisPeriod): TransactionFilters {
  const start = trendStart(period);
  const endMonth = period.scope === 'year' ? 12 : period.month;
  const lastDay = new Date(period.year, endMonth, 0).getDate();
  return {
    dateFrom: startOfDay(`${start.year}-${pad(start.month)}-01`),
    dateTo: endOfDay(`${period.year}-${pad(endMonth)}-${pad(lastDay)}`),
  };
}

/**
 * La serie con un tramo por cada mes, también los que no tuvieron movimientos.
 *
 * La API solo devuelve los meses con algo, y un gráfico que se salta los vacíos pega marzo a
 * junio como si fueran seguidos: la línea diría que el gasto cambió de golpe cuando lo que pasó
 * es que en medio no hubo nada. Los meses que todavía no han llegado no se rellenan, porque un
 * cero ahí se leería como un mes sin gastos y no como un mes que aún no existe.
 *
 * @param series serie mensual tal y como la devuelve la API
 * @param period periodo que se mira
 * @param today  hoy, que se recibe para poder probarlo
 * @return la serie con un tramo por mes, hasta el mes en curso como mucho
 */
export function fillMonths(
  series: SummarySeriesResponse,
  period: AnalysisPeriod,
  today = new Date(),
): SummarySeriesResponse {
  const byMonth = new Map(series.buckets.map((bucket) => [bucket.periodStart.slice(0, 7), bucket]));
  const start = trendStart(period);
  const limit = today.getFullYear() * 12 + today.getMonth();
  const buckets: SummaryBucketResponse[] = [];
  for (let i = 0; i < TREND_MONTHS; i++) {
    const date = new Date(start.year, start.month - 1 + i, 1);
    if (date.getFullYear() * 12 + date.getMonth() > limit) {
      break;
    }
    const monthKey = `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
    buckets.push(
      byMonth.get(monthKey) ?? {
        periodStart: `${monthKey}-01T00:00:00`,
        income: 0,
        expense: 0,
        net: 0,
        transactionCount: 0,
      },
    );
  }
  return { ...series, granularity: 'MONTH', buckets };
}

/**
 * Cómo ha cambiado una cifra.
 *
 * @param current la del periodo que se mira
 * @param before  la del periodo anterior
 * @return el cambio, o nulo si antes era cero y no hay porcentaje que valga
 */
export function change(current: number, before: number | null | undefined): Change | null {
  if (!before) {
    return null;
  }
  const percent = Math.round(((current - before) / Math.abs(before)) * 100);
  return {
    percent: Math.abs(percent),
    direction: percent > 0 ? 'up' : percent < 0 ? 'down' : 'same',
  };
}

/**
 * Qué parte de lo que entró se quedó sin gastar.
 *
 * @param income  lo que entró
 * @param expense lo que salió
 * @return el porcentaje, negativo si se gastó más de lo que entró; nulo sin ingresos
 */
export function savingsRate(income: number, expense: number): number | null {
  if (income <= 0) {
    return null;
  }
  return Math.round(((income - expense) / income) * 100);
}

/**
 * Las filas del gasto por categoría, de la que más a la que menos.
 *
 * Solo entran las que tuvieron gasto: una categoría de ingresos no reparte nada de lo que se
 * fue. La comparación va por identificador y no por nombre, que se puede cambiar.
 *
 * @param current  desglose del periodo que se mira
 * @param previous desglose del periodo anterior, si se pudo pedir
 * @return las filas listas para pintar
 */
export function categoryRows(
  current: readonly CategorySummaryResponse[],
  previous: readonly CategorySummaryResponse[] | null,
): CategoryRow[] {
  const spent = current.filter((row) => row.expense > 0).sort((a, b) => b.expense - a.expense);
  const total = spent.reduce((sum, row) => sum + row.expense, 0);
  const top = spent[0]?.expense ?? 0;
  const before = new Map((previous ?? []).map((row) => [row.categoryId, row.expense]));
  return spent.map((row) => ({
    categoryId: row.categoryId,
    name: row.category,
    expense: row.expense,
    share: total ? Math.round((row.expense / total) * 100) : 0,
    bar: top ? (row.expense / top) * 100 : 0,
    change: previous ? change(row.expense, before.get(row.categoryId)) : null,
  }));
}

/**
 * Lo que se lee de la evolución sin mirar el gráfico.
 *
 * @param series serie ya rellenada con un tramo por mes
 * @return la media, el mes de más gasto y el de mejor balance
 */
export function trendStats(series: SummarySeriesResponse): TrendStats {
  const buckets = series.buckets;
  const active = buckets.filter((bucket) => bucket.transactionCount > 0);
  const total = buckets.reduce((sum, bucket) => sum + bucket.expense, 0);
  const pick = (better: (a: SummaryBucketResponse, b: SummaryBucketResponse) => boolean) =>
    active.reduce<SummaryBucketResponse | null>(
      (best, bucket) => (best === null || better(bucket, best) ? bucket : best),
      null,
    );
  const topExpense = pick((a, b) => a.expense > b.expense);
  return {
    averageExpense: buckets.length ? total / buckets.length : 0,
    topExpense: topExpense && topExpense.expense > 0 ? topExpense : null,
    bestNet: pick((a, b) => a.net > b.net),
  };
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
