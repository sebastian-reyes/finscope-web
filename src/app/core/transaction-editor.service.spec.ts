import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TransactionChange, TransactionEditorService } from './transaction-editor.service';
import { ToastService } from './toast.service';
import {
  CategoryResponse,
  TagResponse,
  TransactionResponse,
  TransactionTypeResponse,
} from './models';

const TYPES: TransactionTypeResponse[] = [
  { id: 1, name: 'Ingreso', code: 'INCOME' },
  { id: 2, name: 'Egreso', code: 'EXPENSE' },
];

const CATEGORIES: CategoryResponse[] = [
  { id: 4, name: 'Comida', appliesTo: 'EXPENSE', isSystem: false, transactionCount: 12 },
];

const TAGS: TagResponse[] = [{ id: 1, name: 'gab', transactionCount: 4 }];

const EXISTING: TransactionResponse = {
  id: 10,
  amount: 40,
  description: 'Almuerzo con Gab',
  date: '2026-08-26T13:35:00',
  transactionType: TYPES[1],
  category: CATEGORIES[0],
  tags: ['gab'],
};

describe('TransactionEditorService', () => {
  let service: TransactionEditorService;
  let http: HttpTestingController;

  /** Contesta a la tanda de catálogos que dispara abrir la hoja. */
  function answerCatalogues(): void {
    http.expectOne('/transaction-types').flush(TYPES);
    http.expectOne('/categories').flush(CATEGORIES);
    http.expectOne('/tags').flush(TAGS);
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TransactionEditorService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('empieza cerrada', () => {
    expect(service.isOpen()).toBe(false);
    expect(service.target()).toBeNull();
  });

  it('abre en blanco para un alta y trae los catálogos que el formulario necesita', () => {
    service.openCreate();

    expect(service.isOpen()).toBe(true);
    expect(service.target()).toBeNull();
    answerCatalogues();
    expect(service.types()).toEqual(TYPES);
    expect(service.categories()).toEqual(CATEGORIES);
    expect(service.catalogue()).toEqual(TAGS);
  });

  it('abre sobre el movimiento que se va a editar', () => {
    service.openEdit(EXISTING);
    answerCatalogues();

    expect(service.isOpen()).toBe(true);
    expect(service.target()).toBe(EXISTING);
  });

  it('no vuelve a pedir los catálogos cada vez que se abre', () => {
    service.openCreate();
    answerCatalogues();
    service.close();

    service.openCreate();

    // `http.verify()` en el afterEach es quien comprueba que no ha quedado ninguna suelta.
    http.expectNone('/categories');
  });

  it('cierra, refresca los catálogos y cuenta lo guardado', () => {
    service.openCreate();
    answerCatalogues();
    const seen: TransactionChange[] = [];
    service.changes$.subscribe((change) => seen.push(change));

    service.notifySaved(77);

    expect(service.isOpen()).toBe(false);
    expect(service.target()).toBeNull();
    expect(seen).toEqual([{ kind: 'saved', id: 77 }]);
    // Los conteos de cada categoría y de cada tag han cambiado con el movimiento.
    answerCatalogues();
  });

  it('cuenta también los borrados, sin identificador', () => {
    service.openEdit(EXISTING);
    answerCatalogues();
    const seen: TransactionChange[] = [];
    service.changes$.subscribe((change) => seen.push(change));

    service.notifyDeleted();

    expect(service.isOpen()).toBe(false);
    expect(seen).toEqual([{ kind: 'deleted' }]);
    answerCatalogues();
  });

  it('deja la pantalla en pie aunque los catálogos no lleguen', () => {
    service.openCreate();
    http.expectOne('/transaction-types').flush(TYPES);
    http.expectOne('/categories').flush(CATEGORIES);
    http.expectOne('/tags').flush('caído', { status: 500, statusText: 'Server Error' });

    // La hoja sigue abierta y sin catálogos, y el fallo se cuenta por el canal de avisos:
    // tumbar aquí dejaría a medias la pantalla que hay detrás.
    expect(service.isOpen()).toBe(true);
    expect(service.types()).toEqual([]);
    expect(TestBed.inject(ToastService).toasts()).toHaveLength(1);
  });
});
