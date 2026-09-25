import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Params, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
  byCurrency: [{ currency: 'PEN', income: 3000, expense: 1200, net: 1800, transactionCount: 12 }],
  byCategory: [{ categoryId: 4, category: 'Comida', income: 0, expense: 800, transactionCount: 9 }],
  byTag: [{ tag: 'gab', income: 0, expense: 300, transactionCount: 2 }],
};

/** El mes anterior, con 1500 gastados: este mes, con 1200, se gasta un 20 % menos. */
const PREVIOUS: TransactionSummaryResponse = {
  ...SUMMARY,
  expense: 1500,
  net: 1500,
  byCurrency: [{ currency: 'PEN', income: 3000, expense: 1500, net: 1500, transactionCount: 14 }],
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
      currency: 'PEN',
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
    currency: 'PEN',
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
    currency: 'PEN',
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
    tags: ['casa'],
  },
];

/** Qué parte de la pantalla se contesta con un error en lugar de con sus datos. */
type Broken = 'summary' | 'budgets' | 'recurring';

/**
 * Con qué parámetros se entra a la pantalla. Se lee al construirla, así que quien lo cambie
 * tiene que hacerlo antes: de ahí que viva fuera y se ponga en un `beforeAll`.
 */
let query: Params = {};

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
   * El último movimiento en dólares, del que sale el tipo de referencia para verlo todo en
   * dólares. Se pide una vez al abrir la pantalla, no en cada recarga.
   *
   * @param usdRate tipo del último movimiento en dólares, o nulo si no hay ninguno
   */
  function settleRate(usdRate: number | null = null): void {
    http.expectOne('/transactions?currency=USD&page=0&size=1&sort=date,desc').flush(
      usdRate
        ? {
            content: [{ ...RECENT.content[0], currency: 'USD', exchangeRate: usdRate }],
            page: 0,
            size: 1,
            totalElements: 1,
            totalPages: 1,
          }
        : { content: [], page: 0, size: 1, totalElements: 0, totalPages: 0 },
    );
  }

  /**
   * Contesta a las cinco peticiones del periodo, que salen a la vez.
   *
   * @param month  mes que se espera en todas ellas
   * @param broken parte que se responde con un error, si alguna
   */
  function settlePeriod(month = 8, broken?: Broken, scope = 'convertTo=PEN'): void {
    const period = `month=${month}&year=2026`;
    // Por defecto el inicio lo junta todo en soles: el resumen y la evolución piden la
    // conversión y dejan de acotar por moneda. El listado de los últimos movimientos no se
    // convierte nunca, porque cada fila enseña la suya.
    const scoped = `${period}&${scope}`;
    const summary = http.expectOne(`/transactions/summary?${scoped}`);
    const series = http.expectOne(`/transactions/summary/series?${scoped}&granularity=DAY`);
    const previous = http.expectOne(`/transactions/summary?month=${month - 1}&year=2026&${scope}`);
    const recent = http.expectOne(`/transactions?${period}&page=0&size=6&sort=date,desc`);
    const budgets = http.expectOne(`/budgets?${period}`);
    const recurring = http.expectOne(`/recurring-transactions?${period}`);
    const boom = { status: 500, statusText: 'Server Error' };

    // El resumen se contesta el último a propósito. Es el único de los cinco cuyo error no
    // se recoge, así que en cuanto llega, `forkJoin` cancela lo que siguiera pendiente y
    // esas peticiones ya no admitirían respuesta.
    series.flush(SERIES);
    previous.flush(PREVIOUS);
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
    settleRate();
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

    // La ruta de verdad, con los parámetros con los que se ha entrado: `queryParamMap` se
    // deriva de `queryParams` la primera vez que alguien lo mira, y eso pasa dentro del
    // constructor de la pantalla.
    TestBed.inject(ActivatedRoute).queryParams = of(query);

    fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('no dibuja el formulario de registro en estrecho: ahí registrar es el botón central', () => {
    settle();

    // `matchMedia` de jsdom contesta que no a todo, que es justo la pantalla estrecha: la
    // tarjeta no está, y con ella tampoco el formulario, que ni llega a construirse.
    expect(host().querySelector('.fs-dash__quick')).toBeNull();
    expect(host().querySelector('fs-quick-transaction')).toBeNull();
    // Y lo que sí se sigue viendo es todo lo demás, que es a lo que se viene a esta pantalla.
    expect(card('balance')).toContain('1,800.00');
  });

  describe('entrando con «registrar» en la dirección', () => {
    beforeAll(() => {
      query = { registrar: '1' };
    });

    afterAll(() => {
      query = {};
    });

    it('abre la hoja, porque donde no hay formulario no hay importe que enfocar', () => {
      // Dos rondas de catálogos: los pide la pantalla al construirse y los vuelve a pedir la
      // hoja al abrirse, porque los primeros todavía no habían llegado.
      http.match('/transaction-types').forEach((request) => request.flush(TYPES));
      http.match('/categories').forEach((request) => request.flush(CATEGORIES));
      http.match('/tags').forEach((request) => request.flush(TAGS));
      settleRate();
      settlePeriod();

      expect(TestBed.inject(TransactionEditorService).isOpen()).toBe(true);
    });
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

  describe('viendo el dinero en una sola moneda', () => {
    /** El selector de vista del balance, si se ofrece. */
    function viewButton(label: string): HTMLButtonElement | undefined {
      return Array.from(host().querySelectorAll<HTMLButtonElement>('.fs-views .fs-seg__btn')).find(
        (button) => button.getAttribute('aria-label') === label,
      );
    }

    afterEach(() => localStorage.clear());

    it('abre juntándolo todo en soles y compara el gasto con el mes anterior', () => {
      settle();

      // 1200 frente a los 1500 de julio: un 20 % menos.
      expect(card('balance')).toContain('Gastas 20 % menos que en julio');
      expect(card('balance')).toContain('1,800.00');
    });

    it('no ofrece elegir vista a quien nunca ha usado dólares', () => {
      settle();

      expect(host().querySelector('.fs-views')).toBeNull();
    });

    it('en dólares pide la conversión con el último tipo registrado y avisa de que es aproximado', () => {
      settleCatalogues();
      settleRate(3.55);
      settlePeriod();

      viewButton('Todo en dólares')!.click();
      fixture.detectChanges();

      const scope = 'convertTo=USD&rate=3.55';
      http
        .expectOne(`/transactions/summary/series?month=8&year=2026&${scope}&granularity=DAY`)
        .flush(SERIES);
      http.expectOne(`/transactions/summary?month=7&year=2026&${scope}`).flush(PREVIOUS);
      http.expectOne('/transactions?month=8&year=2026&page=0&size=6&sort=date,desc').flush(RECENT);
      http.expectOne('/budgets?month=8&year=2026').flush(BUDGETS);
      http.expectOne('/recurring-transactions?month=8&year=2026').flush(RECURRING);
      http
        .expectOne(`/transactions/summary?month=8&year=2026&${scope}`)
        .flush({ ...SUMMARY, currency: 'USD', rate: 3.55 });
      fixture.detectChanges();

      expect(card('balance')).toContain('Aproximado');
      expect(card('balance')).toContain('3.55');
    });

    it('por moneda vuelve a separarlas y lo recuerda en este dispositivo', () => {
      settleCatalogues();
      settleRate(3.55);
      settlePeriod();

      viewButton('Cada moneda por separado')!.click();
      fixture.detectChanges();
      settlePeriod(8, undefined, 'currency=PEN');

      expect(localStorage.getItem('finscope.moneyView')).toBe('split');
      expect(card('balance')).toContain('Soles');
    });
  });
});
