import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TransactionsPage } from './transactions';
import {
  CategoryResponse,
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
  { id: 1, name: 'Otros', appliesTo: 'BOTH', isSystem: true, transactionCount: 3 },
  { id: 4, name: 'Salud', appliesTo: 'EXPENSE', isSystem: false, transactionCount: 9 },
];

const TAGS: TagResponse[] = [{ id: 3, name: 'gab', transactionCount: 2 }];

const EMPTY_PAGE: TransactionPageResponse = {
  content: [],
  page: 0,
  size: 20,
  totalElements: 0,
  totalPages: 0,
};

const SUMMARY: TransactionSummaryResponse = {
  income: 0,
  expense: 0,
  net: 0,
  transactionCount: 7,
  byCurrency: [],
  byCategory: [],
  byTag: [],
};

/**
 * La pantalla de movimientos en un teléfono: los filtros recogidos en una barra, sus fichas y
 * la hoja. El resto del comportamiento es el mismo que en escritorio y lo cubre su propio
 * archivo.
 */
describe('TransactionsPage en un teléfono', () => {
  let fixture: ComponentFixture<TransactionsPage>;
  let http: HttpTestingController;
  let originalMatchMedia: typeof window.matchMedia;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** Contesta a todo lo que se haya pedido: listado y resumen de cada búsqueda. */
  function settle(): void {
    for (const request of http.match(() => true)) {
      const url = request.request.url;
      if (url.endsWith('/transaction-types')) {
        request.flush(TYPES);
      } else if (url.endsWith('/categories')) {
        request.flush(CATEGORIES);
      } else if (url.endsWith('/tags')) {
        request.flush(TAGS);
      } else if (url.endsWith('/transactions/summary')) {
        request.flush(SUMMARY);
      } else {
        request.flush(EMPTY_PAGE);
      }
    }
    fixture.detectChanges();
  }

  /** El último listado pedido, con sus parámetros, para saber qué filtros viajaron. */
  function lastListParams(): URLSearchParams {
    const request = http.match((candidate) => candidate.url.endsWith('/transactions')).at(-1)!;
    return new URLSearchParams(request.request.params.toString());
  }

  function button(text: string, scope: ParentNode = host()): HTMLButtonElement {
    return Array.from(scope.querySelectorAll<HTMLButtonElement>('button')).find(
      (candidate) => candidate.textContent!.trim() === text,
    )!;
  }

  function sheet(): HTMLElement | null {
    return host().querySelector('fs-bottom-sheet');
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);
    originalMatchMedia = window.matchMedia;
    window.matchMedia = (query: string) =>
      ({
        matches: query.includes('max-width'),
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }) as MediaQueryList;

    await TestBed.configureTestingModule({
      imports: [TransactionsPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);

    fixture = TestBed.createComponent(TransactionsPage);
    fixture.detectChanges();
    settle();
  });

  afterEach(() => {
    http.verify();
    window.matchMedia = originalMatchMedia;
    document.body.style.overflow = '';
    vi.useRealTimers();
  });

  it('deja a la vista solo la búsqueda, el botón de filtros y el mes', () => {
    expect(host().querySelector('.fs-filters--compact')).not.toBeNull();
    expect(host().querySelector('.fs-search__input')).not.toBeNull();
    expect(host().querySelector('.fs-month')).not.toBeNull();
    // Tipo, categoría, tag y moneda esperan en la hoja, que no está abierta.
    expect(host().querySelector('#filterCategory')).toBeNull();
    expect(host().textContent).not.toContain('Ingresos');
    expect(sheet()).toBeNull();
    expect(host().querySelector('.fs-active')).toBeNull();
  });

  it('abre la hoja y aplica cada elección al momento, sin esperar a cerrarla', () => {
    host().querySelector<HTMLButtonElement>('.fs-filters__open')!.click();
    fixture.detectChanges();

    expect(sheet()).not.toBeNull();
    expect(document.body.style.overflow).toBe('hidden');

    button('Egresos', sheet()!).click();
    fixture.detectChanges();
    expect(lastListParams().get('transactionTypeId')).toBe('2');
    settle();

    button('Salud', sheet()!).click();
    fixture.detectChanges();
    expect(lastListParams().get('categoryId')).toBe('4');
    settle();

    // El botón de abajo dice cuántos quedan y solo cierra: la lista ya está filtrada.
    button('Ver 7 movimientos', sheet()!).click();
    fixture.detectChanges();
    expect(http.match(() => true)).toHaveLength(0);
  });

  it('enseña lo puesto en fichas y cada una se quita de un toque', () => {
    host().querySelector<HTMLButtonElement>('.fs-filters__open')!.click();
    fixture.detectChanges();
    button('Egresos', sheet()!).click();
    fixture.detectChanges();
    settle();
    button('gab', sheet()!).click();
    fixture.detectChanges();
    settle();
    button('Ver 7 movimientos', sheet()!).click();
    fixture.detectChanges();

    const chips = Array.from(host().querySelectorAll('.fs-active__chip')).map((chip) =>
      chip.textContent!.trim(),
    );
    expect(chips).toEqual(['Egresos', 'gab']);
    expect(host().querySelector('.fs-filters__count')!.textContent!.trim()).toBe('2');

    host().querySelector<HTMLButtonElement>('[aria-label="Quitar el filtro gab"]')!.click();
    fixture.detectChanges();

    const params = lastListParams();
    expect(params.get('tag')).toBeNull();
    expect(params.get('transactionTypeId')).toBe('2');
    settle();
  });

  it('quita todas las fichas a la vez sin tocar el mes ni la búsqueda', () => {
    host().querySelector<HTMLButtonElement>('.fs-filters__open')!.click();
    fixture.detectChanges();
    button('Ingresos', sheet()!).click();
    fixture.detectChanges();
    settle();
    button('Salud', sheet()!).click();
    fixture.detectChanges();
    settle();
    button('Ver 7 movimientos', sheet()!).click();
    fixture.detectChanges();

    button('Quitar todos').click();
    fixture.detectChanges();

    const params = lastListParams();
    expect(params.get('transactionTypeId')).toBeNull();
    expect(params.get('categoryId')).toBeNull();
    expect(params.get('month')).toBe('8');
    settle();
    expect(host().querySelector('.fs-active')).toBeNull();
  });
});
