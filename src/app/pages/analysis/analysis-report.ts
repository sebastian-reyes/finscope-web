import {
  CategorySummaryResponse,
  Currency,
  SummaryBucketResponse,
  SummarySeriesResponse,
  TransactionFilters,
  TransactionResponse,
  TransactionSummaryResponse,
} from '../../core/models';
import { endOfDay, startOfDay } from '../../core/format/period';
import { formatMoney, toBaseCurrency } from '../../core/format/money';

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

/** Qué lado del dinero se reparte por categoría: lo que salió o lo que entró. */
export type CategorySide = 'expense' | 'income';

/** Una fila del reparto por categoría. */
export interface CategoryRow {
  categoryId: number;
  name: string;
  /** Importe del lado que se reparte: el gasto, o el ingreso. */
  amount: number;
  /** Parte del total del periodo, de 0 a 100. */
  share: number;
  /** Largo de la barra, de 0 a 100, relativo a la categoría con más importe. */
  bar: number;
  /** Cambio frente al periodo anterior; nulo si allí no hubo importe en ella. */
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
 * Las filas del reparto por categoría, de la que más a la que menos.
 *
 * Solo entran las que tuvieron importe en el lado que se mira: una categoría de ingresos no
 * reparte nada de lo que se fue, ni una de gastos nada de lo que entró. La comparación va por
 * identificador y no por nombre, que se puede cambiar.
 *
 * @param current  desglose del periodo que se mira
 * @param previous desglose del periodo anterior, si se pudo pedir
 * @param side     qué se reparte: el gasto, que es lo normal, o el ingreso
 * @return las filas listas para pintar
 */
export function categoryRows(
  current: readonly CategorySummaryResponse[],
  previous: readonly CategorySummaryResponse[] | null,
  side: CategorySide = 'expense',
): CategoryRow[] {
  const rows = current.filter((row) => row[side] > 0).sort((a, b) => b[side] - a[side]);
  const total = rows.reduce((sum, row) => sum + row[side], 0);
  const top = rows[0]?.[side] ?? 0;
  const before = new Map((previous ?? []).map((row) => [row.categoryId, row[side]]));
  return rows.map((row) => ({
    categoryId: row.categoryId,
    name: row.category,
    amount: row[side],
    share: total ? Math.round((row[side] / total) * 100) : 0,
    bar: top ? (row[side] / top) * 100 : 0,
    change: previous ? change(row[side], before.get(row.categoryId)) : null,
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

/**
 * Una conclusión de la tarjeta «Lo que destaca».
 *
 * Va dos veces: entera en `text`, que es lo que lee un lector de pantalla, y partida en cifra,
 * rótulo y detalle, que es como se dibuja. La cifra va en grande porque es lo que se ve desde
 * lejos; el rótulo dice qué es esa cifra, y el detalle, de dónde sale.
 */
export interface Insight {
  icon: string;
  /** Si es una buena noticia, una mala o solo un dato. Decide el color y la etiqueta. */
  tone: 'good' | 'bad' | 'neutral';
  /** La frase entera. */
  text: string;
  /** La cifra protagonista: «+S/ 300.00», «25 %». */
  figure: string;
  /** Qué es esa cifra, en minúscula y sin punto: «más de gasto que en agosto». */
  label: string;
  /** De dónde sale, si hay algo que añadir: «Sobre todo Comida, +S/ 200.00». */
  detail: string | null;
}

/** Cuántas conclusiones se enseñan como mucho: más de tres ya no se leen de un vistazo. */
export const MAX_INSIGHTS = 3;

/** A partir de qué parte del gasto una sola categoría merece decirse. */
const CONCENTRATION_SHARE = 35;

/**
 * Lo que hay que saber del periodo, dicho en frases y no en cifras.
 *
 * Las tarjetas de arriba dicen cuánto cambió el gasto; esto dice por qué, que es lo que se
 * queda uno preguntando al ver un «+18 %». Cada frase sale de una cuenta concreta y se omite
 * si no hay datos para decirla bien:
 *
 * - **El motor del cambio**: la categoría que más explica que el gasto subiera o bajara. Solo
 *   con periodos cerrados, porque un mes a medias contra uno entero siempre sale «gastaste
 *   menos», y eso no es una conclusión sino un calendario. Para el mes en curso está el ritmo.
 * - **El ahorro**: qué parte de lo que entró se quedó, o cuánto se gastó por encima.
 * - **La concentración**: si una sola categoría se lleva buena parte del gasto.
 *
 * @param now      resumen del periodo que se mira
 * @param before   resumen del periodo anterior, si se pudo pedir
 * @param currency moneda en la que vienen las cifras
 * @param versus   con qué se compara, ya escrito: «agosto», «2025»
 * @param closed   si el periodo ya terminó, que es cuando la comparación es justa
 * @return las conclusiones, de la más a la menos importante
 */
export function insights(
  now: TransactionSummaryResponse,
  before: TransactionSummaryResponse | null,
  currency: Currency,
  versus: string,
  closed: boolean,
): Insight[] {
  const money = (amount: number) => formatMoney(amount, currency);
  const found: Insight[] = [];

  if (closed && before && before.expense > 0 && now.expense !== before.expense) {
    const diff = now.expense - before.expense;
    const rose = diff > 0;
    const driver = biggestMove(now.byCategory, before.byCategory, rose);
    const head = rose
      ? `Gastaste ${money(diff)} más que en ${versus}.`
      : `Gastaste ${money(-diff)} menos que en ${versus}.`;
    let tail = '';
    let detail: string | null = null;
    if (driver && rose) {
      tail = ` Lo que más subió: ${driver.name} (+${money(driver.delta)}).`;
      detail = `Lo que más subió: ${driver.name}, +${money(driver.delta)}`;
    } else if (driver) {
      tail = ` Donde más bajó: ${driver.name} (−${money(-driver.delta)}).`;
      detail = `Donde más bajó: ${driver.name}, −${money(-driver.delta)}`;
    }
    found.push({
      icon: rose ? 'bi-graph-up-arrow' : 'bi-graph-down-arrow',
      tone: rose ? 'bad' : 'good',
      text: head + tail,
      figure: `${rose ? '+' : '−'}${money(Math.abs(diff))}`,
      label: `${rose ? 'más' : 'menos'} de gasto que en ${versus}`,
      detail,
    });
  }

  const rate = savingsRate(now.income, now.expense);
  if (rate !== null && rate < 0) {
    const over = money(now.expense - now.income);
    found.push({
      icon: 'bi-exclamation-triangle',
      tone: 'bad',
      text: `Gastaste ${over} más de lo que entró.`,
      figure: over,
      label: 'gastado por encima de lo que entró',
      detail: `Entraron ${money(now.income)} y salieron ${money(now.expense)}`,
    });
  } else if (rate !== null && now.expense > 0) {
    found.push({
      icon: 'bi-piggy-bank',
      tone: rate >= 20 ? 'good' : 'neutral',
      text: `Te quedaste con el ${rate} % de lo que entró: ${money(now.net)}.`,
      figure: `${rate} %`,
      label: 'de lo que entró se quedó contigo',
      detail: `${money(now.net)} sin gastar`,
    });
  }

  const top = categoryRows(now.byCategory, null)[0];
  if (top && top.share >= CONCENTRATION_SHARE) {
    found.push({
      icon: 'bi-pie-chart',
      tone: 'neutral',
      text: `${top.name} se lleva el ${top.share} % de lo que gastaste.`,
      figure: `${top.share} %`,
      label: `de tu gasto se fue en ${top.name}`,
      detail: money(top.amount),
    });
  }

  return found.slice(0, MAX_INSIGHTS);
}

/**
 * La categoría cuyo gasto más se movió en el sentido del total.
 *
 * Si el gasto subió interesa la que más subió, aunque otra bajara más: lo que se busca es la
 * explicación de lo que pasó, no el mayor cambio a secas.
 *
 * @param now    desglose del periodo que se mira
 * @param before desglose del periodo anterior
 * @param rose   si el gasto total subió
 * @return la categoría y cuánto cambió, o nulo si ninguna se movió en ese sentido
 */
function biggestMove(
  now: readonly CategorySummaryResponse[],
  before: readonly CategorySummaryResponse[],
  rose: boolean,
): { name: string; delta: number } | null {
  const deltas = new Map<number, { name: string; delta: number }>();
  for (const row of before) {
    deltas.set(row.categoryId, { name: row.category, delta: -row.expense });
  }
  for (const row of now) {
    const earlier = deltas.get(row.categoryId)?.delta ?? 0;
    deltas.set(row.categoryId, { name: row.category, delta: row.expense + earlier });
  }
  let best: { name: string; delta: number } | null = null;
  for (const entry of deltas.values()) {
    const moved = rose ? entry.delta > 0 : entry.delta < 0;
    if (moved && (!best || Math.abs(entry.delta) > Math.abs(best.delta))) {
      best = entry;
    }
  }
  return best;
}

/** El gasto acumulado día a día de un mes y del anterior, listo para dibujar y contar. */
export interface Pace {
  /** Días del mes que se mira, del 1 al último. */
  days: number[];
  /** Gasto acumulado del mes; nulo en los días que aún no han llegado. */
  current: (number | null)[];
  /** Gasto acumulado del mes anterior, alargado con su total si tenía menos días. */
  previous: number[];
  /** Último día con dato: hoy en el mes en curso, el último del mes si ya cerró. */
  day: number;
  /** Lo gastado hasta ese día. */
  spent: number;
  /** Lo que el mes anterior llevaba gastado el mismo día. */
  previousAtDay: number;
  /** Cómo cerraría el mes si siguiera al ritmo de hasta ahora; nulo si ya cerró. */
  projection: number | null;
}

/**
 * El ritmo de gasto de un mes contra el anterior, día a día y acumulado.
 *
 * Acumulado y no diario: el gasto de un día suelto es puro ruido —el alquiler un día, nada
 * los tres siguientes— y lo que se quiere saber es si a estas alturas se va por delante o por
 * detrás. Comparar el mes en curso con el anterior **el mismo día** es la única comparación
 * justa mientras el mes no ha terminado.
 *
 * @param current  serie diaria del mes que se mira
 * @param previous serie diaria del mes anterior
 * @param period   mes que se mira
 * @param today    hoy, que se recibe para poder probarlo
 * @return el ritmo listo para pintar
 */
export function pace(
  current: SummarySeriesResponse,
  previous: SummarySeriesResponse,
  period: AnalysisPeriod,
  today = new Date(),
): Pace {
  const length = daysIn(period.year, period.month);
  const before = previousPeriod(period);
  const previousLength = daysIn(before.year, before.month);
  const inProgress = period.year === today.getFullYear() && period.month === today.getMonth() + 1;
  const day = inProgress ? today.getDate() : length;

  const currentRun = accumulate(dailyExpense(current, length));
  const previousRun = accumulate(dailyExpense(previous, previousLength));

  const days = Array.from({ length }, (_, i) => i + 1);
  const spent = currentRun[day - 1];
  return {
    days,
    current: days.map((d) => (d <= day ? currentRun[d - 1] : null)),
    previous: days.map((d) => previousRun[Math.min(d, previousLength) - 1]),
    day,
    spent,
    previousAtDay: previousRun[Math.min(day, previousLength) - 1],
    projection: inProgress ? (spent / day) * length : null,
  };
}

/** El gasto de cada día de un mes, con cero en los que no tuvieron movimientos. */
function dailyExpense(series: SummarySeriesResponse, length: number): number[] {
  const daily = new Array<number>(length).fill(0);
  for (const bucket of series.buckets) {
    const day = Number(bucket.periodStart.slice(8, 10));
    if (day >= 1 && day <= length) {
      daily[day - 1] += bucket.expense;
    }
  }
  return daily;
}

function accumulate(values: number[]): number[] {
  let total = 0;
  return values.map((value) => (total += value));
}

function daysIn(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Los gastos más grandes del periodo, de todas las monedas.
 *
 * Llegan en una lista por moneda, cada una ordenada por su importe, y no se pueden mezclar
 * por el número a secas: cien dólares pesan más que doscientos soles. Se comparan pasados a
 * la moneda en la que se lee la pantalla, pero cada uno se sigue enseñando en la suya.
 *
 * @param lists   los más grandes de cada moneda
 * @param shown   moneda en la que se lee la pantalla
 * @param usdRate tipo de referencia del dólar, para lo que no trae el suyo
 * @param limit   cuántos quedarse
 * @return los movimientos, del más grande al más pequeño
 */
export function largestExpenses(
  lists: ReadonlyArray<readonly TransactionResponse[]>,
  shown: Currency,
  usdRate: number | null,
  limit: number,
): TransactionResponse[] {
  const weight = (transaction: TransactionResponse): number => {
    if (transaction.currency === shown) {
      return transaction.amount;
    }
    const rate = transaction.exchangeRate ?? usdRate;
    if (shown === 'PEN') {
      return toBaseCurrency(transaction.amount, rate);
    }
    return rate ? transaction.amount / rate : transaction.amount;
  };
  return lists
    .flat()
    .map((transaction) => ({ transaction, weight: weight(transaction) }))
    .sort((a, b) => b.weight - a.weight)
    .slice(0, limit)
    .map((entry) => entry.transaction);
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
