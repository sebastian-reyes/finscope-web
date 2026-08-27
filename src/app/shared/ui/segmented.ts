import { AfterViewInit, Directive, ElementRef, OnDestroy, inject } from '@angular/core';

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
 */
@Directive({
  selector: '.fs-seg',
})
export class SegmentedDirective implements AfterViewInit, OnDestroy {
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
    if (!active) {
      track.style.setProperty('--fs-seg-w', '0px');
      return;
    }

    // `offsetLeft` ya se mide desde el borde interior del control, que es exactamente el
    // origen del `left: 0` de la pastilla: restarle además el grosor del borde la dejaba
    // corrida un píxel. La vertical no se mide, la centra la hoja de estilos.
    track.style.setProperty('--fs-seg-x', `${active.offsetLeft}px`);
    track.style.setProperty('--fs-seg-w', `${active.offsetWidth}px`);
    track.style.setProperty('--fs-seg-h', `${active.offsetHeight}px`);

    // La primera colocación no se anima: la pastilla debe salir ya puesta bajo la opción
    // activa, no deslizarse desde la esquina cada vez que se abre la pantalla.
    if (!track.classList.contains('is-ready')) {
      requestAnimationFrame(() => track.classList.add('is-ready'));
    }
  }
}
