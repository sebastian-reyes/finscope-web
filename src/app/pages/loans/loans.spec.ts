import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoansPage } from './loans';
import { LoanResponse } from '../../core/models';

/** 13 de octubre de 2026, para que «hoy» y las fechas propuestas no dependan del reloj. */
const TODAY = new Date(2026, 9, 13, 10, 0, 0);

/** Un préstamo con los campos que no importan ya puestos. */
function loan(overrides: Partial<LoanResponse> & Pick<LoanResponse, 'id'>): LoanResponse {
  return {
    borrowerName: 'Juan',
    principal: 1000,
    interest: 200,
    total: 1200,
    currency: 'PEN',
    lentOn: '2026-09-01',
    paid: 550,
    outstanding: 650,
    overdueAmount: 250,
    status: 'OVERDUE',
    nextDueDate: '2026-10-01',
    nextDueAmount: 250,
    installments: [
      { id: 1, number: 1, dueDate: '2026-09-15', amount: 400, paid: 400, status: 'PAID' },
      { id: 2, number: 2, dueDate: '2026-10-01', amount: 400, paid: 150, status: 'OVERDUE' },
      { id: 3, number: 3, dueDate: '2026-11-01', amount: 400, paid: 0, status: 'PENDING' },
    ],
    payments: [{ id: 9, paidOn: '2026-09-20', amount: 550, note: 'Transferencia' }],
    ...overrides,
  };
}

const LOANS: LoanResponse[] = [
  loan({ id: 21 }),
  loan({
    id: 22,
    borrowerName: 'Ana',
    principal: 100,
    interest: 0,
    total: 100,
    currency: 'USD',
    paid: 0,
    outstanding: 100,
    overdueAmount: 0,
    status: 'ACTIVE',
    nextDueDate: '2026-10-14',
    nextDueAmount: 100,
    installments: [
      { id: 5, number: 1, dueDate: '2026-10-14', amount: 100, paid: 0, status: 'PENDING' },
    ],
    payments: [],
  }),
  loan({
    id: 23,
    borrowerName: 'Luis',
    interest: 0,
    total: 1000,
    paid: 1000,
    outstanding: 0,
    overdueAmount: 0,
    status: 'PAID',
    nextDueDate: undefined,
    nextDueAmount: undefined,
  }),
];

