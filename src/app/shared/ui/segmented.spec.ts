import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

/** Lo que mide un elemento, en las unidades en las que se escribe la hoja de estilos. */
interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
  /** Grosor del borde, que separa el rectángulo de pantalla del origen de la pastilla. */
  border?: number;
}

/** El alto que se da por defecto a una opción, para no repetirlo en cada llamada. */
const OPTION_HEIGHT = 32;

/**
 * Geometría de mentira, porque jsdom no hace diseño y todas las medidas son cero.
 *
 * Se simulan las dos fuentes que usa la directiva, y no una sola, porque la distinción entre
 * ellas es justo lo que hace que la pastilla caiga donde debe: `getBoundingClientRect` da lo
 * que se ve en pantalla —con la escala que herede de un padre— y `getComputedStyle` da lo
 * que mide en la maquetación, sin escalar y con decimales.
 */
class Layout {
  private readonly boxes = new Map<HTMLElement, Box>();

  /** Cuánto encoge lo dibujado respecto a la maquetación, como la hoja al entrar. */
  constructor(private readonly scale = 1) {
    // Se delega en el de verdad para todo lo que no sean las cuatro propiedades simuladas:
    // Angular consulta estilos por su cuenta, y devolverle un objeto pelado lo tumbaba.
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation(((
      element: Element,
      pseudo?: string | null,
    ) => {
      const declaration = real(element, pseudo);
      const box = this.boxes.get(element as HTMLElement);
      if (!box) {
        return declaration;
      }
      const faked: Record<string, string> = {
        width: `${box.width}px`,
        height: `${box.height}px`,
        borderLeftWidth: `${box.border ?? 0}px`,
        borderTopWidth: `${box.border ?? 0}px`,
      };
      return new Proxy(declaration, {
        get: (target, property) => {
          if (typeof property === 'string' && property in faked) {
            return faked[property];
          }
          const value = Reflect.get(target, property);
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    }) as typeof window.getComputedStyle);
  }

  /**
   * Da medidas a un elemento.
   *
   * @param element elemento al que dárselas
   * @param box     lo que mide en unidades de maquetación
   */
  set(element: HTMLElement, box: Box): void {
    this.boxes.set(element, box);
    element.getBoundingClientRect = () =>
      ({
        left: box.left * this.scale,
        top: box.top * this.scale,
        width: box.width * this.scale,
        height: box.height * this.scale,
      }) as DOMRect;
  }
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SegmentedDirective con un objetivo dentro de la opción', () => {
  it('mide lo que se le indica y no la opción entera', async () => {
    await TestBed.configureTestingModule({
      imports: [InnerTargetHostComponent],
    }).compileComponents();
    const fixture = TestBed.createComponent(InnerTargetHostComponent);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const track = host.querySelector<HTMLElement>('.fs-bar')!;
    const layout = new Layout();
    layout.set(track, { left: 0, top: 0, width: 300, height: 56 });

    // La opción entera es alta —icono y rótulo— y el icono, solo un trozo de ella.
    layout.set(host.querySelector<HTMLElement>('.fs-bar__tab')!, {
      left: 120,
      top: 4,
      width: 80,
      height: 48,
    });
    layout.set(host.querySelector<HTMLElement>('.fs-bar__icon')!, {
      left: 136,
      top: 8,
      width: 44,
      height: 28,
    });

    fixture.componentInstance.active.set('Movimientos');
    fixture.detectChanges();
    fixture.componentInstance.active.set('Inicio');
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));

    expect(track.style.getPropertyValue('--fs-seg-w')).toBe('44px');
    expect(track.style.getPropertyValue('--fs-seg-h')).toBe('28px');
    // El icono se mide contra el control aunque su pestaña esté posicionada de por medio:
    // restar rectángulos no se entera de cuántos padres posicionados haya.
    expect(track.style.getPropertyValue('--fs-seg-x')).toBe('136px');
    expect(track.style.getPropertyValue('--fs-seg-y')).toBe('8px');
  });
});

