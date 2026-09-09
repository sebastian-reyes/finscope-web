import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardPage } from './dashboard';
import { TransactionEditorService } from '../../core/transaction-editor.service';
import {
  BudgetResponse,
  CategoryResponse,
  RecurringOccurrenceResponse,
  SummarySeriesResponse,
  TagResponse,
  TransactionPageResponse,
  TransactionSummaryResponse,
  TransactionTypeResponse,
} from '../../core/models';

/** Agosto de 2026, para que el mes que abre la pantalla no dependa de cuándo se ejecute. */
const TODAY = new Date(2026, 7, 15, 10, 0, 0);

const TYPES: TransactionTypeResponse[] = [
  { id: 1, name: 'Ingreso', code: 'INCOME' },
  { id: 2, name: 'Egreso', code: 'EXPENSE' },
];

const CATEGORIES: CategoryResponse[] = [
  { id: 4, name: 'Comida', appliesTo: 'EXPENSE', isSystem: false, transactionCount: 9 },
];

const TAGS: TagResponse[] = [{ id: 3, name: 'gab', transactionCount: 2 }];

const SUMMARY: TransactionSummaryResponse = {
  income: 3000,
  expense: 1200,
  net: 1800,
  transactionCount: 12,
  byCategory: [{ categoryId: 4, category: 'Comida', income: 0, expense: 800, transactionCount: 9 }],
  byTag: [{ tag: 'gab', income: 0, expense: 300, transactionCount: 2 }],
};

const SERIES: SummarySeriesResponse = {
  granularity: 'DAY',
  buckets: [
    { periodStart: '2026-08-14T00:00:00', income: 0, expense: 120, net: -120, transactionCount: 1 },
  ],
};

const RECENT: TransactionPageResponse = {
  content: [
    {
      id: 7,
      amount: 120,
      description: 'Limpieza dental',
      date: '2026-08-14T18:00:00',
      transactionType: TYPES[1],
      category: CATEGORIES[0],
      tags: [],
    },
  ],
  page: 0,
  size: 6,
  totalElements: 1,
  totalPages: 1,
};

const BUDGETS: BudgetResponse[] = [
  {
    id: 2,
    categoryId: 4,
    category: 'Comida',
    month: 8,
    year: 2026,
    amount: 1000,
    spent: 800,
    committed: 100,
    remaining: 200,
    available: 100,
  },
];

const RECURRING: RecurringOccurrenceResponse[] = [
  {
    id: 5,
    categoryId: 4,
    transactionTypeId: 2,
    description: 'Internet',
    amount: 180,
    dayOfMonth: 12,
    everyMonths: 1,
    startMonth: 1,
    startYear: 2026,
    active: true,
    category: 'Comida',
    type: 'EXPENSE',
    month: 8,
    year: 2026,
    dueDate: '2026-08-12',
    status: 'PENDING',
  },
];

/** Qué parte de la pantalla se contesta con un error en lugar de con sus datos. */
type Broken = 'summary' | 'budgets' | 'recurring';

