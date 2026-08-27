/**
 * Formato de importes.
 *
 * El contrato de la API no expone la moneda en ningún esquema: los importes son números
 * sueltos. Antes que inventar un campo, la moneda se fija aquí y todo el formateo pasa por
 * este archivo, de modo que el día que el backend la devuelva solo haya que cambiar de
 * dónde sale el símbolo.
 */

/** Moneda de presentación, mientras la API no diga otra cosa. */
export const CURRENCY_SYMBOL = 'S/';

/** Configuración regional con la que se agrupan los millares y se separan los decimales. */
export const CURRENCY_LOCALE = 'es-PE';

const decimalFormat = new Intl.NumberFormat(CURRENCY_LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

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
 * Da formato a un importe con su símbolo de moneda, sin signo.
 *
 * @param amount importe a formatear
 * @return el importe precedido por el símbolo de la moneda
 */
export function formatMoney(amount: number): string {
  return `${CURRENCY_SYMBOL} ${formatAmount(amount)}`;
}
