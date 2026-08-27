import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QuickTransactionComponent } from './quick-transaction';
import { CategoryResponse, TagResponse, TransactionTypeResponse } from '../../core/models';

const TYPES: TransactionTypeResponse[] = [
  { id: 1, name: 'Ingreso', code: 'INCOME' },
  { id: 2, name: 'Egreso', code: 'EXPENSE' },
];

const CATEGORIES: CategoryResponse[] = [
  { id: 4, name: 'Comida', appliesTo: 'EXPENSE', isSystem: false, transactionCount: 12 },
];

const TAGS: TagResponse[] = [{ id: 1, name: 'gab', transactionCount: 4 }];

describe('QuickTransactionComponent', () => {
  let fixture: ComponentFixture<QuickTransactionComponent>;
  let http: HttpTestingController;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** Escribe en el campo de tags y lo cierra, como al pulsar intro. */
  function addTag(name: string): void {
    const field = host().querySelector<HTMLInputElement>('.fs-tags__input')!;
    field.value = name;
    field.dispatchEvent(new Event('input'));
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
  }

  function submit(): void {
    host().querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuickTransactionComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);

    fixture = TestBed.createComponent(QuickTransactionComponent);
    fixture.componentRef.setInput('types', TYPES);
    fixture.componentRef.setInput('categories', CATEGORIES);
    fixture.componentRef.setInput('tags', TAGS);
    fixture.detectChanges();

    const amount = host().querySelector<HTMLInputElement>('#quickAmount')!;
    amount.value = '40';
    amount.dispatchEvent(new Event('input'));
    host().querySelector<HTMLButtonElement>('.fs-picker__option')!.click();
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
  });

  it('registra el movimiento con todos los tags escritos, no solo con el primero', () => {
    addTag('gab');
    addTag('salida');

    submit();

    const request = http.expectOne('/transactions');
    expect(request.request.body.tags).toEqual(['gab', 'salida']);
    request.flush({});
  });

  it('descarta el tag repetido aunque se escriba con otras mayúsculas', () => {
    addTag('gab');
    addTag('GAB');

    submit();

    const request = http.expectOne('/transactions');
    expect(request.request.body.tags).toEqual(['gab']);
    request.flush({});
  });

  it('no manda el campo de tags cuando no se escribe ninguno', () => {
    submit();

    const request = http.expectOne('/transactions');
    expect(request.request.body.tags).toBeUndefined();
    request.flush({});
  });

  it('no registra nada sin categoría', () => {
    // Se suelta la categoría que eligió el montaje.
    host().querySelector<HTMLButtonElement>('.fs-picker__option')!.click();
    fixture.detectChanges();

    submit();

    http.expectNone('/transactions');
    expect(host().textContent).toContain('Elige una categoría');
  });
});
