/**
 * Formato de importes.
 *
 * Un importe no se puede escribir sin decir de qué moneda habla: `120.50` no significa nada
 * hasta saber si son soles o dólares. Por eso todo el formateo pasa por aquí y la moneda es
 * un argumento, no una constante del archivo.
 *
 * Añadir una moneda es añadir su símbolo a la tabla de abajo y su valor al enum del
 * contrato. Nada más de esta capa tiene que enterarse.
 */

import { Currency } from '../models';

/**
 * Moneda base: la que se asume cuando nadie dice otra cosa.
 * Es la misma que da por supuesta la API cuando una petición no trae moneda, y la única que
 * no lleva tipo de cambio.
 */
export const BASE_CURRENCY: Currency = 'PEN';

/**
 * Símbolo de cada moneda.
 *
 * El del dólar va sin prefijo de país —`$` y no `US$`— porque en la aplicación solo hay una
 * moneda con ese símbolo y el contexto lo deja claro; el día que entre otra, aquí es donde
 * se desambigua.
 */
export const CURRENCY_SYMBOLS: Record<Currency, string> = {
  PEN: 'S/',
  USD: '$',
};

/** Nombre de cada moneda, para los rótulos que no caben en un símbolo. */
export const CURRENCY_NAMES: Record<Currency, string> = {
  PEN: 'Soles',
  USD: 'Dólares',
};

/** Las monedas que la aplicación admite, en el orden en que se ofrecen. */
export const CURRENCIES: Currency[] = ['PEN', 'USD'];

/** Configuración regional con la que se agrupan los millares y se separan los decimales. */
export const CURRENCY_LOCALE = 'es-PE';

const decimalFormat = new Intl.NumberFormat(CURRENCY_LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Devuelve el símbolo de una moneda.
 *
 * @param currency moneda de la que se quiere el símbolo
 * @return el símbolo, o el de la moneda base si llega una desconocida
 */
export function currencySymbol(currency: Currency = BASE_CURRENCY): string {
  return CURRENCY_SYMBOLS[currency] ?? CURRENCY_SYMBOLS[BASE_CURRENCY];
}

/**
 * Da formato al valor absoluto de un importe, sin signo ni símbolo.
 * El signo lo pone quien muestra el importe, porque depende del tipo de la transacción y
 * no del número.
 *
 * @param amount importe a formatear
 * @return el importe con dos decimales y separador de millares
 */
export function formatAmount(amount: number): string {
  return decimalFormat.format(Math.abs(amount));
}

/**
 * Da formato a un importe con el símbolo de su moneda, sin signo.
 *
 * La moneda tiene valor por defecto para que quien formatea cantidades que solo existen en
 * la base —un presupuesto, un movimiento fijo— no tenga que repetirlo en cada llamada. Lo
 * que viene de una transacción sí debe pasarla siempre: es lo que evita enseñar quince
 * dólares con el símbolo de los soles.
 *
 * @param amount   importe a formatear
 * @param currency moneda del importe
 * @return el importe precedido por el símbolo de su moneda
 */
export function formatMoney(amount: number, currency: Currency = BASE_CURRENCY): string {
  return `${currencySymbol(currency)} ${formatAmount(amount)}`;
}

/**
 * Convierte un importe a moneda base con el tipo de cambio con el que se registró.
 *
 * No sirve para comparar dinero de hoy: sirve para responder cuánto fue aquel día, que es
 * justo lo que el tipo de cambio guardado conserva. Un importe que ya está en la base, o
 * uno sin cambio guardado, se devuelve tal cual.
 *
 * @param amount       importe en su moneda
 * @param exchangeRate tipo de cambio con el que se registró, si lo lleva
 * @return el equivalente en moneda base, redondeado a dos decimales
 */
export function toBaseCurrency(amount: number, exchangeRate?: number | null): number {
  if (!exchangeRate) {
    return amount;
  }
  return Math.round(amount * exchangeRate * 100) / 100;
}
