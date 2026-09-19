import { AfterViewInit, Directive, ElementRef, OnDestroy, inject, input } from '@angular/core';

/**
 * Pastilla que se desliza por un control segmentado.
 *
 * La usan los tres controles de este tipo que hay: los filtros, el selector de moneda y la
 * barra inferior del móvil. Son la misma idea —opciones pocas y excluyentes, todas a la
 * vista— y por tanto el mismo gesto.
 *
 * Sin esto, el fondo salta de una opción a otra y la vista pierde de dónde venía. La
 * pastilla se mueve, y ese movimiento es lo que cuenta que las opciones son las caras de la
 * misma decisión y no botones sueltos.
 *
 * Se mide en lugar de calcularse: las opciones no son igual de anchas —«Todos» y «Entre
 * fechas» no ocupan lo mismo— y repartirlas a partes iguales para poder posicionar la
 * pastilla con un porcentaje habría estirado el control hasta el ancho de su etiqueta más
 * larga. Aquí se leen la posición y el ancho de la opción activa y se publican como
 * variables CSS; de animarlas se encarga la hoja de estilos.
 *
 * Se mide con decimales, que en un control pequeño no es una sutileza: ver `measure`.
 *
 * La clase activa la pone quien use el control —un `class.is-active`, un `routerLinkActive`
 * o lo que sea—, así que la posición se sigue con un observador del DOM en vez de con una
 * entrada: la directiva no necesita saber quién manda.
 *
 * Solo publica medidas; dibujar la pastilla es cosa de quien la use. Por eso vale igual para
 * el control segmentado, donde ocupa la opción entera, que para la barra inferior del móvil,
 * donde solo tiñe el icono y deja el rótulo fuera.
 */
@Directive({
  selector: '.fs-seg, .fs-money-switch, [fsSegmented]',
})
export class SegmentedDirective implements AfterViewInit, OnDestroy {
  /**
   * Qué se mide dentro de la opción activa, cuando no es ella entera.
   * En la barra inferior es el icono: la pastilla lo rodea a él y no al rótulo que lleva
   * debajo, que la haría el doble de alta.
   */
  readonly fsSegmented = input('');

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  private classes?: MutationObserver;
  private size?: ResizeObserver;

  ngAfterViewInit(): void {
    this.sync();

    // Cambia la opción activa, o aparecen y desaparecen opciones: en ambos casos hay que
    // volver a medir.
    this.classes = new MutationObserver(() => this.sync());
    this.classes.observe(this.host.nativeElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class'],
    });

    // El control cambia de ancho al girar el móvil o al cargarse la tipografía.
    if (typeof ResizeObserver !== 'undefined') {
      this.size = new ResizeObserver(() => this.sync());
      this.size.observe(this.host.nativeElement);
    }
  }

  ngOnDestroy(): void {
    this.classes?.disconnect();
    this.size?.disconnect();
  }

  /** Publica dónde está y cuánto mide la opción activa. */
  private sync(): void {
    const track = this.host.nativeElement;
    const active = track.querySelector<HTMLElement>('.is-active');
    const inner = this.fsSegmented();
    const target = (inner && active?.querySelector<HTMLElement>(inner)) || active;
    const box = target && this.measure(target, track);
    if (!box) {
      track.style.setProperty('--fs-seg-w', '0px');
      return;
    }

    track.style.setProperty('--fs-seg-x', px(box.x));
    track.style.setProperty('--fs-seg-y', px(box.y));
    track.style.setProperty('--fs-seg-w', px(box.width));
    track.style.setProperty('--fs-seg-h', px(box.height));

    // La primera colocación no se anima: la pastilla debe salir ya puesta bajo la opción
    // activa, no deslizarse desde la esquina cada vez que se abre la pantalla.
    if (!track.classList.contains('is-ready')) {
      requestAnimationFrame(() => track.classList.add('is-ready'));
    }
  }

  /**
   * Dónde cae la opción activa dentro del control, y cuánto mide.
   *
   * **Con decimales, y esa es la razón de que esto no use `offsetLeft` ni `offsetWidth`.**
   * Esas cuatro propiedades devuelven enteros redondeados: en el selector de moneda la opción
   * mide 33,594 px y empieza en 2,391, pero salían 34 y 2, así que la pastilla se dibujaba
   * 0,4 px a la izquierda y 0,4 px más ancha de lo que debía. En los filtros no se notaba
   * —son pastillas grandes—, pero en el selector de moneda el relleno del carril es de 2,4 px
   * y perder 0,4 en un lado se ve: la pastilla queda pegada al filo izquierdo y con papel
   * sobrante en el derecho.
   *
   * Las medidas se toman desde el borde interior del control, que es el origen del `left: 0`
   * de la pastilla; de ahí que al restar los rectángulos haya que descontar además el grosor
   * del borde, que los separa. La vertical se publica igual, para quien no pueda centrarla
   * desde la hoja de estilos porque la pastilla no ocupa todo el alto del control.
   *
   * @param target elemento que se está midiendo
   * @param track  control desde el que se mide
   * @return su hueco en las unidades de la hoja de estilos, o nulo si no hay nada que medir
   */
  private measure(
    target: HTMLElement,
    track: HTMLElement,
  ): { x: number; y: number; width: number; height: number } | null {
    const trackStyles = getComputedStyle(track);
    const trackRect = track.getBoundingClientRect();
    // `getComputedStyle` da el ancho usado con decimales y **sin** que le afecte ninguna
    // escala heredada; el rectángulo sí la lleva. Su cociente es, por tanto, la escala exacta
    // a la que se está dibujando el control.
    const layoutWidth = parseFloat(trackStyles.width);
    if (!layoutWidth || !trackRect.width) {
      return null;
    }

    // La hoja de registro entra desde `scale(0.98)`, y la directiva mide por primera vez
    // mientras esa animación corre. Sin deshacer la escala, lo medido valdría un 2 % menos
    // que las unidades en las que se escribe la pastilla, y ahí se quedaría: encoger la hoja
    // no cambia su tamaño de maquetación, así que el observador de tamaño no vuelve a avisar.
    const scale = trackRect.width / layoutWidth;
    const targetStyles = getComputedStyle(target);
    const targetRect = target.getBoundingClientRect();
    const width = parseFloat(targetStyles.width);
    const height = parseFloat(targetStyles.height);
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      return null;
    }

    return {
      x: (targetRect.left - trackRect.left) / scale - parseFloat(trackStyles.borderLeftWidth),
      y: (targetRect.top - trackRect.top) / scale - parseFloat(trackStyles.borderTopWidth),
      width,
      height,
    };
  }
}

/**
 * Escribe una medida en píxeles con tres decimales.
 *
 * Los decimales importan —redondear a entero es justo el fallo que esto vino a arreglar—,
 * pero no todos: la milésima de píxel está mucho más allá de lo que dibuja ninguna pantalla,
 * y sin cortar, deshacer la escala de la hoja dejaba cosas como `4.000000000000001px`
 * escritas en el atributo `style`.
 *
 * @param value medida en píxeles
 * @return la medida lista para una propiedad personalizada
 */
function px(value: number): string {
  return `${Math.round(value * 1000) / 1000}px`;
}
