import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ONBOARDING_SLIDES, OnboardingComponent, OnboardingExit } from './onboarding';

describe('OnboardingComponent', () => {
  let fixture: ComponentFixture<OnboardingComponent>;
  let exits: OnboardingExit[];

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function title(): string {
    return host().querySelector('.fs-tour__title')!.textContent!.trim();
  }

  function eyebrow(): string {
    return host().querySelector('.fs-tour__eyebrow')!.textContent!.trim();
  }

  /** El botón cuyo texto empieza por lo indicado, o nada si no está. */
  function button(text: string): HTMLButtonElement | undefined {
    return Array.from(host().querySelectorAll<HTMLButtonElement>('button')).find((candidate) =>
      candidate.textContent!.trim().startsWith(text),
    );
  }

  function press(key: string): void {
    host().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    fixture.detectChanges();
  }

  /** Simula un dedo que se apoya en un punto y se levanta en otro. */
  function swipe(fromX: number, toX: number, dy = 0): void {
    const dialog = host().querySelector('.fs-tour')!;
    const init = { pointerId: 1, pointerType: 'touch', bubbles: true };
    dialog.dispatchEvent(pointer('pointerdown', { ...init, clientX: fromX, clientY: 100 }));
    dialog.dispatchEvent(pointer('pointerup', { ...init, clientX: toX, clientY: 100 + dy }));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [OnboardingComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(OnboardingComponent);
    fixture.componentRef.setInput('name', 'Sebastián Reyes');
    exits = [];
    fixture.componentInstance.closed.subscribe((exit) => exits.push(exit));
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
  });

  it('saluda por el nombre de pila y es un diálogo modal', () => {
    const dialog = host().querySelector('.fs-tour')!;

    expect(eyebrow()).toBe('Hola, Sebastián');
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('saluda sin nombre cuando la cuenta no tiene', () => {
    fixture.componentRef.setInput('name', null);
    fixture.detectChanges();

    expect(eyebrow()).toBe('Hola');
  });

  it('avanza y retrocede con sus botones', () => {
    expect(button('Atrás')).toBeUndefined();

    button('Empezar')!.click();
    fixture.detectChanges();
    expect(title()).toBe(ONBOARDING_SLIDES[1].title);

    button('Atrás')!.click();
    fixture.detectChanges();
    expect(title()).toBe(ONBOARDING_SLIDES[0].title);
  });

  it('se puede omitir desde cualquier paso, también con Escape', () => {
    button('Omitir')!.click();
    press('Escape');

    expect(exits).toEqual(['skip', 'skip']);
  });

  it('se recorre con las flechas del teclado', () => {
    press('ArrowRight');
    press('ArrowRight');
    expect(title()).toBe(ONBOARDING_SLIDES[2].title);

    press('ArrowLeft');
    expect(title()).toBe(ONBOARDING_SLIDES[1].title);
  });

  it('se recorre deslizando el dedo, pero no con un toque ni en vertical', () => {
    swipe(300, 120);
    expect(title()).toBe(ONBOARDING_SLIDES[1].title);

    swipe(120, 300);
    expect(title()).toBe(ONBOARDING_SLIDES[0].title);

    swipe(200, 190);
    swipe(200, 140, 200);
    expect(title()).toBe(ONBOARDING_SLIDES[0].title);
  });

  it('salta a un paso con sus puntos, que dicen cuál es el actual', () => {
    const dots = host().querySelectorAll<HTMLButtonElement>('.fs-tour__dot');
    expect(dots.length).toBe(ONBOARDING_SLIDES.length);

    dots[3].click();
    fixture.detectChanges();

    expect(title()).toBe(ONBOARDING_SLIDES[3].title);
    expect(dots[3].getAttribute('aria-current')).toBe('step');
    expect(dots[0].hasAttribute('aria-current')).toBe(false);
  });

  it('el último paso ofrece registrar o terminar, y ya no omitir', () => {
    const dots = host().querySelectorAll<HTMLButtonElement>('.fs-tour__dot');
    dots[dots.length - 1].click();
    fixture.detectChanges();

    expect(button('Omitir')).toBeUndefined();
    // La flecha no se sale del recorrido: terminar es una decisión, no una tecla de más.
    press('ArrowRight');
    expect(exits).toEqual([]);

    button('Registrar mi primer movimiento')!.click();
    button('Explorar por mi cuenta')!.click();
    expect(exits).toEqual(['record', 'done']);
  });

  it('bloquea el desplazamiento de la página mientras está abierto', () => {
    expect(document.body.style.overflow).toBe('hidden');

    fixture.destroy();

    expect(document.body.style.overflow).toBe('');
  });
});

/**
 * Un evento de puntero con coordenadas. jsdom no trae `PointerEvent`, así que se monta sobre
 * uno de ratón, que tiene las coordenadas, y se le añaden el identificador y el tipo.
 */
function pointer(
  type: string,
  init: { pointerId: number; pointerType: string; clientX: number; clientY: number },
): Event {
  const event = new MouseEvent(type, {
    bubbles: true,
    clientX: init.clientX,
    clientY: init.clientY,
  });
  Object.defineProperties(event, {
    pointerId: { value: init.pointerId },
    pointerType: { value: init.pointerType },
  });
  return event;
}
