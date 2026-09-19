import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
   * Dice cuánto alto sobra, sin dar tiempo a que la medida se asiente.
   * Es el fotograma suelto de una ráfaga: el formulario no debería hacerle caso todavía.
   *
   * @param height alto que sobra en ese instante
   */
  function measure(height: number): void {
    const gap = host().querySelector<HTMLElement>('.fs-quick__slack')!;
    Object.defineProperty(gap, 'offsetHeight', { value: height, configurable: true });
    const inner = host().querySelector<HTMLElement>('.fs-quick__extra-inner');
    if (inner) {
      Object.defineProperty(inner, 'scrollHeight', { value: 90, configurable: true });
    }
    resize?.();
    fixture.detectChanges();
  }

  /**
   * Dice cuánto alto sobra y deja que la medida se quede quieta, como cuando la pantalla ya
   * ha terminado de recolocarse. El bloque de detalles, cuando está, mide 90 px.
   *
   * @param height alto que sobra al terminar
   */
  function slack(height: number): void {
    measure(height);
    vi.advanceTimersByTime(300);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    vi.useFakeTimers();
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
    vi.useRealTimers();
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
    // Y con ella abierta por el sitio que sobra, el botón de plegarla no pinta nada: el hueco
    // seguiría ahí, vacío.
    expect(host().querySelector('.fs-quick__more')).toBeNull();
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
    // Sin sitio, la fecha está plegada y el botón sí se ofrece.
    slack(40);
    expect(details()).toBeNull();

    host().querySelector<HTMLButtonElement>('.fs-quick__more')!.click();
    fixture.detectChanges();
    expect(details()).not.toBeNull();

    // Y lo que abrió a mano no se lo cierra la medida, por mucho que deje de sobrar alto.
    slack(0);

    expect(details()).not.toBeNull();
    expect(host().textContent).toContain('Menos detalles');
  });

  it('no abre la fecha por un alto de paso, el que se ve mientras la pantalla se recoloca', () => {
    // Sin sitio, plegada. Es el estado del que parte el usuario.
    slack(40);
    expect(details()).toBeNull();

    // Al cambiar de moneda el reparto, la columna de al lado se rehace y el navegador pasa
    // por altos que no son ni el de antes ni el de después. Este es uno de ellos.
    measure(200);
    measure(40);
    vi.advanceTimersByTime(300);
    fixture.detectChanges();

    // Del fotograma de paso no se entera nadie: la fecha ni asomó.
    expect(details()).toBeNull();
  });

  it('no decide nada mientras la pantalla recarga: al lado hay un esqueleto, no datos', () => {
    slack(40);
    expect(details()).toBeNull();

    fixture.componentRef.setInput('settling', true);
    fixture.detectChanges();

    // El hueco del esqueleto daría de sobra para la fecha, pero no es el alto de verdad.
    slack(200);
    expect(details()).toBeNull();

    // Y en cuanto llegan los datos, se decide con lo que miden ellos.
    fixture.componentRef.setInput('settling', false);
    fixture.detectChanges();
    slack(200);
    expect(details()).not.toBeNull();
  });
});
