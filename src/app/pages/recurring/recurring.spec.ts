import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RecurringPage } from './recurring';
import {
  CategoryResponse,
  RecurringOccurrenceResponse,
  TransactionTypeResponse,
} from '../../core/models';

/** Agosto de 2026, para que el mes que abre la pantalla no dependa de cuándo se ejecute. */
const TODAY = new Date(2026, 7, 15, 10, 0, 0);

const TYPES: TransactionTypeResponse[] = [
  { id: 1, name: 'Ingreso', code: 'INCOME' },
  { id: 2, name: 'Egreso', code: 'EXPENSE' },
];

const CATALOGUE: CategoryResponse[] = [
  { id: 1, name: 'Otros', appliesTo: 'BOTH', isSystem: true, transactionCount: 3 },
  { id: 4, name: 'Servicios', appliesTo: 'EXPENSE', isSystem: false, transactionCount: 12 },
  { id: 6, name: 'Salario', appliesTo: 'INCOME', isSystem: false, transactionCount: 2 },
];

/**
 * Un fijo del mes con el estado indicado.
 * Los importes y las fechas se dan enteros porque lo que se prueba aquí es el estado, que
 * es lo que decide qué botones salen en la fila.
 */
function item(
  overrides: Partial<RecurringOccurrenceResponse> & Pick<RecurringOccurrenceResponse, 'id'>,
): RecurringOccurrenceResponse {
  return {
    categoryId: 4,
    category: 'Servicios',
    transactionTypeId: 2,
    type: 'EXPENSE',
    description: 'Internet',
    amount: 180,
    dayOfMonth: 12,
    everyMonths: 1,
    startMonth: 1,
    startYear: 2026,
    active: true,
    month: 8,
    year: 2026,
    dueDate: '2026-08-12',
    status: 'OVERDUE',
    ...overrides,
  };
}

const ITEMS: RecurringOccurrenceResponse[] = [
  item({ id: 11 }),
  item({
    id: 12,
    description: 'Netflix',
    amount: 45,
    dayOfMonth: 20,
    status: 'PENDING',
    dueDate: '2026-08-20',
  }),
  item({
    id: 13,
    description: 'Alquiler',
    amount: 1200,
    dayOfMonth: 5,
    status: 'PAID',
    dueDate: '2026-08-05',
    transactionId: 99,
    paidAmount: 1200,
  }),
  item({
    id: 14,
    description: 'Seguro del auto',
    amount: 600,
    everyMonths: 12,
    dayOfMonth: 3,
    status: 'NOT_DUE',
    dueDate: undefined,
  }),
];

