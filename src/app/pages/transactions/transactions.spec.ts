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
  TransactionResponse,
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

const MOVEMENT: TransactionResponse = {
  id: 1,
  amount: 120,
  description: 'Limpieza dental',
  date: '2026-08-14T18:00:00',
  transactionType: TYPES[1],
  category: CATEGORIES[1],
  tags: [],
};

/** La primera de dos páginas, para que el paginador exista y se pueda avanzar. */
const FIRST_OF_TWO: TransactionPageResponse = {
  content: [MOVEMENT],
  page: 0,
  size: 20,
  totalElements: 25,
  totalPages: 2,
};

const EMPTY_SUMMARY: TransactionSummaryResponse = {
  income: 0,
  expense: 0,
  net: 0,
  transactionCount: 0,
  byCategory: [],
  byTag: [],
};

describe('TransactionsPage', () => {
  let fixture: ComponentFixture<TransactionsPage>;
  let http: HttpTestingController;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function box(): HTMLInputElement {
    return host().querySelector<HTMLInputElement>('.fs-search__input')!;
  }

  /** Escribe en el cuadro de búsqueda como lo haría el usuario, tecla a tecla. */
  function type(text: string): void {
    box().value = text;
    box().dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  /**
   * Contesta a la carga de la lista y de sus totales, que se piden a la vez.
   *
   * @param search texto que se espera en ambas peticiones, o vacío si no hay búsqueda
   */
  function settleList(search = ''): void {
    const filter = search ? `&search=${search}` : '';
    http
      .expectOne(`/transactions?month=8&year=2026${filter}&page=0&size=20&sort=date,desc`)
      .flush(EMPTY_PAGE);
    http.expectOne(`/transactions/summary?month=8&year=2026${filter}`).flush(EMPTY_SUMMARY);
    fixture.detectChanges();
  }

  /** Contesta además a los tres catálogos, que solo se piden al abrir la pantalla. */
  function settle(): void {
    http.expectOne('/transaction-types').flush(TYPES);
    http.expectOne('/categories').flush(CATEGORIES);
    http.expectOne('/tags').flush(TAGS);
    settleList();
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(TODAY);

    await TestBed.configureTestingModule({
      imports: [TransactionsPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);

    fixture = TestBed.createComponent(TransactionsPage);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('busca una sola vez cuando se deja de escribir, no en cada tecla', () => {
    settle();

    type('den');
    type('dent');
    type('dentista');
    // Mientras se escribe no se ha pedido nada: es lo que evita una consulta por letra.
    http.expectNone(() => true);

    vi.advanceTimersByTime(300);
    settleList('dentista');
  });

  it('vuelve a la primera página al buscar, porque la que se veía ya no aplica', () => {
    http.expectOne('/transaction-types').flush(TYPES);
    http.expectOne('/categories').flush(CATEGORIES);
    http.expectOne('/tags').flush(TAGS);
    http
      .expectOne('/transactions?month=8&year=2026&page=0&size=20&sort=date,desc')
      .flush(FIRST_OF_TWO);
    http.expectOne('/transactions/summary?month=8&year=2026').flush(EMPTY_SUMMARY);
    fixture.detectChanges();

    host().querySelectorAll<HTMLButtonElement>('.fs-pager__btn')[1].click();
    fixture.detectChanges();
    http
      .expectOne('/transactions?month=8&year=2026&page=1&size=20&sort=date,desc')
      .flush({ ...FIRST_OF_TWO, page: 1 });
    // Cambiar de página rehace también los totales: la lista y lo que suma van juntas.
    http.expectOne('/transactions/summary?month=8&year=2026').flush(EMPTY_SUMMARY);
    fixture.detectChanges();

    type('dentista');
    vi.advanceTimersByTime(300);

    // La segunda página de todo agosto no es la segunda página de lo que dice «dentista».
    http
      .expectOne('/transactions?month=8&year=2026&search=dentista&page=0&size=20&sort=date,desc')
      .flush(EMPTY_PAGE);
    http.expectOne('/transactions/summary?month=8&year=2026&search=dentista').flush(EMPTY_SUMMARY);
    fixture.detectChanges();
  });

  it('borra la búsqueda al instante, sin esperar al retardo', () => {
    settle();

    type('dentista');
    vi.advanceTimersByTime(300);
    settleList('dentista');

    host().querySelector<HTMLButtonElement>('.fs-search__clear')!.click();
    fixture.detectChanges();

    // Sin adelantar el reloj: quien borra a propósito no está escribiendo.
    settleList();

    // Y lo que quedaba pendiente del retardo ya no vuelve a pedir nada.
    vi.advanceTimersByTime(300);
    http.expectNone(() => true);
  });

  it('explica el vacío nombrando lo que se buscó', () => {
    settle();

    type('dentista');
    vi.advanceTimersByTime(300);
    settleList('dentista');

    expect(host().querySelector('.fs-blank__title')!.textContent).toContain('dentista');
  });
});
