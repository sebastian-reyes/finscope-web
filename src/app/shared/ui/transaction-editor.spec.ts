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
  currency: 'PEN',
  description: 'Almuerzo con Gab',
  date: '2026-08-26T13:35:00',
  transactionType: TYPES[1],
  category: CATEGORIES[0],
  tags: ['gab'],
};

/** Movimiento existente en una moneda que no es la base, con su tipo de cambio. */
const IN_DOLLARS: TransactionResponse = {
  id: 11,
  amount: 15.99,
  currency: 'USD',
  exchangeRate: 3.55,
  description: 'Netflix',
  date: '2026-08-26T13:35:00',
  transactionType: TYPES[1],
  category: CATEGORIES[0],
  tags: [],
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
    // Abrir sobre un movimiento que no esta en la moneda base pregunta por la ultima tasa
    // igual que elegirla a mano; lo que traiga no se usa, porque el movimiento ya tiene la
    // suya.
    answerLastRate();
  }

  /** Envía el formulario como lo haría el botón de guardar. */
  function submit(): void {
    fixture.nativeElement.querySelector('form').dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  /**
   * Contesta a la consulta de la ultima tasa usada, que dispara elegir una moneda que no es
   * la base. Se usa `match` y no `expectOne` porque la consulta sale una sola vez por
   * moneda: la segunda vez que se elige, ya se sabe y no hay nada que contestar.
   *
   * @param last tasa del ultimo movimiento en esa moneda, o nulo si no hay ninguno
   */
  function answerLastRate(last: number | null = null): void {
    const pending = http.match(
      (request) => request.url === '/transactions' && request.params.get('currency') === 'USD',
    );
    const content = last === null ? [] : [{ ...IN_DOLLARS, exchangeRate: last }];
    pending.forEach((request) =>
      request.flush({ content, page: 0, size: 1, totalElements: content.length, totalPages: 1 }),
    );
    fixture.detectChanges();
  }

  /**
   * Elige una moneda en el selector que acompana al monto y contesta a lo que eso dispare.
   *
   * @param currency codigo de la moneda a elegir
   * @param last     ultima tasa que devuelve el historial, si se pide
   */
  function pickCurrency(currency: string, last: number | null = null): void {
    const symbols: Record<string, string> = { PEN: 'S/', USD: '$' };
    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.fs-money-switch__btn'),
    );
    const button = buttons.find((candidate) => candidate.textContent?.trim() === symbols[currency]);
    button?.click();
    fixture.detectChanges();
    answerLastRate(last);
  }

  /**
   * El texto de la hoja con los espacios normalizados, para poder buscar frases en el.
   *
   * @return el texto pintado, con cada racha de espacios reducida a uno
   */
  function rendered(): string {
    return (fixture.nativeElement.textContent ?? '').replace(/\s+/g, ' ');
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

  it('registra en soles sin pedir tipo de cambio', () => {
    mount(null);
    setValue('#editorAmount', '40');
    fixture.nativeElement.querySelectorAll('.fs-picker__option')[0].click();
    fixture.detectChanges();

    // La moneda base no se convierte a si misma, asi que el campo ni aparece.
    expect(fixture.nativeElement.querySelector('#editorRate')).toBeNull();

    submit();

    const request = http.expectOne('/transactions');
    expect(request.request.body.currency).toBe('PEN');
    expect(request.request.body.exchangeRate).toBeUndefined();
    request.flush({});
  });

  it('pide el tipo de cambio al elegir dolares y lo manda con el movimiento', () => {
    mount(null);
    pickCurrency('USD');
    setValue('#editorAmount', '60');
    setValue('#editorRate', '3.55');
    fixture.nativeElement.querySelectorAll('.fs-picker__option')[0].click();
    fixture.detectChanges();

    submit();

    const request = http.expectOne('/transactions');
    expect(request.request.body.amount).toBe(60);
    expect(request.request.body.currency).toBe('USD');
    expect(request.request.body.exchangeRate).toBe(3.55);
    request.flush({});
  });

  it('ensena a cuanto equivale antes de guardar, que es lo que delata un cambio mal tecleado', () => {
    mount(null);
    pickCurrency('USD');
    setValue('#editorAmount', '100');
    setValue('#editorRate', '3.55');

    // 100 x 3.55 = 355, y se lee de golpe si en lugar de 3.55 se escribio 35.5.
    expect(fixture.nativeElement.textContent).toContain('S/ 355.00');
  });

  it('propone la ultima tasa que se uso, para no tener que teclearla cada vez', () => {
    mount(null);
    pickCurrency('USD', 3.55);

    // Registrar en dolares no cuesta un campo mas: la tasa ya viene puesta y basta con
    // confirmarla. Sale del propio historial, no de ninguna fuente externa.
    const rate: HTMLInputElement = fixture.nativeElement.querySelector('#editorRate');
    expect(rate.value).toBe('3.55');
    expect(rendered()).toContain('Es el que usaste el');
  });

  it('deja corregir la tasa propuesta, y entonces deja de decir de cuando es', () => {
    mount(null);
    pickCurrency('USD', 3.55);
    setValue('#editorRate', '3.7');

    expect(rendered()).not.toContain('Es el que usaste el');
  });

  it('no deja registrar en dolares sin tipo de cambio', () => {
    mount(null);
    pickCurrency('USD');
    setValue('#editorAmount', '60');
    fixture.nativeElement.querySelectorAll('.fs-picker__option')[0].click();
    fixture.detectChanges();

    submit();

    http.expectNone('/transactions');
  });

  it('carga la moneda y el cambio con los que se registro el movimiento', () => {
    mount(IN_DOLLARS);

    const rate: HTMLInputElement = fixture.nativeElement.querySelector('#editorRate');
    expect(rate.value).toBe('3.55');
    // El simbolo del campo del monto es el de su moneda, no el de la base.
    expect(
      fixture.nativeElement.querySelector('.fs-amount-field__currency').textContent.trim(),
    ).toBe('$');
  });

  it('corregir el importe de un movimiento en dolares no toca su tipo de cambio', () => {
    mount(IN_DOLLARS);
    setValue('#editorAmount', '17.99');

    submit();

    const request = http.expectOne('/transactions/11');
    // Ni la moneda ni el cambio viajan: el historico es de aquel dia y no se recalcula.
    expect(request.request.body).toEqual({ amount: 17.99 });
    request.flush({});
  });

  it('volver a soles limpia el tipo de cambio y no lo manda', () => {
    mount(IN_DOLLARS);
    pickCurrency('PEN');

    submit();

    const request = http.expectOne('/transactions/11');
    // Solo la moneda: la API borra el cambio al verla, que es lo unico que puede hacerse
    // cuando un nulo significa «no lo toques».
    expect(request.request.body).toEqual({ currency: 'PEN' });
    expect(fixture.nativeElement.querySelector('#editorRate')).toBeNull();
    request.flush({});
  });

  it('no llama a la API cuando no se ha tocado nada', () => {
    mount(EXISTING);

    submit();

    http.expectNone('/transactions/10');
  });
});
