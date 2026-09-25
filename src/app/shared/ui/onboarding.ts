import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  ElementRef,
  Injector,
  OnDestroy,
  OnInit,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { TransactionEditorService } from '../../core/transaction-editor.service';
import { LogoComponent } from './logo';
import { OnboardingArtComponent } from './onboarding-art';

/** Cada una de las cosas que se enseñan, con el dibujo que la acompaña. */
export interface OnboardingSlide {
  id: 'welcome' | 'record' | 'insight' | 'budgets' | 'recurring' | 'yours';
  /** Rótulo corto sobre el título, del color secundario como el resto de rótulos. */
  eyebrow: string;
  title: string;
  text: string;
}

/**
 * Lo que enseña el recorrido, en el orden en que se usa la aplicación: apuntar, entender en
 * qué se va, ponerle límite, dejar lo fijo resuelto y, al final, hacerla propia.
 *
 * Son seis y no una por pantalla. Las categorías y los tags no tienen paso aparte porque se
 * entienden al ver el reparto, que es para lo que existen; y la cuenta no enseña nada que no
 * se encuentre sola.
 */
export const ONBOARDING_SLIDES: readonly OnboardingSlide[] = [
  {
    id: 'welcome',
    eyebrow: 'Bienvenida',
    title: 'Tu dinero, claro y en un solo sitio',
    text: 'Lo que entra, lo que sale y lo que ya tiene dueño antes de que empiece el mes. Te enseñamos lo esencial en menos de un minuto.',
  },
  {
    id: 'record',
    eyebrow: 'Registrar',
    title: 'Apunta un gasto en segundos',
    text: 'Toca + desde cualquier pantalla, o usa el formulario rápido del inicio en el ordenador. Monto, categoría y listo. ¿Pagaste en dólares? También se guarda en USD.',
  },
  {
    id: 'insight',
    eyebrow: 'Entender',
    title: 'Mira en qué se te va',
    text: 'El inicio reparte tus gastos por categoría y dibuja cómo evolucionan tus ingresos y egresos. Los tags cruzan esa vista: con quién, para qué o en qué viaje.',
  },
  {
    id: 'budgets',
    eyebrow: 'Presupuestos',
    title: 'Ponle un límite a cada categoría',
    text: 'Fija cuánto gastar al mes y la barra te dice cuánto te queda libre de verdad, descontando lo que tus pagos fijos ya se van a llevar.',
  },
  {
    id: 'recurring',
    eyebrow: 'Pagos fijos',
    title: 'Lo de cada mes, sin olvidos',
    text: 'Alquiler, streaming, el gimnasio: los das de alta una vez y cada mes los confirmas de un toque. Con los avisos activos, te los recordamos el día antes.',
  },
  {
    id: 'yours',
    eyebrow: 'Hazla tuya',
    title: 'Todo listo para empezar',
    text: 'En Configuración le das a cada categoría su color y su icono, y eliges tema y colores para la aplicación. Instálala en tu teléfono: lo último sigue a mano aunque te quedes sin red.',
  },
];

/** Recorrido mínimo del dedo, en píxeles, para que un deslizamiento cuente como paso. */
const SWIPE_DISTANCE = 48;

/** Cómo termina el recorrido: omitido o acabado, o acabado yendo directo a registrar. */
export type OnboardingExit = 'skip' | 'done' | 'record';

/**
 * El recorrido de bienvenida, en diapositivas sobre toda la aplicación.
 *
 * Son diapositivas y no un foco que va señalando botones de verdad a propósito: la navegación
 * cambia de forma entre el teléfono —barra inferior con el botón de registrar en medio— y el
 * escritorio —barra superior, sin ese botón—, y un recorrido que apunta a elementos concretos
 * se rompe en cuanto uno de ellos no está donde lo esperaba. Aquí cada paso lleva su propio
 * dibujo, hecho con las mismas piezas que luego se encuentran en la aplicación.
 *
 * Se puede omitir en cualquier momento —con su botón o con Escape—, se avanza con los
 * botones, con las flechas del teclado o deslizando el dedo, y el último paso ofrece ir
 * directo a apuntar el primer movimiento, que es lo que da sentido a todo lo demás.
 */
