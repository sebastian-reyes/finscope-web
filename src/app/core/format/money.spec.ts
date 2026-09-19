import { describe, expect, it } from 'vitest';
import {
  BASE_CURRENCY,
  currencySymbol,
  formatAmount,
  formatAxisMoney,
  formatMoney,
  toBaseCurrency,
} from './money';

describe('formatMoney', () => {
  it('escribe los soles con su símbolo', () => {
    expect(formatMoney(120.5, 'PEN')).toBe('S/ 120.50');
  });

  it('escribe los dólares con el suyo', () => {
    // Lo que hace falta es que 15.99 dólares no se lean como 15.99 soles: el número es el
    // mismo y lo único que los distingue es el símbolo.
    expect(formatMoney(15.99, 'USD')).toBe('$ 15.99');
  });

  it('asume la moneda base cuando no se indica ninguna', () => {
    // Es lo que son todas las cantidades que no pertenecen a un movimiento —un presupuesto,
    // un fijo— y lo que eran todas antes de que existieran las monedas.
    expect(formatMoney(120.5)).toBe(formatMoney(120.5, BASE_CURRENCY));
  });

  it('siempre lleva dos decimales', () => {
    expect(formatMoney(8, 'USD')).toBe('$ 8.00');
    expect(formatAmount(1234.5)).toBe('1,234.50');
  });

  it('no pone signo: eso lo decide el tipo del movimiento', () => {
    expect(formatMoney(-40, 'PEN')).toBe('S/ 40.00');
  });
});

describe('currencySymbol', () => {
  it('da el símbolo de cada moneda', () => {
    expect(currencySymbol('PEN')).toBe('S/');
    expect(currencySymbol('USD')).toBe('$');
  });
});

describe('toBaseCurrency', () => {
  it('convierte con el tipo de cambio con el que se registró', () => {
    expect(toBaseCurrency(100, 3.55)).toBe(355);
  });

  it('redondea a dos decimales, que es la escala del dinero', () => {
    expect(toBaseCurrency(15.99, 3.752)).toBe(59.99);
  });

  it('deja el importe como está cuando no hay cambio que aplicar', () => {
    // Un movimiento en la moneda base no lleva tipo de cambio: no se convierte a sí misma.
    expect(toBaseCurrency(120.5, null)).toBe(120.5);
    expect(toBaseCurrency(120.5)).toBe(120.5);
  });
});

describe('formatAxisMoney', () => {
  it('quita los céntimos, que en un eje solo ocupan sitio', () => {
    expect(formatAxisMoney(3000, 'PEN')).toBe('S/ 3,000');
    expect(formatAxisMoney(1234.56, 'PEN')).toBe('S/ 1,235');
  });

  it('conserva el símbolo: es lo único del gráfico que dice de qué moneda habla', () => {
    expect(formatAxisMoney(500, 'USD')).toBe('$ 500');
    expect(formatAxisMoney(0)).toBe('S/ 0');
  });
});
