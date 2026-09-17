import { describe, expect, it } from 'vitest';
import { monthFromParam } from './period';

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
