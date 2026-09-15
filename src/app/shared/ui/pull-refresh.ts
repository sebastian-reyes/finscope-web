import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { RefreshService } from '../../core/refresh.service';
import { TransactionEditorService } from '../../core/transaction-editor.service';

/** Lo que hay que arrastrar para que el gesto cuente, ya amortiguado. */
const THRESHOLD = 64;

/** Tope de lo que baja el indicador por mucho que se siga tirando. */
const MAX_PULL = 96;

/**
 * Cuánto del recorrido del dedo se convierte en recorrido del indicador. Menos de uno a
 * propósito: la goma que se nota al tirar es lo que distingue un gesto de un desplazamiento,
 * y además evita que un manotazo dispare la recarga sin querer.
 */
const RESISTANCE = 0.45;

/** Dónde se queda el indicador mientras recarga. */
const RESTING = 16;

/** Lo que el indicador sube por encima de su sitio para esperar escondido. */
const HIDDEN = 48;

/**
 * Arrastrar hacia abajo para recargar.
 *
 * Instalada, la aplicación no tiene barra de navegador, así que tampoco tiene el botón de
 * recargar ni el gesto que Chrome pone en una pestaña: la única forma de volver a pedir los
 * datos era cambiar de pantalla y volver. Este es el gesto que cualquiera espera de una
 * aplicación de móvil, y hace justo eso —vuelve a pedir lo que la pantalla enseña— sin
 * recargar la página entera, que en una PWA significaría arrancar de cero.
 *
 * Vive en la carcasa y no en cada pantalla porque el dedo no toca una pantalla concreta,
 * toca la ventana; qué recargar lo pone cada pantalla en `RefreshService`.
 *
 * Solo existe donde tiene sentido: con dedo (`pointer: coarse`), con la ventana arriba del
 * todo, con una pantalla que sepa recargarse y con la hoja de registro cerrada —dentro de
 * una hoja, arrastrar hacia abajo es el gesto de cerrarla, no el de recargar—.
 */