describe('SegmentedDirective', () => {
  let fixture: ComponentFixture<HostComponent>;
  let layout: Layout;

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

  /**
   * Monta el control con unas medidas dadas.
   *
   * @param scale  cuánto encoge lo dibujado, para el caso de la hoja que entra
   * @param widths ancho de cada una de las tres opciones
   * @param first  medidas de la primera opción, cuando la prueba necesita unas concretas
   */
  async function build(
    scale = 1,
    widths: [number, number, number] = [60, 110, 55],
    first?: Box,
  ): Promise<void> {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    layout = new Layout(scale);
    // El control lleva un borde de 1 px, que separa su rectángulo del origen del `left: 0`
    // de la pastilla.
    layout.set(track(), { left: 0, top: 0, width: 240, height: 42, border: 1 });

    // Cada opción empieza donde acaba la anterior, ya contando el borde.
    let left = 1;
    buttons().forEach((button, index) => {
      layout.set(button, {
        left: left + (index === 0 ? 4 : 0),
        top: 5,
        width: widths[index],
        height: OPTION_HEIGHT,
      });
      left += widths[index] + 4;
    });
    if (first) {
      layout.set(buttons()[0], first);
    }
    // Las dos de después se colocan en los sitios que esperan las pruebas.
    layout.set(buttons()[1], { left: 69, top: 5, width: widths[1], height: OPTION_HEIGHT });
    layout.set(buttons()[2], { left: 183, top: 5, width: widths[2], height: OPTION_HEIGHT });

    // Una medida más, ya con la geometría puesta. Hay que pasar por otra opción: volver a
    // poner la que ya estaba no cambia ninguna clase, y sin mutación el observador del DOM
    // no avisa, así que la única medida seguiría siendo la de antes de tener geometría.
    fixture.componentInstance.active.set('Todo');
    fixture.detectChanges();
    fixture.componentInstance.active.set('Mes');
    fixture.detectChanges();
    await settle();
  }

  it('coloca la pastilla sobre la opción activa', async () => {
    await build();

    expect(track().style.getPropertyValue('--fs-seg-x')).toBe('4px');
    expect(track().style.getPropertyValue('--fs-seg-w')).toBe('60px');
    expect(track().style.getPropertyValue('--fs-seg-h')).toBe('32px');
  });

  it('descuenta el borde del control, que separa su rectángulo del origen de la pastilla', async () => {
    await build();

    // Sin descontarlo, la pastilla quedaba corrida un píxel hacia abajo y hacia la derecha:
    // el `left: 0` de un hijo absoluto empieza por dentro del borde, no en él.
    expect(track().style.getPropertyValue('--fs-seg-x')).toBe('4px');
  });

  it('publica también la vertical, para quien no pueda centrar la pastilla desde el CSS', async () => {
    await build();

    // La barra inferior del móvil la necesita: allí la pastilla rodea el icono y el rótulo
    // queda fuera, así que no ocupa todo el alto del control.
    expect(track().style.getPropertyValue('--fs-seg-y')).toBe('4px');
  });

  it('la mueve y la estira al cambiar de opción', async () => {
    await build();

    fixture.componentInstance.active.set('Entre fechas');
    fixture.detectChanges();
    await settle();

    // La opción del medio es más ancha: la pastilla no solo se desplaza, también crece.
    expect(track().style.getPropertyValue('--fs-seg-x')).toBe('68px');
    expect(track().style.getPropertyValue('--fs-seg-w')).toBe('110px');
  });

  it('enciende la transición solo después de la primera medida', async () => {
    await build();

    // Si estuviera encendida desde el principio, la pastilla entraría deslizándose desde la
    // esquina cada vez que se abre la pantalla.
    expect(track().classList.contains('is-ready')).toBe(true);
  });

  it('esconde la pastilla si no hay ninguna opción activa', async () => {
    await build();

    fixture.componentInstance.active.set('ninguna');
    fixture.detectChanges();
    await settle();

    expect(track().style.getPropertyValue('--fs-seg-w')).toBe('0px');
  });

  it('no redondea la medida: en un control pequeño, medio píxel se ve', async () => {
    // El caso real es el selector de moneda: la opción mide 33,594 px y empieza en 2,391,
    // pero `offsetWidth` y `offsetLeft` devuelven enteros —34 y 2—, así que la pastilla se
    // dibujaba 0,4 px a la izquierda y 0,4 px más ancha. Con un relleno de carril de 2,4 px,
    // eso la deja pegada al filo de un lado y con papel de sobra en el otro.
    await build(1, [33.594, 40, 40], { left: 3.391, top: 5, width: 33.594, height: 26.875 });

    expect(track().style.getPropertyValue('--fs-seg-x')).toBe('2.391px');
    expect(track().style.getPropertyValue('--fs-seg-w')).toBe('33.594px');
    expect(track().style.getPropertyValue('--fs-seg-h')).toBe('26.875px');
  });

  it('deshace la escala del padre: la hoja de registro entra desde scale(0.98)', async () => {
    // La directiva mide por primera vez mientras esa animación corre. Lo que se ve en
    // pantalla vale entonces un 2 % menos que las unidades en las que se escribe la
    // pastilla, y ahí se quedaría: encoger no cambia el tamaño de maquetación, así que el
    // observador de tamaño no vuelve a avisar cuando la animación termina.
    await build(0.98);

    expect(track().style.getPropertyValue('--fs-seg-x')).toBe('4px');
    expect(track().style.getPropertyValue('--fs-seg-w')).toBe('60px');
    expect(track().style.getPropertyValue('--fs-seg-h')).toBe('32px');
  });
});