describe('RecurringPage', () => {
  let fixture: ComponentFixture<RecurringPage>;
  let http: HttpTestingController;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** Contesta a la carga inicial, que pide el mes, el catálogo y los tipos a la vez. */
  function settle(items: RecurringOccurrenceResponse[] = ITEMS): void {
    http.expectOne('/recurring-transactions?month=8&year=2026').flush(items);
    http.expectOne('/categories').flush(CATALOGUE);
    http.expectOne('/transaction-types').flush(TYPES);
    fixture.detectChanges();
  }

  /** La fila de la lista que lleva ese texto, que es como se la señala en pantalla. */
  function row(name: string): HTMLElement {
    return Array.from(host().querySelectorAll<HTMLElement>('.fs-fix__item')).find((element) =>
      element.textContent!.includes(name),
    )!;
  }

  /** El botón de esa fila cuyo rótulo empieza por el texto dado. */
  function button(within: HTMLElement, label: string): HTMLButtonElement {
    return Array.from(within.querySelectorAll<HTMLButtonElement>('button')).find((element) =>
      element.textContent!.trim().startsWith(label),
    )!;
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);

    await TestBed.configureTestingModule({
      imports: [RecurringPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);

    fixture = TestBed.createComponent(RecurringPage);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('abre en el mes en curso y separa lo que toca de lo que no', () => {
    settle();

    // Tres vencen este mes; el seguro anual se va a su propia sección para no estorbar en
    // un checklist de cosas que hay que resolver.
    expect(host().querySelectorAll('.fs-fix__item')).toHaveLength(3);
    expect(host().querySelector('.fs-rest__list')!.textContent).toContain('Seguro del auto');
  });

  it('suma solo lo que falta por pagar, no la lista entera', () => {
    settle();

    // 180 del internet vencido más 45 de Netflix. El alquiler ya está pagado y el seguro no
    // toca, así que ninguno de los dos es algo que falte.
    const total = host().querySelector('.fs-sum__amount')!.textContent!;
    expect(total).toContain('225.00');
    expect(host().querySelector('.fs-sum__of')!.textContent).toContain('2 fijos por pagar');
    expect(host().querySelector('.fs-sum__reading')!.textContent).toContain('1,200.00');
  });

  it('marca lo vencido con palabras y no solo con color', () => {
    settle();

    expect(row('Internet').querySelector('.fs-fix__state')!.textContent!.trim()).toBe('Vencido');
    expect(row('Netflix').querySelector('.fs-fix__state')!.textContent!.trim()).toBe('Pendiente');
    expect(row('Alquiler').querySelector('.fs-fix__state')!.textContent!.trim()).toBe('Pagado');
  });

  it('registra un fijo de un toque con el importe de siempre', () => {
    settle();

    button(row('Internet'), 'Pagado').click();

    const request = http.expectOne('/recurring-transactions/11/confirm');
    expect(request.request.method).toBe('POST');
    // Sin importe ni fecha: la API usa lo previsto, que es el caso de casi todos los meses.
    expect(request.request.body).toEqual({ month: 8, year: 2026 });
    request.flush(item({ id: 11, status: 'PAID', transactionId: 5, paidAmount: 180 }));

    // Se relee el mes entero: confirmar mueve además lo comprometido de su categoría.
    settle();
  });

  it('permite corregir el importe cuando el recibo no vino por lo de siempre', () => {
    settle();

    button(row('Internet'), 'Ajustar').click();
    fixture.detectChanges();

    const amount = host().querySelector<HTMLInputElement>('#adjustAmount11')!;
    expect(amount.value).toBe('180');
    amount.value = '212.40';
    amount.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    host()
      .querySelector<HTMLFormElement>('.fs-adjust')!
      .dispatchEvent(new Event('submit', { cancelable: true }));

    const request = http.expectOne('/recurring-transactions/11/confirm');
    expect(request.request.body).toEqual({
      month: 8,
      year: 2026,
      amount: 212.4,
      // El campo entrega un día suelto y la API espera un instante dentro del mes.
      date: '2026-08-12T00:00:00',
    });
    request.flush(item({ id: 11, status: 'PAID', transactionId: 5, paidAmount: 212.4 }));

    settle();
  });

  it('omitir un mes no toca la plantilla ni los demás meses', () => {
    settle();

    button(row('Netflix'), 'Este mes no').click();

    const request = http.expectOne('/recurring-transactions/12/skip');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ month: 8, year: 2026 });
    request.flush(item({ id: 12, description: 'Netflix', status: 'SKIPPED' }));

    settle();
  });

  it('lo ya pagado no ofrece deshacerse desde aquí', () => {
    settle();

    const paid = row('Alquiler');
    expect(button(paid, 'Pagado')).toBeUndefined();
    expect(paid.querySelector('.fs-fix__hint')!.textContent).toContain('historial');
  });

  it('un fijo omitido se puede devolver a pendiente', () => {
    settle([item({ id: 12, description: 'Netflix', amount: 45, status: 'SKIPPED' })]);

    button(row('Netflix'), 'Deshacer').click();

    const request = http.expectOne('/recurring-transactions/12/skip?month=8&year=2026');
    expect(request.request.method).toBe('DELETE');
    request.flush(item({ id: 12, description: 'Netflix', amount: 45, status: 'PENDING' }));

    settle([item({ id: 12, description: 'Netflix', amount: 45, status: 'PENDING' })]);
  });

  it('da de alta una plantilla con su ritmo y su mes de arranque', () => {
    settle();

    host().querySelector<HTMLButtonElement>('.fs-head__actions .fs-btn--solid')!.click();
    fixture.detectChanges();

    const description = host().querySelector<HTMLInputElement>('#recurringDescription')!;
    description.value = 'Gimnasio';
    description.dispatchEvent(new Event('input'));

    const amount = host().querySelector<HTMLInputElement>('#recurringAmount')!;
    amount.value = '120';
    amount.dispatchEvent(new Event('input'));

    const day = host().querySelector<HTMLInputElement>('#recurringDay')!;
    day.value = '15';
    day.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    // La categoría se elige en el selector de la casa, que no pasa por el formulario.
    const servicios = Array.from(
      host().querySelectorAll<HTMLButtonElement>('fs-category-picker button'),
    ).find((option) => option.textContent!.includes('Servicios'))!;
    servicios.click();
    fixture.detectChanges();

    host()
      .querySelector<HTMLFormElement>('.fs-form')!
      .dispatchEvent(new Event('submit', { cancelable: true }));

    const request = http.expectOne('/recurring-transactions');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      categoryId: 4,
      transactionTypeId: 2,
      description: 'Gimnasio',
      amount: 120,
      dayOfMonth: 15,
      everyMonths: 1,
      // Arranca en el mes que se está mirando: dar de alta un fijo hoy no dice nada de enero.
      startMonth: 8,
      startYear: 2026,
    });
    request.flush({
      id: 20,
      categoryId: 4,
      transactionTypeId: 2,
      description: 'Gimnasio',
      amount: 120,
      dayOfMonth: 15,
      everyMonths: 1,
      startMonth: 8,
      startYear: 2026,
      active: true,
    });

    settle();
  });

  it('pausar es lo que se ofrece para dejar de pagar algo, no borrar', () => {
    settle();

    row('Netflix').querySelector<HTMLButtonElement>('[aria-label^="Pausar"]')!.click();

    const call = http.expectOne('/recurring-transactions/12');
    expect(call.request.method).toBe('PATCH');
    // Solo el interruptor: pausar no cambia el importe ni el día ni el ritmo.
    expect(call.request.body).toEqual({ active: false });
    call.flush({ ...item({ id: 12, description: 'Netflix' }), active: false });

    settle();
  });

  it('cambiar de mes vuelve a preguntar por el mes nuevo', () => {
    settle();

    host().querySelector<HTMLButtonElement>('[aria-label="Mes anterior"]')!.click();
    fixture.detectChanges();

    http.expectOne('/recurring-transactions?month=7&year=2026').flush([]);
    http.expectOne('/categories').flush(CATALOGUE);
    http.expectOne('/transaction-types').flush(TYPES);
    fixture.detectChanges();

    expect(host().querySelector('.fs-blank__title')!.textContent).toContain('Todavía no tienes');
  });
});