@Component({
  selector: 'fs-pull-refresh',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <div
        class="fs-pull"
        [style.transform]="'translateY(' + offset() + 'px)'"
        [style.opacity]="opacity()"
        [class.is-settling]="settling()"
      >
        <span class="fs-pull__disc" [class.is-ready]="ready()" [class.is-running]="running()">
          <i
            class="bi bi-arrow-clockwise"
            [style.transform]="running() ? null : 'rotate(' + angle() + 'deg)'"
            aria-hidden="true"
          ></i>
        </span>
      </div>
    }
    <span class="visually-hidden" role="status" aria-live="polite">
      {{ running() ? 'Actualizando' : '' }}
    </span>
  `,
  styles: `
    :host {
      position: fixed;
      top: var(--fs-topbar-total);
      left: 0;
      right: 0;
      /* Por debajo de la barra superior, que es de donde asoma, y por encima del contenido. */
      z-index: 1010;
      display: flex;
      justify-content: center;
      pointer-events: none;
    }

    .fs-pull {
      display: flex;
      justify-content: center;
    }

    /* Al soltar, el indicador vuelve a su sitio solo; mientras el dedo manda, sigue al dedo
       sin transición o iría siempre un paso por detrás. */
    .fs-pull.is-settling {
      transition:
        transform 0.24s cubic-bezier(0.22, 1, 0.36, 1),
        opacity 0.24s ease;
    }

    .fs-pull__disc {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2.25rem;
      height: 2.25rem;
      border: 1px solid var(--fs-line);
      border-radius: 50%;
      background-color: var(--fs-surface);
      box-shadow: var(--fs-shadow-raised);
      color: var(--fs-ink-muted);
      font-size: 1rem;
      transition:
        color 0.15s ease,
        border-color 0.15s ease;
    }

    /* Pasado el punto de no retorno, el indicador se tiñe: es lo que dice que soltar ya
       recarga, sin ninguna palabra. */
    .fs-pull__disc.is-ready,
    .fs-pull__disc.is-running {
      border-color: var(--fs-brand);
      color: var(--fs-brand);
    }

    .fs-pull__disc i {
      transition: transform 0.1s linear;
    }

    .fs-pull__disc.is-running i {
      animation: fs-pull-spin 0.9s linear infinite;
    }

    @keyframes fs-pull-spin {
      to {
        transform: rotate(360deg);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .fs-pull__disc i {
        transition: none;
      }
    }
  `,
})
export class PullRefreshComponent {
  private readonly refresh = inject(RefreshService);
  private readonly editor = inject(TransactionEditorService);
  private readonly destroyRef = inject(DestroyRef);

  /** Lo que ha bajado el indicador, ya amortiguado. */
  private readonly distance = signal(0);

  /** Si el indicador está volviendo a su sitio solo, que es lo único que se anima. */
  protected readonly settling = signal(false);

  protected readonly running = this.refresh.running;

  protected readonly visible = computed(
    () => this.distance() > 0 || this.running() || this.settling(),
  );

  protected readonly ready = computed(() => this.distance() >= THRESHOLD);

  /** Dónde está el indicador: siguiendo al dedo, o parado en su sitio mientras recarga. */
  protected readonly offset = computed(() =>
    this.running() ? RESTING : Math.round(this.distance() - HIDDEN),
  );

  /** Aparece según baja, para que no se plante de golpe al primer píxel. */
  protected readonly opacity = computed(() =>
    this.running() ? 1 : Math.min(1, this.distance() / THRESHOLD),
  );

  /** La flecha gira con el recorrido: es el mismo movimiento del dedo, contado en redondo. */
  protected readonly angle = computed(() => Math.round(this.distance() * 3));

  /** Dónde empezó el dedo, o nulo si este gesto no es nuestro. */
  private startY: number | null = null;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    // Al terminar la recarga el indicador no se esfuma: se recoge, que es lo que cuenta que
    // ha terminado.
    let wasRunning = false;
    effect(() => {
      const running = this.running();
      if (wasRunning && !running) {
        this.settle();
      }
      wasRunning = running;
    });

    this.destroyRef.onDestroy(() => {
      if (this.settleTimer !== null) {
        clearTimeout(this.settleTimer);
      }
    });

    afterNextRender(() => {
      // Con ratón no hay gesto que valga: el que quiera recargar tiene su botón y su tecla.
      if (!matchMedia('(pointer: coarse)').matches) {
        return;
      }
      const start = (event: TouchEvent) => this.onStart(event);
      const move = (event: TouchEvent) => this.onMove(event);
      const end = () => this.onEnd();

      document.addEventListener('touchstart', start, { passive: true });
      // Sin `passive: false` el navegador no deja frenar el desplazamiento, y entonces el
      // gesto compite con el rebote elástico de la página en lugar de sustituirlo.
      document.addEventListener('touchmove', move, { passive: false });
      document.addEventListener('touchend', end, { passive: true });
      document.addEventListener('touchcancel', end, { passive: true });

      this.destroyRef.onDestroy(() => {
        document.removeEventListener('touchstart', start);
        document.removeEventListener('touchmove', move);
        document.removeEventListener('touchend', end);
        document.removeEventListener('touchcancel', end);
      });
    });
  }

  private onStart(event: TouchEvent): void {
    this.startY = null;
    if (event.touches.length !== 1 || !this.armed()) {
      return;
    }
    if (window.scrollY > 0 || this.insideScroller(event.target)) {
      return;
    }
    this.startY = event.touches[0].clientY;
    this.settling.set(false);
  }

  private onMove(event: TouchEvent): void {
    if (this.startY === null) {
      return;
    }
    const delta = event.touches[0].clientY - this.startY;
    if (delta <= 0) {
      // Hacia arriba es desplazarse, no recargar: se devuelve el gesto al navegador.
      this.release();
      return;
    }
    if (window.scrollY > 0) {
      this.release();
      return;
    }
    event.preventDefault();
    this.distance.set(Math.min(MAX_PULL, delta * RESISTANCE));
  }

  private onEnd(): void {
    if (this.startY === null) {
      return;
    }
    const ready = this.ready();
    this.release();
    if (ready) {
      this.refresh.run();
    }
  }

  /** Suelta el gesto y devuelve el indicador a su sitio con la única animación que hay. */
  private release(): void {
    this.startY = null;
    if (this.distance() > 0) {
      this.distance.set(0);
      this.settle();
    }
  }

  /**
   * Deja el indicador subiendo a su escondite durante lo que dura la transición.
   *
   * Sin esto no habría vuelta que ver: en cuanto el recorrido es cero el elemento deja de
   * pintarse, así que el indicador desaparecería de golpe en vez de recogerse.
   */
  private settle(): void {
    this.settling.set(true);
    if (this.settleTimer !== null) {
      clearTimeout(this.settleTimer);
    }
    this.settleTimer = setTimeout(() => this.settling.set(false), 260);
  }

  /** Si ahora mismo el gesto tiene algo que hacer. */
  private armed(): boolean {
    return this.refresh.available() && !this.running() && !this.editor.isOpen();
  }

  /**
   * Si el dedo ha empezado dentro de algo que se desplaza por su cuenta y no está arriba del
   * todo. Ahí el gesto es de quien lo lleve —una lista larga dentro de un desplegable, por
   * ejemplo—, y robárselo dejaría contenido al que no se puede llegar.
   */
  private insideScroller(target: EventTarget | null): boolean {
    let node = target instanceof Element ? target : null;
    while (node && node !== document.body) {
      if (node.scrollTop > 0) {
        return true;
      }
      node = node.parentElement;
    }
    return false;
  }
}
