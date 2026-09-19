import { describe, expect, it } from 'vitest';
import { bucketTick, monthFromParam } from './period';

describe('monthFromParam', () => {
  it('lee el mes que trae la dirección de un aviso', () => {
    expect(monthFromParam('2026-10')).toEqual({ month: 10, year: 2026 });
    expect(monthFromParam('2027-01')).toEqual({ month: 1, year: 2027 });
  });

  it('ignora lo que no es un mes, para abrir en el mes en curso', () => {
    expect(monthFromParam(null)).toBeNull();
    expect(monthFromParam('')).toBeNull();
    expect(monthFromParam('2026-13')).toBeNull();
    expect(monthFromParam('2026-9')).toBeNull();
    expect(monthFromParam('setiembre')).toBeNull();
  });
});

describe('bucketTick', () => {
  it('bajo la línea deja solo el día: el mes se repite en los treinta tramos', () => {
    expect(bucketTick('2026-09-01T00:00:00', 'DAY')).toBe('1');
    expect(bucketTick('2026-09-28T00:00:00', 'DAY')).toBe('28');
  });

  it('la semana y el mes se quedan como están, que son pocos y sí se distinguen', () => {
    expect(bucketTick('2026-09-07T00:00:00', 'WEEK')).toContain('sem.');
    expect(bucketTick('2026-09-01T00:00:00', 'MONTH')).toContain('26');
  });
});
