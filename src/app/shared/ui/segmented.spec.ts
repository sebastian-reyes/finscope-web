import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { SegmentedDirective } from './segmented';

@Component({
  imports: [SegmentedDirective],
  template: `
    <div class="fs-seg">
      @for (option of options; track option) {
        <button class="fs-seg__btn" [class.is-active]="active() === option" type="button">
          {{ option }}
        </button>
      }
    </div>
  `,
})
class HostComponent {
  readonly options = ['Mes', 'Entre fechas', 'Todo'];
  readonly active = signal('Mes');
}

/**
 * jsdom no hace diseño, así que todas las medidas son cero. Se les pone valor a mano para
 * poder comprobar que la directiva publica la posición y el ancho de la opción activa.
 */
function stubGeometry(element: HTMLElement, left: number, width: number): void {
  Object.defineProperty(element, 'offsetLeft', { value: left, configurable: true });
  Object.defineProperty(element, 'offsetWidth', { value: width, configurable: true });
  Object.defineProperty(element, 'offsetTop', { value: 4, configurable: true });
  Object.defineProperty(element, 'offsetHeight', { value: 32, configurable: true });
}

describe('SegmentedDirective', () => {
  let fixture: ComponentFixture<HostComponent>;

  function track(): HTMLElement {
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.fs-seg')!;
  }

  function buttons(): HTMLButtonElement[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('.fs-seg__btn'),
    );
  }

  /** Deja correr el observador del DOM y el siguiente fotograma. */
  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve));
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    // El control tiene borde, y las medidas de las opciones ya vienen descontándolo.
    Object.defineProperty(track(), 'clientLeft', { value: 1, configurable: true });
    Object.defineProperty(track(), 'clientTop', { value: 1, configurable: true });

    const [first, second, third] = buttons();
    stubGeometry(first, 4, 60);
    stubGeometry(second, 68, 110);
    stubGeometry(third, 182, 55);
    // Una medida más, ya con la geometría puesta.
    fixture.componentInstance.active.set('Mes');
    fixture.detectChanges();
    await settle();
  });

  it('coloca la pastilla sobre la opción activa', () => {
    expect(track().style.getPropertyValue('--fs-seg-x')).toBe('4px');
    expect(track().style.getPropertyValue('--fs-seg-w')).toBe('60px');
    expect(track().style.getPropertyValue('--fs-seg-h')).toBe('32px');
  });

  it('no vuelve a descontar el borde del control, que ya viene descontado', () => {
    // Restarlo otra vez dejaba la pastilla corrida un píxel hacia arriba y hacia la
    // izquierda, que es como se notó: el sombreado no cuadraba con la opción.
    expect(track().style.getPropertyValue('--fs-seg-x')).toBe('4px');
  });

  it('no calcula la vertical: la centra la hoja de estilos', () => {
    expect(track().style.getPropertyValue('--fs-seg-y')).toBe('');
  });

  it('la mueve y la estira al cambiar de opción', async () => {
    fixture.componentInstance.active.set('Entre fechas');
    fixture.detectChanges();
    await settle();

    // La opción del medio es más ancha: la pastilla no solo se desplaza, también crece.
    expect(track().style.getPropertyValue('--fs-seg-x')).toBe('68px');
    expect(track().style.getPropertyValue('--fs-seg-w')).toBe('110px');
  });

  it('enciende la transición solo después de la primera medida', () => {
    // Si estuviera encendida desde el principio, la pastilla entraría deslizándose desde la
    // esquina cada vez que se abre la pantalla.
    expect(track().classList.contains('is-ready')).toBe(true);
  });

  it('esconde la pastilla si no hay ninguna opción activa', async () => {
    fixture.componentInstance.active.set('ninguna');
    fixture.detectChanges();
    await settle();

    expect(track().style.getPropertyValue('--fs-seg-w')).toBe('0px');
  });
});
