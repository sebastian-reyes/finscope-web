import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TransactionEditorComponent } from './transaction-editor';
import {
  CategoryResponse,
  TagResponse,
  TransactionResponse,
  TransactionTypeResponse,
} from '../../core/models';

const TYPES: TransactionTypeResponse[] = [
  { id: 1, name: 'Ingreso', code: 'INCOME' },
  { id: 2, name: 'Egreso', code: 'EXPENSE' },
];

const CATEGORIES: CategoryResponse[] = [
  { id: 4, name: 'Comida', appliesTo: 'EXPENSE', isSystem: false, transactionCount: 12 },
  { id: 5, name: 'Regalos', appliesTo: 'EXPENSE', isSystem: false, transactionCount: 2 },
];

const TAGS: TagResponse[] = [{ id: 1, name: 'gab', transactionCount: 4 }];

/** Movimiento existente sobre el que se prueban las ediciones. */
const EXISTING: TransactionResponse = {
  id: 10,
  amount: 40,
  description: 'Almuerzo con Gab',
  date: '2026-08-26T13:35:00',
  transactionType: TYPES[1],
  category: CATEGORIES[0],
  tags: ['gab'],
};

describe('TransactionEditorComponent', () => {
  let fixture: ComponentFixture<TransactionEditorComponent>;
  let http: HttpTestingController;

  /**
   * Monta el editor sobre un movimiento existente, o vacío si no se indica ninguno.
   *
   * @param transaction movimiento a editar
   */
  function mount(transaction: TransactionResponse | null): void {
    fixture = TestBed.createComponent(TransactionEditorComponent);
    fixture.componentRef.setInput('transaction', transaction);
    fixture.componentRef.setInput('types', TYPES);
    fixture.componentRef.setInput('categories', CATEGORIES);
    fixture.componentRef.setInput('catalogue', TAGS);
    fixture.detectChanges();
  }

  /** Envía el formulario como lo haría el botón de guardar. */
  function submit(): void {
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  function setValue(selector: string, value: string): void {
    const field: HTMLInputElement = fixture.nativeElement.querySelector(selector);
    field.value = value;
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TransactionEditorComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('no registra el movimiento si no se ha elegido categoría', () => {
    mount(null);
    setValue('#editorAmount', '40');

    submit();

    // Ni una petición: la categoría es obligatoria y el aviso lo dice en pantalla.
    http.expectNone('/transactions');
    expect(fixture.nativeElement.textContent).toContain('Elige una categoría');
  });

  it('lleva el foco a lo que falta cuando se intenta registrar en vacío', () => {
    mount(null);
    // El cuerpo de la hoja se desplaza, así que lo que falta puede estar fuera de la vista:
    // el foco es lo que lo trae de vuelta y lo que anuncia un lector de pantalla.
    fixture.nativeElement.querySelector('#editorDescription').focus();

    submit();

    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('#editorAmount'));
    expect(fixture.nativeElement.textContent).toContain('Escribe un monto mayor que cero');
  });

  it('registra el movimiento con su categoría y sin tags cuando no se escribe ninguno', () => {
    mount(null);
    setValue('#editorAmount', '40');
    fixture.nativeElement.querySelectorAll('.fs-picker__option')[0].click();
    fixture.detectChanges();

    submit();

    const request = http.expectOne('/transactions');
    expect(request.request.method).toBe('POST');
    expect(request.request.body.amount).toBe(40);
    expect(request.request.body.categoryId).toBe(4);
    expect(request.request.body.transactionTypeId).toBe(2);
    // Los tags siguen siendo opcionales: si no hay, el campo ni se manda.
    expect(request.request.body.tags).toBeUndefined();
    request.flush({});
  });

  it('parte de la categoría que ya tenía el movimiento al editarlo', () => {
    mount(EXISTING);

    const picked = fixture.nativeElement.querySelector('.fs-picker__option.is-picked');
    expect(picked.textContent.trim()).toBe('Comida');
  });

  it('manda solo lo que ha cambiado', () => {
    mount(EXISTING);
    setValue('#editorAmount', '55');

    submit();

    const request = http.expectOne('/transactions/10');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ amount: 55 });
    request.flush({});
  });

  it('manda la categoría nueva cuando se cambia', () => {
    mount(EXISTING);
    fixture.nativeElement.querySelectorAll('.fs-picker__option')[1].click();
    fixture.detectChanges();

    submit();

    const request = http.expectOne('/transactions/10');
    expect(request.request.body).toEqual({ categoryId: 5 });
    request.flush({});
  });

  it('avisa de qué movimiento se ha guardado, para poder señalarlo en la lista', () => {
    mount(null);
    setValue('#editorAmount', '40');
    fixture.nativeElement.querySelectorAll('.fs-picker__option')[0].click();
    fixture.detectChanges();

    const saved: number[] = [];
    fixture.componentInstance.saved.subscribe((id) => saved.push(id));

    submit();
    http.expectOne('/transactions').flush({ id: 77 });

    expect(saved).toEqual([77]);
  });

  it('avisa también al editar, con el mismo identificador', () => {
    mount(EXISTING);
    setValue('#editorAmount', '55');

    const saved: number[] = [];
    fixture.componentInstance.saved.subscribe((id) => saved.push(id));

    submit();
    http.expectOne('/transactions/10').flush({ id: 10 });

    expect(saved).toEqual([10]);
  });

  it('no llama a la API cuando no se ha tocado nada', () => {
    mount(EXISTING);

    submit();

    http.expectNone('/transactions/10');
  });
});
