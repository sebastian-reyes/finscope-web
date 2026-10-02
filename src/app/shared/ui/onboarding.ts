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

/** Un consejo concreto de un paso: qué tocar o qué mirar, con su icono. */
export interface OnboardingPoint {
  icon: string;
  text: string;
}

/** Cada una de las cosas que se enseñan, con el dibujo que la acompaña. */
export interface OnboardingSlide {
  id: 'welcome' | 'record' | 'history' | 'insight' | 'budgets' | 'recurring' | 'yours';
  /** Rótulo corto sobre el título, del color secundario como el resto de rótulos. */
  eyebrow: string;
  title: string;
  text: string;
  /** Dos o tres cosas que se pueden hacer ahí, dichas como se harían. */
  points: readonly OnboardingPoint[];
  /** Dónde vive en la aplicación, con el icono de su pestaña; nulo si no es un sitio. */
  where: OnboardingPoint | null;
}

/**
 * Lo que enseña el recorrido, en el orden en que se usa la aplicación: apuntar, encontrar lo
 * apuntado, entender en qué se va, ponerle límite, dejar lo fijo resuelto y hacerla propia.
 *
 * Cada paso dice una idea en su título y la aterriza en dos o tres consejos que se pueden
 * hacer nada más cerrar el recorrido. La etiqueta de «dónde» lleva el mismo icono y el mismo
 * nombre que la pestaña de la barra, para que después se encuentre sin buscarlo.
 */
export const ONBOARDING_SLIDES: readonly OnboardingSlide[] = [
  {
    id: 'welcome',
    eyebrow: 'Bienvenida',
    title: 'Tu dinero, claro y en un solo sitio',
    text: 'FinScope te ayuda a saber en qué se te va el dinero sin hojas de cálculo. Te enseñamos lo esencial en un minuto.',
    points: [
      { icon: 'bi-plus-circle', text: 'Apunta lo que gastas y lo que te entra.' },
      { icon: 'bi-bar-chart-line', text: 'Mira en qué se te va y cómo cambia cada mes.' },
      { icon: 'bi-clipboard-check', text: 'Planifica con presupuestos y pagos fijos.' },
    ],
    where: null,
  },
  {
    id: 'record',
    eyebrow: 'Registrar',
    title: 'Apunta un gasto en segundos',
    text: 'Importe, categoría y listo. Todo lo demás es opcional.',
    points: [
      { icon: 'bi-plus-lg', text: 'Toca + desde cualquier pantalla del teléfono.' },
      {
        icon: 'bi-currency-dollar',
        text: '¿Pagaste en dólares? Guárdalo en USD con su tipo de cambio.',
      },
      { icon: 'bi-tags', text: 'Añade tags como «viaje» o «familia» para darle contexto.' },
    ],
    where: { icon: 'bi-plus-lg', text: 'Botón +' },
  },
  {
    id: 'history',
    eyebrow: 'Movimientos',
    title: 'Encuentra cualquier movimiento',
    text: 'Todo lo que apuntas queda en tu historial, ordenado por día.',
    points: [
      { icon: 'bi-search', text: 'Busca por descripción, categoría o tag: «dentista», «Salud».' },
      { icon: 'bi-funnel', text: 'Filtra por mes, categoría, tag o moneda.' },
      { icon: 'bi-pencil', text: 'Toca un movimiento para corregirlo o borrarlo.' },
    ],
    where: { icon: 'bi-arrow-left-right', text: 'Movimientos' },
  },
  {
    id: 'insight',
    eyebrow: 'Entender',
    title: 'Mira en qué se te va',
    text: 'El inicio te cuenta cómo va el mes; Análisis lo compara con antes.',
    points: [
      { icon: 'bi-pie-chart', text: 'Tus gastos repartidos por categoría.' },
      { icon: 'bi-speedometer2', text: 'Si vas por encima o por debajo del mes pasado.' },
      { icon: 'bi-stars', text: '«Lo que destaca» te dice por qué cambió tu gasto.' },
    ],
    where: { icon: 'bi-bar-chart-line', text: 'Inicio y Análisis' },
  },
  {
    id: 'budgets',
    eyebrow: 'Presupuestos',
    title: 'Ponle un límite a cada categoría',
    text: 'Decide cuánto quieres gastar al mes y la barra te dice cuánto te queda.',
    points: [
      { icon: 'bi-bullseye', text: 'Un límite por categoría, solo en las que quieras.' },
      { icon: 'bi-arrow-down-up', text: 'Copia el plan del mes anterior con un toque.' },
      { icon: 'bi-lock', text: 'Lo que tus pagos fijos se van a llevar ya sale reservado.' },
    ],
    where: { icon: 'bi-clipboard-check', text: 'Plan → Presupuestos' },
  },
  {
    id: 'recurring',
    eyebrow: 'Pagos fijos',
    title: 'Lo de cada mes, sin olvidos',
    text: 'Alquiler, streaming, el sueldo: los das de alta una vez y no se te pasan.',
    points: [
      { icon: 'bi-check2-circle', text: 'Cada mes los marcas como pagados de un toque.' },
      { icon: 'bi-bell', text: 'Activa los avisos y te los recordamos el día antes.' },
      { icon: 'bi-pause-circle', text: '¿Lo dejaste de pagar? Ponlo en pausa.' },
    ],
    where: { icon: 'bi-arrow-repeat', text: 'Plan → Fijos' },
  },
  {
    id: 'yours',
    eyebrow: 'Hazla tuya',
    title: 'Todo listo para empezar',
    text: 'Ajusta FinScope a tu gusto cuando quieras.',
    points: [
      { icon: 'bi-palette', text: 'Elige tu imagen, tus colores y el tema claro u oscuro.' },
      { icon: 'bi-grid', text: 'Dale a cada categoría y tag su color y su icono.' },
      {
        icon: 'bi-phone',
        text: 'Instálala en tu teléfono: funciona aunque te quedes sin red.',
      },
    ],
    where: { icon: 'bi-gear', text: 'Configuración' },
  },
];

/** Recorrido mínimo del dedo, en píxeles, para que un deslizamiento cuente como paso. */
const SWIPE_DISTANCE = 48;

/** Cómo termina el recorrido: omitido o acabado, o acabado yendo directo a registrar. */
export type OnboardingExit = 'skip' | 'done' | 'record';

/**
 * El recorrido de bienvenida, en diapositivas sobre toda la aplicación.
 *
 * Es sobrio a propósito: fondo claro con un velo del color de marca, un dibujo sencillo de la
 * pantalla de la que habla y, al lado, una idea, unos consejos y dónde encontrarlo. Lo que se
 * busca es que se entienda y se recuerde, no que deslumbre.
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

  /** «Paso 3 de 7»: los puntos dicen dónde se está, esto dice cuánto queda. */
  protected readonly progress = computed(() => `Paso ${this.index() + 1} de ${this.slides.length}`);
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
