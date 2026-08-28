import { Directive, ElementRef, inject, input } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationStart, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

/** Clases que ponen en marcha la entrada. Las quita el propio final de la animación. */
const FORWARD = 'fs-view-in';
const BACK = 'fs-view-in--back';

/**
 * Entrada deslizada de la pantalla que se acaba de abrir.
 *
 * Cambiar de sección era un corte seco: una pantalla desaparecía y la siguiente ya estaba
 * puesta, sin nada que dijera de dónde venía. Aquí entra desplazándose un poco, y hacia el
 * lado que le toca: si se va del inicio a los movimientos, la nueva entra por la derecha,
 * como si se arrastrara; si se vuelve, por la izquierda. El sentido sale del mismo orden en
 * el que están los destinos en la barra, que es el que la persona ya tiene en la cabeza.
 *
 * La clase se le pone al elemento del componente recién activado, que el router inserta
 * justo después de la etiqueta del outlet. Al ser un elemento nuevo en cada navegación, la
 * animación arranca sola: no hay que quitar y volver a poner la clase forzando un reflujo,
 * que es el apaño habitual para reiniciar una animación sobre el mismo elemento.
 *
 * El sentido se calcula al empezar la navegación y no al terminarla, porque es entonces
 * cuando `router.url` todavía dice de dónde se viene.
 */
@Directive({
  selector: 'router-outlet[fsSlide]',
})
export class SlideOutletDirective {
  /**
   * Destinos en el orden en que se leen, por el principio de su dirección.
   * Lo que no esté en la lista entra sin sentido: solo se desvanece.
   */
  readonly fsSlide = input<readonly string[]>([]);

  private readonly outlet = inject(RouterOutlet);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly router = inject(Router);

  /** Si la próxima pantalla viene de la izquierda, es decir, si se está volviendo. */
  private back = false;

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationStart => event instanceof NavigationStart),
        takeUntilDestroyed(),
      )
      .subscribe((event) => {
        const from = this.indexOf(this.router.url);
        const to = this.indexOf(event.url);
        this.back = from >= 0 && to >= 0 && to < from;
      });

    this.outlet.activateEvents.pipe(takeUntilDestroyed()).subscribe(() => this.play());
  }

  /** Pone en marcha la entrada sobre el elemento del componente recién activado. */
  private play(): void {
    const view = this.host.nativeElement.nextElementSibling;
    if (!(view instanceof HTMLElement)) {
      return;
    }
    const entrance = this.back ? BACK : FORWARD;
    view.classList.add(entrance);
    // Quitarla al terminar deja el elemento limpio: mientras la clase está puesta hay un
    // `transform` vivo, y un `transform` convierte a sus descendientes fijos en absolutos.
    view.addEventListener('animationend', () => view.classList.remove(entrance), { once: true });
  }

  /**
   * Posición de una dirección dentro del orden de la barra.
   *
   * @param url dirección completa, con sus parámetros si los lleva
   * @return la posición, o -1 si no es uno de los destinos ordenados
   */
  private indexOf(url: string): number {
    const path = url.split('?')[0];
    return this.fsSlide().findIndex((destination) => path === destination);
  }
}