describe('LoansPage', () => {
  let fixture: ComponentFixture<LoansPage>;
  let http: HttpTestingController;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function settle(loans: LoanResponse[] = LOANS): void {
    http.expectOne('/loans').flush(loans);
    fixture.detectChanges();
  }

  /** La tarjeta del préstamo de esa persona. */
  function card(name: string): HTMLElement {
    return Array.from(host().querySelectorAll<HTMLElement>('.fs-loan__item')).find((element) =>
      element.querySelector('.fs-loan__name')!.textContent!.includes(name),
    )!;
  }

  /** El botón cuyo rótulo empieza por el texto dado. */
  function button(within: HTMLElement, label: string): HTMLButtonElement {
    return Array.from(within.querySelectorAll<HTMLButtonElement>('button')).find((element) =>
      element.textContent!.trim().startsWith(label),
    )!;
  }

  /** Escribe en un campo como se haría a mano. */
  function type(selector: string, value: string): void {
    const field = document.querySelector<HTMLInputElement>(selector)!;
    field.value = value;
    field.dispatchEvent(new Event('input'));
    field.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  function openForm(): void {
    host().querySelector<HTMLButtonElement>('.fs-head__actions .fs-btn--solid')!.click();
    fixture.detectChanges();
  }

  function submitForm(): void {
    document.querySelector<HTMLButtonElement>('button[form="loanForm"]')!.click();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);

    await TestBed.configureTestingModule({
      imports: [LoansPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);

    fixture = TestBed.createComponent(LoansPage);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('dice cuánto te deben por moneda, sin sumar soles con dólares', () => {
    settle();

    const total = host().querySelector('.fs-sum__amount')!.textContent!;
    expect(total).toContain('S/ 650.00');
    expect(total).toContain('$ 100.00');
    expect(host().querySelector('.fs-sum__of')!.textContent).toContain('2 préstamos abiertos');
    expect(host().querySelector('.fs-sum__late')!.textContent).toContain('S/ 250.00');
    // El interés que aún se va a ganar es el de lo abierto; Luis ya devolvió todo.
    expect(host().querySelector('.fs-sum__gain')!.textContent).toContain('S/ 200.00');
  });

  it('separa lo saldado de lo que todavía se debe y nombra el estado con palabras', () => {
    settle();

    expect(card('Juan').querySelector('.fs-loan__state')!.textContent!.trim()).toBe('Vencido');
    expect(card('Ana').querySelector('.fs-loan__state')!.textContent!.trim()).toBe('Al día');
    expect(card('Ana').querySelector('.fs-loan__next')!.textContent).toContain('mañana');
    expect(host().querySelector('.fs-loan__section')!.textContent).toContain('Saldados');
    expect(card('Luis').querySelector('.fs-loan__state')!.textContent!.trim()).toBe('Saldado');
    // De lo saldado ya no se espera ningún pago.
    expect(button(card('Luis'), 'Registrar pago')).toBeUndefined();
  });

  it('registra un pago con lo que falta de la próxima cuota y la fecha de hoy', () => {
    settle();

    button(card('Juan'), 'Registrar pago').click();
    fixture.detectChanges();
    expect(document.querySelector<HTMLInputElement>('#loanPaymentAmount')!.value).toBe('250');

    document.querySelector<HTMLButtonElement>('button[form="loanPaymentForm"]')!.click();
    fixture.detectChanges();

    const request = http.expectOne('/loans/21/payments');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ paidOn: '2026-10-13', amount: 250 });
    request.flush(loan({ id: 21 }));
    http.expectOne('/loans').flush(LOANS);
  });

  it('enseña las cuotas y lo que falta de la que quedó a medias', () => {
    settle();

    button(card('Juan'), 'Ver detalle').click();
    fixture.detectChanges();

    const lines = card('Juan').querySelectorAll('.fs-loan__line[data-status]');
    expect(lines).toHaveLength(3);
    expect(lines[1].textContent).toContain('Vencida');
    expect(lines[1].textContent).toContain('faltan S/ 250.00');
    expect(card('Juan').textContent).toContain('Transferencia');
  });

  it('registra un préstamo sin interés que se devuelve de una vez', () => {
    settle([]);
    openForm();

    type('#loanBorrower', 'Pedro');
    type('#loanPrincipal', '500');
    submitForm();

    const request = http.expectOne('/loans');
    expect(request.request.method).toBe('POST');
    // Se propone devolverlo en un mes desde hoy, en un solo pago y por el total.
    expect(request.request.body).toEqual({
      borrowerName: 'Pedro',
      principal: 500,
      interest: 0,
      currency: 'PEN',
      lentOn: '2026-10-13',
      notes: '',
      installments: [{ dueDate: '2026-11-13', amount: 500 }],
    });
    request.flush(loan({ id: 30, borrowerName: 'Pedro' }));
    http.expectOne('/loans').flush([]);
  });

  it('reparte capital más interés en cuotas mensuales que suman exacto', () => {
    settle([]);
    openForm();

    type('#loanBorrower', 'Pedro');
    type('#loanPrincipal', '900');
    button(document.body, 'Con interés').click();
    fixture.detectChanges();
    type('#loanInterest', '100');
    button(document.body, 'Por partes').click();
    fixture.detectChanges();
    type('#loanCount', '3');
    submitForm();

    const request = http.expectOne('/loans');
    expect(request.request.body.interest).toBe(100);
    expect(request.request.body.installments).toEqual([
      { dueDate: '2026-11-13', amount: 333.33 },
      { dueDate: '2026-12-13', amount: 333.33 },
      { dueDate: '2027-01-13', amount: 333.34 },
    ]);
    request.flush(loan({ id: 30, borrowerName: 'Pedro' }));
    http.expectOne('/loans').flush([]);
  });

  it('no deja guardar un plan retocado que ya no suma el total', () => {
    settle([]);
    openForm();

    type('#loanBorrower', 'Pedro');
    type('#loanPrincipal', '300');
    button(document.body, 'Por partes').click();
    fixture.detectChanges();

    const amounts = document.querySelectorAll<HTMLInputElement>('.fs-plan__row input.fs-num');
    amounts[0].value = '100';
    amounts[0].dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(document.querySelector('.fs-error')!.textContent).toContain('S/ 250.00');
    expect(document.querySelector<HTMLButtonElement>('button[form="loanForm"]')!.disabled).toBe(
      true,
    );
  });

  it('da un préstamo por cerrado sin borrarlo', () => {
    settle();

    card('Ana').querySelector<HTMLButtonElement>('[aria-label^="Dar por cerrado"]')!.click();

    const request = http.expectOne('/loans/22');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ closed: true });
    request.flush(loan({ id: 22, status: 'CLOSED' }));
    http.expectOne('/loans').flush(LOANS);
  });
});
