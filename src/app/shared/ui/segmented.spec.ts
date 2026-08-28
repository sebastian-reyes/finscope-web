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

@Component({
  imports: [SegmentedDirective],
  template: `
    <div class="fs-bar" fsSegmented=".fs-bar__icon">
      @for (option of options; track option) {
        <a class="fs-bar__tab" [class.is-active]="active() === option">
          <span class="fs-bar__icon">·</span>{{ option }}
        </a>
      }
    </div>
  `,
})
class InnerTargetHostComponent {
  readonly options = ['Inicio', 'Movimientos'];
  readonly active = signal('Inicio');
}

describe('SegmentedDirective con un objetivo dentro de la opción', () => {
  it('mide lo que se le indica y no la opción entera', async () => {
    await TestBed.configureTestingModule({
      imports: [InnerTargetHostComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(InnerTargetHostComponent);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const track = host.querySelector<HTMLElement>('.fs-bar')!;

    // La opción entera es alta —icono y rótulo— y el icono, solo un trozo de ella.
    const tab = host.querySelector<HTMLElement>('.fs-bar__tab')!;
    stubGeometry(tab, 120, 80);
    Object.defineProperty(tab, 'offsetHeight', { value: 48, configurable: true });
    Object.defineProperty(tab, 'offsetParent', { value: track, configurable: true });

    const icon = host.querySelector<HTMLElement>('.fs-bar__icon')!;
    stubGeometry(icon, 16, 44);
    Object.defineProperty(icon, 'offsetHeight', { value: 28, configurable: true });
    // La pestaña está posicionada para quedar por encima de la pastilla, así que es ella —y
    // no el control— contra la que el navegador mide el icono.
    Object.defineProperty(icon, 'offsetParent', { value: tab, configurable: true });

    fixture.componentInstance.active.set('Movimientos');
    fixture.detectChanges();
    fixture.componentInstance.active.set('Inicio');
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));

    expect(track.style.getPropertyValue('--fs-seg-w')).toBe('44px');
    expect(track.style.getPropertyValue('--fs-seg-h')).toBe('28px');
    // El camino entero: sin sumar el de la pestaña, la pastilla se quedaba clavada en la
    // primera opción y a la altura equivocada.
    expect(track.style.getPropertyValue('--fs-seg-x')).toBe('136px');
    expect(track.style.getPropertyValue('--fs-seg-y')).toBe('8px');
  });
});

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

  it('publica también la vertical, para quien no pueda centrar la pastilla desde el CSS', () => {
    // La barra inferior del móvil la necesita: allí la pastilla rodea el icono y el rótulo
    // queda fuera, así que no ocupa todo el alto del control.
    expect(track().style.getPropertyValue('--fs-seg-y')).toBe('4px');
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
