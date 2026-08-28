import { AfterViewInit, Directive, ElementRef, OnDestroy, inject, input } from '@angular/core';

/**
 * Pastilla que se desliza por un control segmentado.
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
 * La clase activa la pone quien use el control —un `class.is-active`, un `routerLinkActive`
 * o lo que sea—, así que la posición se sigue con un observador del DOM en vez de con una
 * entrada: la directiva no necesita saber quién manda.
 *
 * Solo publica medidas; dibujar la pastilla es cosa de quien la use. Por eso vale igual para
 * el control segmentado, donde ocupa la opción entera, que para la barra inferior del móvil,
 * donde solo tiñe el icono y deja el rótulo fuera.
 */
@Directive({
  selector: '.fs-seg, [fsSegmented]',
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
    if (!target) {
      track.style.setProperty('--fs-seg-w', '0px');
      return;
    }

    // Las medidas se toman desde el borde interior del control, que es exactamente el origen
    // del `left: 0` de la pastilla: descontarle además el grosor del borde la dejaba corrida
    // un píxel. La vertical se publica igual, para quien no pueda centrarla desde la hoja de
    // estilos porque la pastilla no ocupa todo el alto del control.
    const { x, y } = this.offsetWithin(target, track);
    track.style.setProperty('--fs-seg-x', `${x}px`);
    track.style.setProperty('--fs-seg-y', `${y}px`);
    track.style.setProperty('--fs-seg-w', `${target.offsetWidth}px`);
    track.style.setProperty('--fs-seg-h', `${target.offsetHeight}px`);

    // La primera colocación no se anima: la pastilla debe salir ya puesta bajo la opción
    // activa, no deslizarse desde la esquina cada vez que se abre la pantalla.
    if (!track.classList.contains('is-ready')) {
      requestAnimationFrame(() => track.classList.add('is-ready'));
    }
  }

  /**
   * Distancia de un elemento al control, subiendo por la cadena de padres posicionados.
   *
   * `offsetLeft` se mide contra el primer ancestro posicionado, que no tiene por qué ser el
   * control: en la barra inferior cada pestaña está posicionada para quedar por encima de la
   * pastilla, así que el icono se medía contra su pestaña y daba lo mismo en todas —la
   * pastilla se quedaba clavada en la primera y a la altura equivocada—. Sumando el camino
   * entero da igual cuántos padres posicionados haya de por medio.
   *
   * @param target elemento que se está midiendo
   * @param track  control desde el que se mide
   * @return la distancia horizontal y vertical
   */
  private offsetWithin(target: HTMLElement, track: HTMLElement): { x: number; y: number } {
    let x = 0;
    let y = 0;
    let node: HTMLElement | null = target;
    while (node && node !== track) {
      x += node.offsetLeft;
      y += node.offsetTop;
      node = node.offsetParent as HTMLElement | null;
    }
    return { x, y };
  }
}
