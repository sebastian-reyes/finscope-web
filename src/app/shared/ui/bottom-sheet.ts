import { ChangeDetectionStrategy, Component, DOCUMENT, inject, input, output } from '@angular/core';

let nextId = 0;

/**
 * Hoja que sube desde abajo, con su velo, su asa, su título y un pie que no se desplaza. En
 * tablet y escritorio se centra como un diálogo.
 *
 * Es la forma de la hoja de registrar, sacada para que otra pantalla pueda abrir la suya sin
 * copiar el velo, las curvas y la zona segura. Lo de dentro lo pone quien la usa: el cuerpo
 * por proyección y el pie con el atributo `sheetFoot`.
 *
 * Quien la monta le pone `animate.enter="is-opening"` y `animate.leave="is-closing"` en la
 * etiqueta: Angular mira si el elemento al que pone la clase tiene una animación viva, así
 * que la que manda cuelga del propio componente y dura más que la de la hoja, o la entrada se
 * cortaría a los 16 ms.
 */
@Component({
  selector: 'fs-bottom-sheet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(click)': 'onVeilClick($event)',
    '(document:keydown.escape)': 'closed.emit()',
  },
  template: `
    <section class="fs-bsheet" role="dialog" aria-modal="true" [attr.aria-labelledby]="titleId">
      <span class="fs-bsheet__grip" aria-hidden="true"></span>
      <header class="fs-bsheet__head">
        <h2 class="fs-bsheet__title" [id]="titleId">{{ title() }}</h2>
        <button
          type="button"
          class="fs-bsheet__close"
          [attr.aria-label]="'Cerrar ' + title().toLowerCase()"
          (click)="closed.emit()"
        >
          <i class="bi bi-x-lg" aria-hidden="true"></i>
        </button>
      </header>
      <div class="fs-bsheet__body">
        <ng-content />
      </div>
      <footer class="fs-bsheet__foot">
        <ng-content select="[sheetFoot]" />
      </footer>
    </section>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      /* Por encima de la barra inferior y por debajo de los avisos y los calendarios. */
      z-index: 1050;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      background-color: rgba(9, 13, 20, 0.5);
      backdrop-filter: blur(2px);
    }

    :host(.is-opening) {
      animation: fs-bsheet-veil 0.38s ease both;
    }

    :host(.is-closing) {
      animation: fs-bsheet-veil 0.24s ease reverse both;
    }

    .fs-bsheet {
      display: flex;
      flex-direction: column;
      width: 100%;
      /* Descuenta la zona segura de arriba: instalada, una hoja alta se metería bajo la isla. */
      max-height: calc(88vh - var(--fs-safe-top));
      overflow: hidden;
      background-color: var(--fs-surface);
      border-top-left-radius: var(--fs-radius-lg);
      border-top-right-radius: var(--fs-radius-lg);
      box-shadow: var(--fs-shadow-raised);
    }

    :host(.is-opening) .fs-bsheet {
      animation: fs-bsheet-rise 0.36s cubic-bezier(0.22, 1, 0.36, 1) both;
    }

    :host(.is-closing) .fs-bsheet {
      animation: fs-bsheet-rise 0.22s cubic-bezier(0.5, 0, 0.75, 0) reverse both;
    }

    .fs-bsheet__grip {
      width: 2.5rem;
      height: 0.25rem;
      margin: 0.5rem auto 0;
      border-radius: 999px;
      background-color: var(--fs-line);
    }

    .fs-bsheet__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 1.25rem 0.25rem;
    }

    .fs-bsheet__title {
      margin: 0;
      font-size: 1.0625rem;
      font-weight: 600;
    }

    .fs-bsheet__close {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2.25rem;
      height: 2.25rem;
      border: none;
      border-radius: 50%;
      background: none;
      color: var(--fs-ink-muted);
    }

    .fs-bsheet__close:hover {
      background-color: var(--fs-hover);
    }

    .fs-bsheet__body {
      flex: 1 1 auto;
      min-height: 0;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      padding: 0.75rem 1.25rem 1.25rem;
      overflow-y: auto;
      overscroll-behavior: contain;
    }

    /* El pie se queda fijo mientras el cuerpo se desplaza y deja sitio a la barra de gestos. */
    .fs-bsheet__foot {
      display: flex;
      gap: 0.5rem;
      padding: 0.75rem 1.25rem calc(0.75rem + env(safe-area-inset-bottom, 0px));
      border-top: 1px solid var(--fs-line);
    }

    .fs-bsheet__foot:empty {
      display: none;
    }

    /* A partir de tablet se centra como un diálogo, igual que la hoja de registrar: una hoja
       a lo ancho de un monitor no tiene sentido, y sin borde de pantalla del que salir sube
       un palmo en lugar de su propio alto. */
    @media (min-width: 576px) {
      :host {
        align-items: center;
        padding: 1.5rem;
      }

      :host(.is-opening) {
        animation-duration: 0.3s;
      }

      :host(.is-closing) {
        animation-duration: 0.18s;
      }

      .fs-bsheet {
        max-width: 32rem;
        max-height: 88vh;
        border-radius: var(--fs-radius-lg);
      }

      :host(.is-opening) .fs-bsheet {
        animation: fs-bsheet-lift 0.28s cubic-bezier(0.22, 1, 0.36, 1) both;
      }

      :host(.is-closing) .fs-bsheet {
        animation: fs-bsheet-lift 0.16s cubic-bezier(0.5, 0, 0.75, 0) reverse both;
      }

      .fs-bsheet__grip {
        display: none;
      }

      .fs-bsheet__head {
        padding-top: 1.25rem;
      }
    }

    @keyframes fs-bsheet-lift {
      from {
        transform: translateY(1.75rem) scale(0.98);
        opacity: 0;
      }
    }

    @keyframes fs-bsheet-veil {
      from {
        opacity: 0;
      }
      55% {
        opacity: 1;
      }
    }

    @keyframes fs-bsheet-rise {
      from {
        transform: translateY(100%);
      }
    }
  `,
})
export class BottomSheetComponent {
  private readonly document = inject(DOCUMENT);

  readonly title = input.required<string>();

  /** Se pide cerrar: con la X, con Escape o tocando el velo. Cerrar es cosa de quien la abre. */
  readonly closed = output<void>();

  protected readonly titleId = `fsSheetTitle${nextId++}`;

  constructor() {
    // Mientras está abierta, la pantalla de detrás no se desplaza bajo el dedo.
    this.document.body.style.overflow = 'hidden';
  }

  ngOnDestroy(): void {
    this.document.body.style.overflow = '';
  }

  /**
   * Cierra al tocar el velo de alrededor, no al tocar dentro de la hoja.
   *
   * @param event el toque, que sube desde donde se haya dado
   */
  protected onVeilClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.closed.emit();
    }
  }
}
