import { describe, expect, it } from 'vitest';
import { buildLoanPlan, dueDistance, isoDate, planTotal, shortDate } from './loan-plan';

describe('buildLoanPlan', () => {
  it('reparte en céntimos y deja la diferencia en la última cuota', () => {
    const plan = buildLoanPlan(1000, 3, 'MONTHLY', '2026-10-01');

    expect(plan.map((item) => item.amount)).toEqual([333.33, 333.33, 333.34]);
    expect(planTotal(plan)).toBe(1000);
  });

  it('las cuotas mensuales no se desbordan al mes siguiente', () => {
    const plan = buildLoanPlan(300, 3, 'MONTHLY', '2027-01-31');

    // El 31 de enero más un mes es el último de febrero, y en marzo vuelve al 31.
    expect(plan.map((item) => item.dueDate)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);
  });

  it('las semanales y quincenales cuentan días', () => {
    expect(buildLoanPlan(200, 2, 'WEEKLY', '2026-12-28').map((item) => item.dueDate)).toEqual([
      '2026-12-28',
      '2027-01-04',
    ]);
    expect(buildLoanPlan(200, 2, 'BIWEEKLY', '2026-10-01').map((item) => item.dueDate)).toEqual([
      '2026-10-01',
      '2026-10-16',
    ]);
  });

  it('un pago único es una sola cuota por el total', () => {
    expect(buildLoanPlan(1100, 1, 'MONTHLY', '2026-11-15')).toEqual([
      { dueDate: '2026-11-15', amount: 1100 },
    ]);
  });
});

describe('dueDistance', () => {
  it('dice la distancia como se diría en voz alta', () => {
    expect(dueDistance('2026-10-13', '2026-10-13')).toBe('hoy');
    expect(dueDistance('2026-10-14', '2026-10-13')).toBe('mañana');
    expect(dueDistance('2026-10-16', '2026-10-13')).toBe('en 3 días');
    expect(dueDistance('2026-10-12', '2026-10-13')).toBe('ayer');
    expect(dueDistance('2026-10-08', '2026-10-13')).toBe('hace 5 días');
  });

  it('no se corre un día con el cambio de hora', () => {
    // En zonas con horario de verano un día dura 23 o 25 horas; contar por fechas lo evita.
    expect(dueDistance('2026-11-02', '2026-10-31')).toBe('en 2 días');
  });
});

describe('isoDate y shortDate', () => {
  it('escribe la fecha local sin pasar por UTC', () => {
    expect(isoDate(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });

  it('solo añade el año si no es el de hoy', () => {
    expect(shortDate('2026-10-01', '2026-10-13')).not.toContain('2026');
    expect(shortDate('2027-01-01', '2026-10-13')).toContain('2027');
  });
});
