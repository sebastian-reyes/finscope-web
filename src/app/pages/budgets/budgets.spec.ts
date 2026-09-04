import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BudgetsPage } from './budgets';
import { BudgetResponse, CategoryResponse } from '../../core/models';

/** Agosto de 2026, para que el mes que abre la pantalla no dependa de cuándo se ejecute. */
const TODAY = new Date(2026, 7, 15, 10, 0, 0);

const CATALOGUE: CategoryResponse[] = [
  { id: 1, name: 'Otros', appliesTo: 'BOTH', isSystem: true, transactionCount: 3 },
  { id: 4, name: 'Comida', appliesTo: 'EXPENSE', isSystem: false, transactionCount: 12 },
  { id: 5, name: 'Transporte', appliesTo: 'EXPENSE', isSystem: false, transactionCount: 4 },
  { id: 6, name: 'Salario', appliesTo: 'INCOME', isSystem: false, transactionCount: 2 },
];

const BUDGETS: BudgetResponse[] = [
  {
    id: 11,
    categoryId: 4,
    category: 'Comida',
    month: 8,
    year: 2026,
    amount: 400,
    spent: 455.5,
    committed: 0,
    remaining: -55.5,
    available: -55.5,
  },
  {
    id: 12,
    categoryId: 5,
    category: 'Transporte',
    month: 8,
    year: 2026,
    amount: 150,
    spent: 20,
    committed: 0,
    remaining: 130,
    available: 130,
  },
];

describe('BudgetsPage', () => {
  let fixture: ComponentFixture<BudgetsPage>;
  let http: HttpTestingController;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** Contesta a la carga inicial, que pide el mes y el catálogo a la vez. */
  function settle(budgets: BudgetResponse[] = BUDGETS): void {
    http.expectOne('/budgets?month=8&year=2026').flush(budgets);
    http.expectOne('/categories').flush(CATALOGUE);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);

    await TestBed.configureTestingModule({
      imports: [BudgetsPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);

    fixture = TestBed.createComponent(BudgetsPage);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('abre en el mes en curso y pinta una barra por presupuesto', () => {
    settle();

    expect(host().querySelectorAll('fs-budget-bar')).toHaveLength(2);
    expect(host().textContent).toContain('Comida');
    expect(host().textContent).toContain('Transporte');
  });

  it('suma el plan del mes y avisa de las categorías que se pasaron', () => {
    settle();

    const reading = host().querySelector('.fs-total__reading')!.textContent!;
    // 475,50 gastados (455,50 + 20) contra 550 presupuestados (400 + 150): quedan 74,50.
    // El total del mes puede seguir en verde con una categoría pasada, y eso es correcto:
    // son dos preguntas distintas y por eso se dicen las dos.
    expect(reading).toContain('74.50');
    expect(host().querySelector('.fs-total__over')!.textContent).toContain('1 categoría se pasó');
  });

  it('solo ofrece categorías de egreso que aún no tengan presupuesto', () => {
    settle();

    host().querySelector<HTMLButtonElement>('.fs-head__actions .fs-btn--solid')!.click();
    fixture.detectChanges();

    // La lista del desplegable solo existe con el panel abierto.
    host().querySelector<HTMLButtonElement>('fs-select-field .fs-select')!.click();
    fixture.detectChanges();

    const options = Array.from(
      host().querySelectorAll<HTMLElement>('fs-select-field [role="option"]'),
    ).map((option) => option.textContent!.trim());

    // Fuera «Salario» por ser de solo ingresos, y fuera «Comida» y «Transporte» por tener ya
    // presupuesto este mes. Queda la de reserva, que admite las dos cosas.
    expect(options.join(' ')).toContain('Otros');
    expect(options.join(' ')).not.toContain('Salario');
    expect(options.join(' ')).not.toContain('Comida');
  });

  it('fija un presupuesto para el mes que se está mirando', () => {
    settle();

    host().querySelector<HTMLButtonElement>('.fs-head__actions .fs-btn--solid')!.click();
    fixture.detectChanges();

    // La categoría se elige en el desplegable de la casa, que no pasa por el formulario.
    host().querySelector<HTMLButtonElement>('fs-select-field .fs-select')!.click();
    fixture.detectChanges();
    const otros = Array.from(
      host().querySelectorAll<HTMLElement>('fs-select-field [role="option"]'),
    ).find((option) => option.textContent!.includes('Otros'))!;
    otros.click();
    fixture.detectChanges();

    const amount = host().querySelector<HTMLInputElement>('#newBudgetAmount')!;
    amount.value = '250';
    amount.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    // El envío del formulario, no un clic al método: sin `[formGroup]` en la etiqueta el
    // navegador recargaría la página en lugar de dar de alta nada.
    host()
      .querySelector<HTMLFormElement>('.fs-new')!
      .dispatchEvent(new Event('submit', { cancelable: true }));

    const request = http.expectOne('/budgets');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ categoryId: 1, month: 8, year: 2026, amount: 250 });
    request.flush({
      id: 13,
      categoryId: 1,
      category: 'Otros',
      month: 8,
      year: 2026,
      amount: 250,
      spent: 0,
      remaining: 250,
    });

    // Tras guardar se relee el mes entero, porque el avance de las demás no ha cambiado
    // pero el total del plan sí.
    settle();
  });

  it('cambia solo el importe al editar', () => {
    settle();

    host().querySelectorAll<HTMLButtonElement>('.fs-buds__actions .fs-btn--ghost')[0].click();
    fixture.detectChanges();

    const amount = host().querySelector<HTMLInputElement>('#amount11')!;
    amount.value = '600';
    amount.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    host()
      .querySelector<HTMLFormElement>('.fs-edit')!
      .dispatchEvent(new Event('submit', { cancelable: true }));

    const request = http.expectOne('/budgets/11');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ amount: 600 });
    request.flush({ ...BUDGETS[0], amount: 600, remaining: 144.5 });

    settle();
  });

  it('pide confirmación antes de quitar un presupuesto', () => {
    settle();

    host()
      .querySelectorAll<HTMLButtonElement>('.fs-buds__actions .fs-btn--quiet-danger')[0]
      .click();
    fixture.detectChanges();

    expect(host().querySelector('.fs-buds__confirm')!.textContent).toContain('Comida');

    host().querySelector<HTMLButtonElement>('.fs-btn--danger')!.click();

    const request = http.expectOne('/budgets/11');
    expect(request.request.method).toBe('DELETE');
    request.flush(null);

    settle([BUDGETS[1]]);
  });

  it('copia el mes anterior sin recargar la lista aparte', () => {
    settle([]);

    host().querySelector<HTMLButtonElement>('.fs-head__actions .fs-btn--outline')!.click();

    const request = http.expectOne('/budgets/copy');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      sourceMonth: 7,
      sourceYear: 2026,
      month: 8,
      year: 2026,
    });
    // La API devuelve el mes destino completo, así que la pantalla se repinta con eso.
    request.flush(BUDGETS);
    fixture.detectChanges();

    expect(host().querySelectorAll('fs-budget-bar')).toHaveLength(2);
  });

  it('al cambiar de mes vuelve a pedir el periodo nuevo', () => {
    settle();

    host().querySelector<HTMLButtonElement>('.fs-period__step')!.click();
    fixture.detectChanges();

    http.expectOne('/budgets?month=7&year=2026').flush([]);
    http.expectOne('/categories').flush(CATALOGUE);
    fixture.detectChanges();

    expect(host().querySelector('.fs-blank__title')!.textContent).toContain('Julio');
  });
});
