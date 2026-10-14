import { LoanInstallmentRequest } from '../models';

/**
 * El calendario de devolución de un préstamo: cómo se reparte el total en cuotas y cómo se
 * dice cuánto falta para cada una.
 *
 * Las fechas viajan como `yyyy-MM-dd`, igual que en la API, y se manejan sin pasar por UTC:
 * `new Date('2026-10-01')` es medianoche en Greenwich, que en Lima todavía es el 30 de
 * setiembre. Por eso todo se construye con año, mes y día sueltos.
 */

/** Cada cuánto se devuelve una cuota. */
export type LoanFrequency = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';

/** Las frecuencias con el nombre con el que se ofrecen, en el orden en que se leen. */
export const LOAN_FREQUENCIES: ReadonlyArray<readonly [LoanFrequency, string]> = [
  ['WEEKLY', 'Semanal'],
  ['BIWEEKLY', 'Quincenal'],
  ['MONTHLY', 'Mensual'],
];

/**
 * Escribe una fecha del navegador como `yyyy-MM-dd` en hora local.
 *
 * @param date fecha a escribir; hoy si no se da
 * @return la fecha en el formato de la API
 */
export function isoDate(date: Date = new Date()): string {
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Lee `yyyy-MM-dd` como fecha local, sin el salto de zona de `new Date(texto)`. */
export function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Suma meses a una fecha sin que se desborde al mes siguiente: el 31 de enero más un mes es
 * el 28 de febrero, no el 3 de marzo. Es lo que hace la API con los fijos del día 31.
 */
function addMonths(date: Date, months: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), lastDay));
  return target;
}

/**
 * Reparte un total en cuotas iguales a partir de una primera fecha.
 *
 * Se trabaja en céntimos para que la suma cuadre exacta: 1000 en tres cuotas son 333.33,
 * 333.33 y 333.34, y la API rechaza un plan que no sume el total. La diferencia va a la
 * última, que es donde se espera el «redondeo».
 *
 * @param total     lo que hay que devolver, capital más interés
 * @param count     número de cuotas, al menos una
 * @param frequency cada cuánto vence una cuota
 * @param firstDate fecha de la primera cuota, `yyyy-MM-dd`
 * @return las cuotas en orden, listas para mandarse o para retocarse a mano
 */
export function buildLoanPlan(
  total: number,
  count: number,
  frequency: LoanFrequency,
  firstDate: string,
): LoanInstallmentRequest[] {
  const cents = Math.round(total * 100);
  const n = Math.max(1, Math.floor(count));
  const base = Math.floor(cents / n);
  const first = parseIsoDate(firstDate);
  return Array.from({ length: n }, (_, index) => {
    let due: Date;
    if (frequency === 'MONTHLY') {
      due = addMonths(first, index);
    } else {
      due = new Date(first);
      due.setDate(first.getDate() + index * (frequency === 'WEEKLY' ? 7 : 15));
    }
    const amount = index === n - 1 ? cents - base * (n - 1) : base;
    return { dueDate: isoDate(due), amount: amount / 100 };
  });
}

/**
 * Suma un plan en céntimos, que es como hay que compararlo con el total.
 *
 * @param plan cuotas a sumar
 * @return la suma, redondeada a céntimos
 */
export function planTotal(plan: ReadonlyArray<LoanInstallmentRequest>): number {
  return plan.reduce((sum, item) => sum + Math.round((Number(item.amount) || 0) * 100), 0) / 100;
}

/**
 * Cuánto falta para una fecha, dicho como se diría en voz alta.
 *
 * @param dueDate fecha de la cuota, `yyyy-MM-dd`
 * @param today   hoy, `yyyy-MM-dd`; se deja pasar para que las pruebas no dependan del reloj
 * @return «hoy», «mañana», «en 5 días», «ayer» o «hace 3 días»
 */
export function dueDistance(dueDate: string, today: string = isoDate()): string {
  const days = Math.round(
    (parseIsoDate(dueDate).getTime() - parseIsoDate(today).getTime()) / 86_400_000,
  );
  if (days === 0) {
    return 'hoy';
  }
  if (days === 1) {
    return 'mañana';
  }
  if (days === -1) {
    return 'ayer';
  }
  return days > 0 ? `en ${days} días` : `hace ${-days} días`;
}

/**
 * Una fecha corta para las listas: «1 oct» este año, «1 oct 2027» si es de otro.
 *
 * @param value fecha `yyyy-MM-dd`
 * @param today hoy, para decidir si hace falta el año
 * @return la fecha escrita
 */
export function shortDate(value: string, today: string = isoDate()): string {
  const date = parseIsoDate(value);
  const sameYear = date.getFullYear() === parseIsoDate(today).getFullYear();
  return date
    .toLocaleDateString('es', {
      day: 'numeric',
      month: 'short',
      ...(sameYear ? {} : { year: 'numeric' }),
    })
    .replace('.', '');
}
