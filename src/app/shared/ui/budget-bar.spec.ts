import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { BudgetBarComponent } from './budget-bar';
import { BudgetResponse } from '../../core/models';

/**
 * Un presupuesto con los importes indicados. `remaining` y `available` se calculan como lo
 * hace la API, para que la prueba no pueda pasar con una combinación que el servidor no
 * devolvería.
 */
function budget(amount: number, spent: number, committed = 0): BudgetResponse {
  return {
    id: 1,
    categoryId: 4,
    category: 'Comida',
    month: 8,
    year: 2026,
    amount,
    spent,
    committed,
    remaining: amount - spent,
    available: amount - spent - committed,
  };
}

describe('BudgetBarComponent', () => {
  let fixture: ComponentFixture<BudgetBarComponent>;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function render(value: BudgetResponse): void {
    fixture.componentRef.setInput('budget', value);
    fixture.detectChanges();
  }

  function tone(): string {
    return host().querySelector<HTMLElement>('.fs-bud')!.dataset['tone']!;
  }

  function fillWidth(): string {
    return host().querySelector<HTMLElement>('.fs-bud__fill')!.style.width;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [BudgetBarComponent] }).compileComponents();
    fixture = TestBed.createComponent(BudgetBarComponent);
  });

  it('dice lo que queda cuando el gasto va por debajo del límite', () => {
    render(budget(400, 340));

    expect(tone()).toBe('close');
    expect(fillWidth()).toBe('85%');
    expect(host().querySelector('.fs-bud__reading')!.textContent).toContain('Queda');
    expect(host().querySelector('.fs-bud__reading')!.textContent).toContain('60.00');
  });

  it('avisa en tono normal mientras sobre margen', () => {
    render(budget(400, 100));

    expect(tone()).toBe('ok');
    expect(fillWidth()).toBe('25%');
  });

  it('llena la barra y dice de cuánto fue el exceso al pasarse', () => {
    render(budget(400, 455.5));

    expect(tone()).toBe('over');
    // El porcentaje sí pasa de cien, pero el carril no da más de sí.
    expect(fillWidth()).toBe('100%');
    expect(host().querySelector('.fs-bud__percent')!.textContent!.trim()).toBe('114%');

    const reading = host().querySelector('.fs-bud__reading')!.textContent!;
    expect(reading).toContain('Te pasaste');
    expect(reading).toContain('55.50');
  });

  it('deja el avance leíble para quien no ve la barra', () => {
    render(budget(400, 455.5));

    const label = host().querySelector('.fs-bud__track')!.getAttribute('aria-label')!;
    expect(label).toContain('Comida');
    expect(label).toContain('te pasaste por');
    expect(host().querySelector('.fs-bud__track')!.getAttribute('aria-valuenow')).toBe('114');
  });

  it('descuenta los fijos que faltan al decir lo que queda libre', () => {
    render(budget(400, 120, 180));

    // Lo que queda mira solo al pasado; lo libre es con lo que se decide hoy.
    const reading = host().querySelector('.fs-bud__reading')!.textContent!;
    expect(reading).toContain('100.00');
    expect(host().querySelector('.fs-bud__note')!.textContent).toContain('180.00');
  });

  it('dibuja lo comprometido justo detrás de lo gastado, sin salirse del carril', () => {
    render(budget(400, 120, 180));

    expect(fillWidth()).toBe('30%');
    expect(host().querySelector<HTMLElement>('.fs-bud__commit')!.style.width).toBe('45%');
  });

  it('avisa cuando el mes se pasa solo con lo que ya está comprometido', () => {
    render(budget(400, 300, 180));

    // Todavía no se ha gastado de más, pero el resultado ya está decidido.
    expect(tone()).toBe('close');
    expect(host().querySelector('.fs-bud__reading')!.textContent).toContain('te pasas por');
    expect(host().querySelector('.fs-bud__reading')!.textContent).toContain('80.00');
    // El tramo se corta en lo que quedaba de carril: no hay barra más allá de la barra.
    expect(host().querySelector<HTMLElement>('.fs-bud__commit')!.style.width).toBe('25%');
  });

  it('sin fijos por pagar la barra se lee exactamente como antes', () => {
    render(budget(400, 340));

    expect(host().querySelector('.fs-bud__commit')).toBeNull();
    expect(host().querySelector('.fs-bud__note')).toBeNull();
  });

  it('no divide entre cero si el presupuesto llegara vacío', () => {
    render(budget(0, 0));

    expect(tone()).toBe('ok');
    expect(fillWidth()).toBe('0%');
  });
});
