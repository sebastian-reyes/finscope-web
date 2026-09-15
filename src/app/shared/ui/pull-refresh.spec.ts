import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PullRefreshComponent } from './pull-refresh';
import { RefreshService } from '../../core/refresh.service';
import { TransactionEditorService } from '../../core/transaction-editor.service';

/** La hoja de registro, de mentira: aquí solo importa si está abierta. */
const editor = { isOpen: signal(false) };

describe('PullRefreshComponent', () => {
  let fixture: ComponentFixture<PullRefreshComponent>;
  let refresh: RefreshService;
  let reload: ReturnType<typeof vi.fn<() => void>>;
  let busy: ReturnType<typeof signal<boolean>>;
  let unregister: () => void;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** El indicador, o nulo si no se está viendo. */
  function indicator(): HTMLElement | null {
    return host().querySelector<HTMLElement>('.fs-pull');
  }

  /**
   * Un toque de la pantalla. jsdom no trae `TouchEvent`, así que el dedo se finge sobre un
   * suceso normal: lo único que lee el componente es la vertical del primer contacto.
   */
  function touch(type: string, y: number): Event {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'touches', { value: [{ clientY: y }] });
    document.dispatchEvent(event);
    fixture.detectChanges();
    return event;
  }

  /** Arrastra desde arriba del todo hasta la distancia indicada, y suelta. */
  function pull(distance: number): void {
    touch('touchstart', 100);
    touch('touchmove', 100 + distance);
    touch('touchend', 100 + distance);
  }

  beforeEach(async () => {
    // Sin dedo no hay gesto, así que la prueba finge una pantalla táctil.
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query.includes('coarse'),
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          addListener: () => undefined,
          removeListener: () => undefined,
          onchange: null,
          dispatchEvent: () => false,
        }) as unknown as MediaQueryList,
    );
    editor.isOpen.set(false);

    await TestBed.configureTestingModule({
      imports: [PullRefreshComponent],
      providers: [{ provide: TransactionEditorService, useValue: editor }],
    }).compileComponents();

    refresh = TestBed.inject(RefreshService);
    busy = signal(false);
    reload = vi.fn<() => void>(() => busy.set(true));
    unregister = refresh.register(reload, busy);

    fixture = TestBed.createComponent(PullRefreshComponent);
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('recarga al arrastrar hacia abajo lo suficiente', () => {
    pull(200);

    expect(reload).toHaveBeenCalledOnce();
  });

  it('no recarga con un arrastre corto: es el roce de quien iba a desplazar', () => {
    pull(40);

    expect(reload).not.toHaveBeenCalled();
  });

  it('enseña el indicador mientras el dedo tira, y no antes', () => {
    expect(indicator()).toBeNull();

    touch('touchstart', 100);
    expect(indicator()).toBeNull();

    touch('touchmove', 260);

    expect(indicator()).not.toBeNull();
    // Pasado el punto de no retorno, el disco se tiñe para decir que soltar ya recarga.
    expect(host().querySelector('.fs-pull__disc.is-ready')).not.toBeNull();
  });

  it('deja el desplazamiento en paz cuando el dedo va hacia arriba', () => {
    touch('touchstart', 300);
    const event = touch('touchmove', 200);

    expect(event.defaultPrevented).toBe(false);
    expect(indicator()).toBeNull();

    touch('touchend', 200);
    expect(reload).not.toHaveBeenCalled();
  });

  it('frena el desplazamiento propio del navegador mientras el gesto es nuestro', () => {
    touch('touchstart', 100);
    const event = touch('touchmove', 200);

    // Sin esto, el gesto competiría con el rebote elástico de la página en vez de sustituirlo.
    expect(event.defaultPrevented).toBe(true);
  });

  it('no se mete en medio con la hoja de registro abierta', () => {
    // Dentro de una hoja, arrastrar hacia abajo es el gesto de cerrarla.
    editor.isOpen.set(true);

    pull(200);

    expect(reload).not.toHaveBeenCalled();
  });

  it('no hace nada cuando la pantalla puesta no sabe recargarse', () => {
    // La pantalla se va y no deja forma de recargarse: el gesto se queda sin nada que hacer,
    // así que ni siquiera se insinúa.
    unregister();

    pull(200);

    expect(reload).not.toHaveBeenCalled();
    expect(indicator()).toBeNull();
  });
});