@Component({
  selector: 'fs-onboarding',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LogoComponent, OnboardingArtComponent],
  templateUrl: './onboarding.html',
  styleUrl: './onboarding.scss',
  host: {
    '(keydown)': 'onKeydown($event)',
  },
})
export class OnboardingComponent implements OnInit, OnDestroy {
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);
  private readonly editor = inject(TransactionEditorService);

  /** Nombre con el que saludar, o vacío si la cuenta no tiene. */
  readonly name = input<string | null | undefined>(null);

  /** Se ha omitido o terminado. Quien lo monta decide qué hacer después. */
  readonly closed = output<OnboardingExit>();

  protected readonly slides = ONBOARDING_SLIDES;

  protected readonly index = signal(0);

  /** Hacia dónde se movió el último paso, que es de donde entra el siguiente. */
  protected readonly direction = signal<1 | -1>(1);

  protected readonly slide = computed(() => this.slides[this.index()]);
  protected readonly isFirst = computed(() => this.index() === 0);
  protected readonly isLast = computed(() => this.index() === this.slides.length - 1);

  /** El saludo del primer paso, con el nombre de pila si lo hay. */
  protected readonly greeting = computed(() => {
    const first = this.name()?.trim().split(/\s+/)[0];
    return first ? `Hola, ${first}` : 'Hola';
  });

  private readonly dialog = viewChild.required<ElementRef<HTMLElement>>('dialog');
  private readonly primary = viewChild.required<ElementRef<HTMLButtonElement>>('primary');

  /** Lo que tenía el foco al abrirse, para devolvérselo al cerrar. */
  private previousFocus: HTMLElement | null = null;

  /** Dónde se apoyó el dedo, mientras dura un deslizamiento. */
  private touchStart: { x: number; y: number; id: number } | null = null;

  ngOnInit(): void {
    this.previousFocus = this.document.activeElement as HTMLElement | null;
    // Lo de detrás no se desplaza mientras el recorrido tapa la pantalla.
    this.document.body.style.overflow = 'hidden';
    afterNextRender(() => this.primary().nativeElement.focus(), { injector: this.injector });
  }

  ngOnDestroy(): void {
    // El último paso puede terminar abriendo la hoja de registro, y este componente se
    // destruye cuando acaba su salida, con la hoja ya puesta: devolverle el desplazamiento a
    // la página entonces dejaría moverse la lista de detrás de la hoja.
    if (!this.editor.isOpen()) {
      this.document.body.style.overflow = '';
      this.previousFocus?.focus?.();
    }
  }

  protected next(): void {
    if (this.isLast()) {
      this.closed.emit('done');
      return;
    }
    this.go(this.index() + 1);
  }

  protected back(): void {
    if (!this.isFirst()) {
      this.go(this.index() - 1);
    }
  }

  protected skip(): void {
    this.closed.emit('skip');
  }

  protected record(): void {
    this.closed.emit('record');
  }

  /**
   * Salta a un paso concreto.
   *
   * @param target posición del paso
   */
  protected go(target: number): void {
    if (target < 0 || target >= this.slides.length || target === this.index()) {
      return;
    }
    this.direction.set(target > this.index() ? 1 : -1);
    this.index.set(target);
    // Los botones cambian entre pasos —«Atrás» no está en el primero y el último cambia sus
    // acciones—, y si el foco estaba en uno que desaparece se queda en el cuerpo de la
    // página, fuera del diálogo. Ahí quien usa teclado ya no sabe dónde está.
    afterNextRender(
      () => {
        if (!this.dialog().nativeElement.contains(this.document.activeElement)) {
          this.primary().nativeElement.focus();
        }
      },
      { injector: this.injector },
    );
  }

  protected onKeydown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        this.skip();
        break;
      case 'ArrowRight':
        event.preventDefault();
        if (!this.isLast()) {
          this.next();
        }
        break;
      case 'ArrowLeft':
        event.preventDefault();
        this.back();
        break;
      case 'Tab':
        this.trapFocus(event);
        break;
    }
  }

  protected onPointerDown(event: PointerEvent): void {
    if (event.pointerType !== 'mouse') {
      this.touchStart = { x: event.clientX, y: event.clientY, id: event.pointerId };
    }
  }

  /**
   * Da el paso si el dedo se ha movido sobre todo en horizontal y lo bastante.
   * Un toque sobre un botón no llega a la distancia, así que sigue siendo un toque.
   */
  protected onPointerUp(event: PointerEvent): void {
    const start = this.touchStart;
    this.touchStart = null;
    if (!start || start.id !== event.pointerId) {
      return;
    }
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < Math.abs(dy)) {
      return;
    }
    if (dx < 0) {
      if (!this.isLast()) {
        this.next();
      }
    } else {
      this.back();
    }
  }

  protected onPointerCancel(): void {
    this.touchStart = null;
  }

  /**
   * Mantiene el tabulador dentro del diálogo.
   * Es modal: dejar que el foco salte a la barra de navegación de detrás sería llevar a
   * alguien a botones que no ve.
   */
  private trapFocus(event: KeyboardEvent): void {
    const focusable = Array.from(
      this.dialog().nativeElement.querySelectorAll<HTMLElement>('button:not([disabled])'),
    );
    if (focusable.length === 0) {
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = this.document.activeElement;
    if (event.shiftKey && (active === first || !focusable.includes(active as HTMLElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (active === last || !focusable.includes(active as HTMLElement))) {
      event.preventDefault();
      first.focus();
    }
  }
}
