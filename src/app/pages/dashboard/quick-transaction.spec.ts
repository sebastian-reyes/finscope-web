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

/**
 * Observador de tamaño de mentira: jsdom no trae ninguno y aquí hace falta poder dispararlo
 * a mano, que es lo que en un navegador haría estirarse la tarjeta.
 */
let resize: (() => void) | null = null;

class FakeResizeObserver {
  constructor(private readonly callback: () => void) {
    resize = () => this.callback();
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

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

  /** Los detalles que viven detrás de «Más detalles», o nulo si están plegados. */
  function details(): HTMLElement | null {
    return host().querySelector<HTMLElement>('.fs-quick__extra');
  }

  /**
   * Dice cuánto alto sobra y avisa al observador, como haría el navegador al estirarse la
   * tarjeta. El bloque de detalles, cuando está, mide 90 px.
   */
  function slack(height: number): void {
    const gap = host().querySelector<HTMLElement>('.fs-quick__slack')!;
    Object.defineProperty(gap, 'offsetHeight', { value: height, configurable: true });
    const inner = host().querySelector<HTMLElement>('.fs-quick__extra-inner');
    if (inner) {
      Object.defineProperty(inner, 'scrollHeight', { value: 90, configurable: true });
    }
    resize?.();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    resize = null;
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = FakeResizeObserver;

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

  it('abre la fecha sola cuando en el hueco que sobra cabe entera', () => {
    expect(details()).toBeNull();

    slack(200);

    expect(details()).not.toBeNull();
    expect(host().textContent).toContain('Menos detalles');
  });

  it('deja la fecha plegada cuando no sobra alto donde ponerla', () => {
    slack(40);

    expect(details()).toBeNull();
    expect(host().textContent).toContain('Más detalles');
  });

  it('vuelve a plegar la fecha cuando el hueco desaparece', () => {
    slack(200);
    expect(details()).not.toBeNull();

    slack(0);

    expect(details()).toBeNull();
  });

  it('respeta lo que decida el usuario por encima del hueco', () => {
    slack(200);
    host().querySelector<HTMLButtonElement>('.fs-quick__more')!.click();
    fixture.detectChanges();
    expect(details()).toBeNull();

    // El hueco sigue ahí y sigue midiéndose: plegarlo a mano no puede deshacerse solo.
    slack(200);

    expect(details()).toBeNull();
  });
});
