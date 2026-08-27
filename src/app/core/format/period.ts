import { SummaryGranularity, TransactionFilters } from '../models';

/**
 * Periodos y fechas.
 *
 * Los `<input>` de fecha del navegador entregan la fecha en hora local y sin segundos,
 * mientras que la API espera un `date-time` completo. Todas esas conversiones viven aquí
 * para que ninguna pantalla vuelva a improvisarlas.
 */

/**
 * Cómo se acota el periodo.
 * La API rechaza el mes natural junto al rango de fechas, así que las pantallas eligen uno
 * u otro; `all` es no mandar ninguno de los dos y mirar el historial entero.
 */
export type PeriodMode = 'all' | 'month' | 'range';

/** `datetime-local` entrega `2026-01-31T14:05`; la API quiere los segundos. */
export function toApiDateTime(value: string): string {
  return value.length === 16 ? `${value}:00` : value;
}

/**
 * El camino de vuelta: lo que espera un `datetime-local` en su valor.
 *
 * La fecha de la API es local y no lleva zona, así que de un texto se recortan los
 * segundos en lugar de pasar por `Date`: construir la fecha y volver a formatearla la
 * correría de sitio en cuanto el navegador estuviera en otro huso.
 *
 * @param value instante de la API, o una fecha del navegador para un formulario nuevo
 * @return el instante en el formato `yyyy-MM-ddTHH:mm` del campo
 */
export function toInputDateTime(value: string | Date): string {
  if (typeof value === 'string') {
    return value.slice(0, 16);
  }
  const pad = (part: number) => String(part).padStart(2, '0');
  const day = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  return `${day}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
}

/** Primer instante del día que se escribió en un `date`, para un filtro `dateFrom`. */
export function startOfDay(date: string): string {
  return `${date}T00:00:00`;
}

/**
 * Último instante del día, para un filtro `dateTo`.
 * El rango de la API es inclusivo por los dos extremos, de modo que acotar «hasta el 31»
 * debe abarcar el 31 entero y no cortarlo a medianoche.
 */
export function endOfDay(date: string): string {
  return `${date}T23:59:59`;
}

/** Filtros que acotan al mes natural en curso, que es lo que abre la aplicación. */
export function currentMonth(): TransactionFilters {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

/**
 * Nombre del mes tal y como se rotula en pantalla.
 *
 * @param month mes entre 1 y 12
 * @param year  año del periodo
 * @return el mes en palabras, con el año solo si no es el actual
 */
export function monthLabel(month: number, year: number): string {
  const label = new Date(year, month - 1, 1).toLocaleDateString('es', { month: 'long' });
  const capitalised = label.charAt(0).toUpperCase() + label.slice(1);
  return year === new Date().getFullYear() ? capitalised : `${capitalised} ${year}`;
}

/**
 * Etiqueta de un tramo de la serie temporal, según su tamaño.
 * El día y la semana necesitan el día del mes; el mes se reconoce mejor por su nombre.
 *
 * @param periodStart  instante inicial del tramo
 * @param granularity  tamaño del tramo
 * @return la etiqueta que se dibuja bajo el punto
 */
export function bucketLabel(periodStart: string, granularity: SummaryGranularity): string {
  const date = new Date(periodStart);
  switch (granularity) {
    case 'DAY':
      return date.toLocaleDateString('es', { day: '2-digit', month: 'short' });
    case 'WEEK':
      return `sem. ${date.toLocaleDateString('es', { day: '2-digit', month: 'short' })}`;
    case 'MONTH':
      return date.toLocaleDateString('es', { month: 'short', year: '2-digit' });
  }
}

/**
 * Agrupa una fecha en el encabezado bajo el que se lista: hoy, ayer o el día concreto.
 *
 * @param date fecha de la transacción
 * @return el rótulo del grupo al que pertenece
 */
export function dayGroupLabel(date: string): string {
  const value = new Date(date);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (isSameDay(value, today)) {
    return 'Hoy';
  }
  if (isSameDay(value, yesterday)) {
    return 'Ayer';
  }
  return value.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
}

function isSameDay(left: Date, right: Date): boolean {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}