describe('DashboardPage', () => {
  let fixture: ComponentFixture<DashboardPage>;
  let http: HttpTestingController;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** Los tres catálogos, que el editor pide aparte de los datos del periodo. */
  function settleCatalogues(): void {
    http.expectOne('/transaction-types').flush(TYPES);
    http.expectOne('/categories').flush(CATEGORIES);
    http.expectOne('/tags').flush(TAGS);
  }

  /**
   * Contesta a las cinco peticiones del periodo, que salen a la vez.
   *
   * @param month  mes que se espera en todas ellas
   * @param broken parte que se responde con un error, si alguna
   */
  function settlePeriod(month = 8, broken?: Broken): void {
    const period = `month=${month}&year=2026`;
    const summary = http.expectOne(`/transactions/summary?${period}`);
    const series = http.expectOne(`/transactions/summary/series?${period}&granularity=DAY`);
    const recent = http.expectOne(`/transactions?${period}&page=0&size=6&sort=date,desc`);
    const budgets = http.expectOne(`/budgets?${period}`);
    const recurring = http.expectOne(`/recurring-transactions?${period}`);
    const boom = { status: 500, statusText: 'Server Error' };

    // El resumen se contesta el último a propósito. Es el único de los cinco cuyo error no
    // se recoge, así que en cuanto llega, `forkJoin` cancela lo que siguiera pendiente y
    // esas peticiones ya no admitirían respuesta.
    series.flush(SERIES);
    recent.flush(RECENT);
    if (broken === 'budgets') {
      budgets.flush('roto', boom);
    } else {
      budgets.flush(BUDGETS);
    }
    if (broken === 'recurring') {
      recurring.flush('roto', boom);
    } else {
      recurring.flush(RECURRING);
    }
    if (broken === 'summary') {
      summary.flush('roto', boom);
    } else {
      summary.flush(SUMMARY);
    }
    fixture.detectChanges();
  }

  function settle(broken?: Broken): void {
    settleCatalogues();
    settlePeriod(8, broken);
  }

  /** El texto de una tarjeta del inicio, por su clase de rejilla. */
  function card(name: string): string {
    return host().querySelector<HTMLElement>(`.fs-dash__${name}`)!.textContent!;
  }

  /** El botón de dar por pagado el fijo pendiente. */
  function pay(): HTMLButtonElement {
    return host().querySelector<HTMLButtonElement>('.fs-recsum__item .fs-btn')!;
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);

    await TestBed.configureTestingModule({
      imports: [DashboardPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);

    fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('enseña el balance del mes en curso, que es el que abre la pantalla', () => {
    settle();

    expect(card('balance')).toContain('1,800.00');
    expect(card('balance')).toContain('12');
  });

  it('sigue contestando a todo lo demás aunque el plan del mes no cargue', () => {
    settle('budgets');

    // El balance, el reparto y el historial no dependen de los presupuestos.
    expect(host().querySelector('.fs-alert')).toBeNull();
    expect(card('balance')).toContain('1,800.00');
    // Y el hueco no se calla: decir «este mes no tiene presupuesto» sería mentir.
    expect(card('budgets')).toContain('No se pudo cargar el plan del mes');
  });

  it('sigue contestando a todo lo demás aunque los fijos no carguen', () => {
    settle('recurring');

    expect(host().querySelector('.fs-alert')).toBeNull();
    expect(card('balance')).toContain('1,800.00');
    expect(card('recurring')).toContain('No se pudieron cargar tus fijos');
  });

  it('se cae entera si no llega el resumen, que es lo único sin lo que no queda nada', () => {
    settle('summary');

    expect(host().querySelector('.fs-alert')).not.toBeNull();
    expect(host().querySelector('.fs-balance__value')).toBeNull();
  });

  it('las flechas mueven el mes y vuelven a pedirlo todo con él', () => {
    settle();

    host().querySelector<HTMLButtonElement>('.fs-period__step')!.click();
    fixture.detectChanges();

    // Solo los datos del periodo: los catálogos no dependen del mes que se mire.
    settlePeriod(7);
    expect(host().querySelector('.fs-period__title')!.textContent).toContain('Julio');
  });

  it('no deja adelantarse al mes en curso, que no tiene balance que enseñar', () => {
    settle();

    const forward = host().querySelectorAll<HTMLButtonElement>('.fs-period__step')[1];
    expect(forward.disabled).toBe(true);
  });

  it('reparte por tags sin preguntar de nuevo: los dos desgloses vienen en el mismo resumen', () => {
    settle();

    host().querySelectorAll<HTMLButtonElement>('.fs-dash__spending .fs-seg__btn')[1].click();
    fixture.detectChanges();

    http.expectNone(() => true);
    expect(card('spending')).toContain('gab');
  });

  it('marca el fijo como pagado en el mes que se está mirando, no en el de hoy', () => {
    settle();
    host().querySelector<HTMLButtonElement>('.fs-period__step')!.click();
    fixture.detectChanges();
    settlePeriod(7);

    pay().click();
    fixture.detectChanges();

    const request = http.expectOne('/recurring-transactions/5/confirm');
    expect(request.request.body).toEqual({ month: 7, year: 2026 });
    request.flush(RECURRING[0]);
    fixture.detectChanges();

    // Y se recarga la pantalla entera: el balance, el reparto y el presupuesto de esa
    // categoría acaban de cambiar todos a la vez.
    settlePeriod(7);
  });

  it('no deja dar por pagado dos veces el mismo fijo', () => {
    settle();

    pay().click();
    fixture.detectChanges();
    const request = http.expectOne('/recurring-transactions/5/confirm');

    expect(pay().disabled).toBe(true);
    pay().click();
    fixture.detectChanges();
    http.expectNone('/recurring-transactions/5/confirm');

    request.flush(RECURRING[0]);
    fixture.detectChanges();
    settlePeriod();
  });

  it('lo registrado desde la hoja de la aplicación recarga el inicio y se señala un momento', () => {
    settle();

    TestBed.inject(TransactionEditorService).notifySaved(7);
    fixture.detectChanges();

    // Guardar rehace también los catálogos: el conteo de cada categoría acaba de cambiar.
    settleCatalogues();
    settlePeriod();
    expect(host().querySelector('.fs-item.is-fresh')).not.toBeNull();

    // Y deja de señalarse solo, sin que nadie lo toque.
    vi.advanceTimersByTime(1800);
    fixture.detectChanges();
    expect(host().querySelector('.fs-item.is-fresh')).toBeNull();
  });
});
