import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  OnDestroy,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';
import AirDatepicker, { AirDatepickerLocale, AirDatepickerOptions } from 'air-datepicker';
import { monthLabel, toInputDateTime } from '../../core/format/period';
import { GAP, anchorSpot } from './anchor';

/** Qué se elige en el campo: un día, un día con su hora, o un mes entero. */
export type DateFieldMode = 'date' | 'datetime' | 'month';

/**
 * El español del calendario, escrito aquí en lugar de traído de la librería.
 *
 * Sus locales son lo único que no publica en ESM: cada uno es un módulo CommonJS, y traerse
 * uno obliga al empaquetador a envolverlo —avisa en cada compilación y renuncia a optimizar
 * lo que cuelgue de él—. Es una tabla que no va a cambiar nunca, así que sale más a cuenta
 * tenerla escrita que arrastrar el módulo.
 *
 * `dateFormat` y `timeFormat` los pide el tipo, pero no mandan: el formato del campo lo
 * decide `options()` y la hora no la lleva el calendario.
 */
const LOCALE_ES: AirDatepickerLocale = {
  days: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
  daysShort: ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'],
  daysMin: ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá'],
  months: [
    'Enero',
    'Febrero',
    'Marzo',
    'Abril',
    'Mayo',
    'Junio',
    'Julio',
    'Agosto',
    'Septiembre',
    'Octubre',
    'Noviembre',
    'Diciembre',
  ],
  monthsShort: ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'],
  today: 'Hoy',
  clear: 'Limpiar',
  dateFormat: 'dd/MM/yyyy',
  timeFormat: 'HH:mm',
  // La semana empieza en lunes, como en cualquier calendario de aquí.
  firstDay: 1,
};

/** Ancho por debajo del cual el calendario se abre centrado, como una hoja del sistema. */
const MOBILE_WIDTH = 576;

/** Las veinticuatro horas y los minutos de cinco en cinco, ya en el texto que se dibuja. */
const HOURS: readonly string[] = Array.from({ length: 24 }, (_, hour) =>
  String(hour).padStart(2, '0'),
);
const MINUTES: readonly string[] = Array.from({ length: 12 }, (_, step) =>
  String(step * 5).padStart(2, '0'),
);

/** Momentos del día que se ponen de un toque, que son casi siempre los que se necesitan. */
const SHORTCUTS: ReadonlyArray<{ label: string; time: string }> = [
  { label: 'Mañana', time: '09:00' },
  { label: 'Mediodía', time: '13:00' },
  { label: 'Tarde', time: '18:00' },
  { label: 'Noche', time: '21:00' },
];

/**
 * Campo de fecha con calendario propio.
 *
 * El `datetime-local` del navegador se ve distinto en cada sistema, se cuela con el idioma
 * del sistema operativo y en escritorio obliga a escribir la fecha por partes. Por eso el
 * calendario del día sí es nuestro: el mismo en todas partes, en español y con el tema de
 * la aplicación.
 *
 * La hora tampoco la pone el navegador. El `input type="time"` traía consigo el desplegable
 * del sistema —una caja cuadrada con su propia tipografía y su propio azul, que además se
 * cortaba dentro de la hoja del editor y se descolocaba en cuanto la pantalla se estrechaba—.
 * En su lugar hay dos columnas propias, horas y minutos, en un panel que va fijo a la ventana
 * y se coloca desde las medidas del botón: así ni lo recorta un contenedor con scroll ni
 * depende de dónde esté el campo. En un teléfono ese mismo panel sube desde abajo como una
 * hoja. Y para la mayoría de las veces ni siquiera hace falta abrirlo: hay atajos con los
 * momentos del día debajo.
 *
 * El valor que entra y sale sigue siendo el mismo texto que usaba el campo nativo
 * —`yyyy-MM-dd`, `yyyy-MM-ddTHH:mm` o `yyyy-MM`—, de modo que quien lo usa no se entera de
 * que por debajo hay una librería.
 */
@Component({
  selector: 'fs-date-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fs-datetime">
      <div class="fs-date fs-date--{{ variant() }}" [class.is-disabled]="disabled()">
        @if (variant() === 'field') {
          <i class="bi bi-calendar3 fs-date__icon" aria-hidden="true"></i>
        }
        <input
          #field
          type="text"
          class="fs-date__input"
          readonly
          [attr.id]="inputId()"
          [attr.aria-label]="ariaLabel()"
          [attr.placeholder]="placeholder()"
          [disabled]="disabled()"
        />
        @if (clearable() && value()) {
          <button
            type="button"
            class="fs-date__clear"
            [attr.aria-label]="'Quitar la fecha'"
            (click)="clear()"
          >
            <i class="bi bi-x" aria-hidden="true"></i>
          </button>
        }
      </div>

      @if (withTime()) {
        <div class="fs-time" [class.is-disabled]="disabled()" [class.is-empty]="!time()">
          <button
            #timeTrigger
            type="button"
            class="fs-time__open"
            [disabled]="disabled()"
            [attr.aria-expanded]="timeOpen()"
            aria-haspopup="dialog"
            aria-label="Elegir la hora"
            (click)="toggleTimePicker()"
          >
            <i class="bi bi-clock" aria-hidden="true"></i>
            <span class="fs-time__value fs-num">{{ time() || '--:--' }}</span>
          </button>
        </div>
      }
    </div>

    @if (timeOpen()) {
      <div class="fs-clock__veil" [class.is-sheet]="narrow()" (click)="closeTimePicker()"></div>
      <div
        #timePanel
        class="fs-clock"
        [class.is-sheet]="narrow()"
        [style.top.px]="narrow() ? null : spot().top"
        [style.left.px]="narrow() ? null : spot().left"
        role="dialog"
        aria-label="Elegir la hora"
        tabindex="-1"
        animate.enter="is-in"
        animate.leave="is-out"
        (keydown.escape)="closeTimePicker()"
      >
        <div class="fs-clock__cols">
          <div class="fs-clock__col">
            <p class="fs-clock__label" id="clockHours">Hora</p>
            <div class="fs-clock__scroll" role="listbox" aria-labelledby="clockHours">
              @for (option of hours; track option) {
                <button
                  type="button"
                  role="option"
                  class="fs-clock__cell fs-num"
                  [class.is-picked]="option === hour()"
                  [attr.aria-selected]="option === hour()"
                  (click)="pickHour(option)"
                >
                  {{ option }}
                </button>
              }
            </div>
          </div>

          <div class="fs-clock__col">
            <p class="fs-clock__label" id="clockMinutes">Minuto</p>
            <div class="fs-clock__scroll" role="listbox" aria-labelledby="clockMinutes">
              @for (option of minutes(); track option) {
                <button
                  type="button"
                  role="option"
                  class="fs-clock__cell fs-num"
                  [class.is-picked]="option === minute()"
                  [attr.aria-selected]="option === minute()"
                  (click)="pickMinute(option)"
                >
                  {{ option }}
                </button>
              }
            </div>
          </div>
        </div>
      </div>
    }

    @if (withTime()) {
      <div class="fs-times" role="group" aria-label="Momentos del día">
        <button type="button" class="fs-times__item" [disabled]="disabled()" (click)="setNow()">
          Ahora
        </button>
        @for (shortcut of shortcuts; track shortcut.time) {
          <button
            type="button"
            class="fs-times__item"
            [class.is-picked]="time() === shortcut.time"
            [disabled]="disabled()"
            (click)="onTimeChange(shortcut.time)"
          >
            {{ shortcut.label }}
          </button>
        }
      </div>
    }
  `,
  styles: `
    /* Puesto de compañero de otros en una fila, el campo tiene que poder encogerse: sin
       esto, su mínimo automático es lo que mide su contenido y lo que hace es empujar a los
       de al lado fuera de la caja que los contiene. */
    :host {
      min-width: 0;
    }

    .fs-datetime {
      display: flex;
      flex-wrap: wrap;
      align-items: stretch;
      gap: 0.5rem;
    }

    /* Si no caben en la misma línea, la hora baja debajo en lugar de estrujar la fecha
       hasta que se corte. */
    .fs-date {
      flex: 1 1 9rem;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .fs-date--field {
      padding: 0.4rem 0.7rem;
      border: 1px solid var(--fs-line);
      border-radius: var(--fs-radius);
      background-color: var(--fs-surface-sunken);
      transition:
        border-color 0.15s ease,
        box-shadow 0.15s ease;
    }

    .fs-date--field:focus-within {
      border-color: var(--fs-brand);
      box-shadow: 0 0 0 0.2rem rgba(var(--fs-brand-rgb), 0.15);
    }

    /* Sin caja: el campo es el propio rótulo de la pantalla y debe seguir leyéndose como un
       título, no como algo que hay que rellenar. */
    .fs-date--plain .fs-date__input {
      font: inherit;
      color: inherit;
      text-align: center;
    }

    .fs-date--plain:focus-within .fs-date__input {
      text-decoration: underline;
      text-underline-offset: 0.3rem;
    }

    .fs-date.is-disabled,
    .fs-time.is-disabled {
      opacity: 0.6;
    }

    .fs-date__icon {
      flex: none;
      color: var(--fs-ink-muted);
      font-size: 0.9rem;
    }

    /* El campo de la fecha es de solo lectura a propósito: se escribe tocando el calendario,
       así que en el móvil no debe aparecer el teclado. */
    .fs-date__input {
      flex: 1;
      min-width: 0;
      padding: 0.15rem 0;
      border: none;
      background: none;
      color: var(--fs-ink);
      font-size: 0.9375rem;
      cursor: pointer;
    }

    .fs-date__input:focus {
      outline: none;
    }

    .fs-date__clear {
      flex: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.4rem;
      height: 1.4rem;
      padding: 0;
      border: none;
      border-radius: 50%;
      background: none;
      color: var(--fs-ink-muted);
    }

    .fs-date__clear:hover {
      background-color: var(--fs-hover);
    }

    /* La hora lleva la misma caja que la fecha y abre el panel de la aplicación. */
    .fs-time {
      flex: none;
      display: flex;
    }

    .fs-date--field:hover,
    .fs-time:hover .fs-time__open {
      border-color: var(--fs-ink-muted);
    }

    .fs-time__open {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.4rem 0.7rem;
      border: 1px solid var(--fs-line);
      border-radius: var(--fs-radius);
      background-color: var(--fs-surface-sunken);
      color: var(--fs-ink);
      font-size: 0.9375rem;
      font-weight: 500;
      transition:
        border-color 0.15s ease,
        box-shadow 0.15s ease;
    }

    .fs-time__open:focus-visible,
    .fs-time__open[aria-expanded='true'] {
      outline: none;
      border-color: var(--fs-brand);
      box-shadow: 0 0 0 0.2rem rgba(var(--fs-brand-rgb), 0.15);
    }

    .fs-time__open i {
      color: var(--fs-ink-muted);
      font-size: 0.9rem;
    }

    /* Sin hora puesta el campo enseña «--:--», que es un hueco por rellenar y no un dato. */
    .fs-time.is-empty .fs-time__value {
      color: var(--fs-ink-faint);
      font-weight: 400;
    }

    /* --- Panel de la hora ---------------------------------------------------------------
       Va fijo a la ventana y no colgando del campo. El campo vive dentro de la hoja del
       editor, que recorta lo que se sale y además tiene su propio scroll: un panel absoluto
       ahí dentro se cortaba por abajo o se iba con el desplazamiento. Fijo, se coloca desde
       las medidas del botón y no le afecta nada de lo que tenga encima. */
    .fs-clock__veil {
      position: fixed;
      inset: 0;
      z-index: 1060;
    }

    .fs-clock {
      position: fixed;
      z-index: 1061;
      width: 13.5rem;
      padding: 0.6rem;
      border: 1px solid var(--fs-line);
      border-radius: var(--fs-radius-lg);
      background-color: var(--fs-surface);
      box-shadow: var(--fs-shadow-raised);
    }

    .fs-clock:focus {
      outline: none;
    }

    .fs-clock.is-in {
      animation: fs-clock-in 0.18s cubic-bezier(0.22, 1, 0.36, 1) both;
    }

    .fs-clock.is-out {
      animation: fs-clock-in 0.14s ease reverse both;
    }

    @keyframes fs-clock-in {
      from {
        opacity: 0;
        transform: translateY(-0.4rem) scale(0.97);
      }
    }

    .fs-clock__cols {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 0.4rem;
    }

    .fs-clock__label {
      margin: 0 0 0.35rem;
      font-size: var(--fs-text-xs);
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      text-align: center;
      color: var(--fs-ink-faint);
    }

    .fs-clock__scroll {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
      max-height: 11rem;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-width: thin;
    }

    .fs-clock__cell {
      flex: none;
      padding: 0.35rem 0.5rem;
      border: none;
      border-radius: 0.5rem;
      background: none;
      color: var(--fs-ink-muted);
      font-size: 0.875rem;
      transition:
        background-color 0.12s ease,
        color 0.12s ease;
    }

    .fs-clock__cell:hover {
      background-color: var(--fs-hover);
      color: var(--fs-ink);
    }

    .fs-clock__cell.is-picked {
      background-color: var(--fs-brand);
      color: var(--fs-on-brand);
      font-weight: 600;
    }

    /* En un teléfono no hay sitio para colgar nada de un campo: el panel sube desde abajo,
       a lo ancho y con las celdas grandes, como cualquier otra hoja del sistema. */
    .fs-clock.is-sheet {
      top: auto;
      left: 0;
      right: 0;
      bottom: 0;
      width: auto;
      padding: 1rem 1rem calc(1rem + env(safe-area-inset-bottom, 0px));
      border-width: 1px 0 0;
      border-radius: var(--fs-radius-lg) var(--fs-radius-lg) 0 0;
    }

    .fs-clock.is-sheet .fs-clock__scroll {
      max-height: 45vh;
      gap: 0.25rem;
    }

    .fs-clock.is-sheet .fs-clock__cell {
      padding: 0.6rem 0.5rem;
      font-size: 1rem;
    }

    .fs-clock__veil.is-sheet {
      background-color: rgba(9, 13, 20, 0.45);
    }

    .fs-clock.is-sheet.is-in {
      animation: fs-clock-rise 0.24s cubic-bezier(0.22, 1, 0.36, 1) both;
    }

    .fs-clock.is-sheet.is-out {
      animation: fs-clock-rise 0.18s ease reverse both;
    }

    @keyframes fs-clock-rise {
      from {
        transform: translateY(100%);
      }
    }

    /* Los momentos del día resuelven la mayoría de las veces sin abrir nada. */
    .fs-times {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      margin-top: 0.5rem;
    }

    .fs-times__item {
      padding: 0.2rem 0.65rem;
      border: 1px solid var(--fs-line);
      border-radius: 999px;
      background: none;
      font-size: 0.8125rem;
      color: var(--fs-ink-muted);
      transition:
        background-color 0.12s ease,
        border-color 0.12s ease,
        color 0.12s ease;
    }

    .fs-times__item:hover {
      color: var(--fs-ink);
    }

    .fs-times__item.is-picked {
      background-color: var(--fs-brand-tint);
      border-color: var(--fs-brand);
      color: var(--fs-brand);
    }

    .fs-times__item:disabled {
      opacity: 0.5;
    }
  `,
})
export class DateFieldComponent implements AfterViewInit, OnDestroy {
  /** Valor en el mismo formato que entregaba el campo nativo. Vacío es sin fecha. */
  readonly value = model<string>('');

  readonly mode = input<DateFieldMode>('date');

  readonly inputId = input<string | null>(null);

  /** Etiqueta accesible, para cuando el campo no tiene un `label` al lado. */
  readonly ariaLabel = input<string | null>(null);

  readonly disabled = input(false);

  /** Muestra una cruz para dejar el campo vacío, útil en los filtros por rango. */
  readonly clearable = input(false);

  readonly placeholder = input('Elegir fecha');

  /**
   * Aspecto del campo: `field` es una caja de formulario y `plain` solo el texto, para
   * cuando la fecha es el rótulo de la pantalla y no un campo más.
   */
  readonly variant = input<'field' | 'plain'>('field');

  /** Último día seleccionable, en formato `yyyy-MM-dd`. Vacío es sin tope. */
  readonly max = input<string>('');

  protected readonly shortcuts = SHORTCUTS;

  protected readonly withTime = computed(() => this.mode() === 'datetime');

  /** La hora del valor actual, vacía mientras no haya ninguna fecha puesta. */
  protected readonly time = computed(() => this.value().slice(11, 16));

  protected readonly hour = computed(() => this.time().slice(0, 2));
  protected readonly minute = computed(() => this.time().slice(3, 5));

  protected readonly hours = HOURS;

  /**
   * Los minutos van de cinco en cinco, que es el paso con el que se apunta un gasto. El
   * minuto que ya tuviera el movimiento entra igualmente aunque no sea múltiplo de cinco:
   * si no, abrir el panel de uno guardado a las 13:37 no enseñaría su propia hora.
   */
  protected readonly minutes = computed(() => {
    const current = this.minute();
    if (!current || MINUTES.includes(current)) {
      return MINUTES;
    }
    return [...MINUTES, current].sort();
  });

  protected readonly timeOpen = signal(false);

  /** Si el panel se abre como hoja desde abajo, que es lo que cabe en un teléfono. */
  protected readonly narrow = signal(false);

  /** Esquina en la que se dibuja el panel anclado, en coordenadas de la ventana. */
  protected readonly spot = signal<{ top: number; left: number }>({ top: 0, left: 0 });

  private readonly injector = inject(Injector);

  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');
  private readonly timeTrigger = viewChild<ElementRef<HTMLButtonElement>>('timeTrigger');
  private readonly timePanel = viewChild<ElementRef<HTMLElement>>('timePanel');

  private picker?: AirDatepicker<HTMLInputElement>;

  constructor() {
    // El valor puede cambiar desde fuera —al abrir el editor sobre otro movimiento, o al
    // limpiar los filtros—, y entonces el calendario tiene que seguirlo. Se compara antes
    // de tocarlo para que la selección del propio calendario no vuelva a entrar por aquí.
    effect(() => {
      const value = this.value();
      if (!this.picker || value.slice(0, 10) === this.selectedValue().slice(0, 10)) {
        return;
      }
      if (value) {
        this.picker.selectDate(parse(value), { silent: true });
      } else {
        this.picker.clear({ silent: true });
      }
    });
  }

  ngAfterViewInit(): void {
    this.picker = new AirDatepicker(this.field().nativeElement, this.options());
    if (this.value()) {
      this.picker.selectDate(parse(this.value()), { silent: true });
    }
  }

  ngOnDestroy(): void {
    this.picker?.destroy();
    this.stopFollowing();
  }

  protected clear(): void {
    this.picker?.clear({ silent: true });
    this.value.set('');
  }

  protected toggleTimePicker(): void {
    if (this.timeOpen()) {
      this.closeTimePicker();
      return;
    }
    this.narrow.set(window.innerWidth < MOBILE_WIDTH);
    this.timeOpen.set(true);
    // El panel todavía no existe en el DOM: se coloca y se enfoca en cuanto Angular lo ha
    // pintado, que es cuando ya se puede medir.
    afterNextRender({ mixedReadWrite: () => this.revealPanel() }, { injector: this.injector });
    // Va fijo a la ventana, así que lo que se desplace por debajo no lo arrastra: hay que
    // volver a colocarlo para que siga pegado a su botón. En captura, porque lo que se mueve
    // es el cuerpo de la hoja del editor y su scroll no llega a la ventana por sí solo.
    window.addEventListener('scroll', this.follow, { capture: true, passive: true });
    window.addEventListener('resize', this.follow);
  }

  protected closeTimePicker(): void {
    if (!this.timeOpen()) {
      return;
    }
    this.stopFollowing();
    this.timeOpen.set(false);
    this.timeTrigger()?.nativeElement.focus();
  }

  /** Deja la hora elegida y espera al minuto, que es el paso que falta. */
  protected pickHour(hour: string): void {
    this.onTimeChange(`${hour}:${this.minute() || '00'}`);
  }

  /** El minuto cierra el panel: con él ya está dicha la hora entera. */
  protected pickMinute(minute: string): void {
    this.onTimeChange(`${this.hour() || '00'}:${minute}`);
    this.closeTimePicker();
  }

  /** Coloca el panel recién abierto, lo enfoca y le enseña de entrada la hora que ya tenía. */
  private revealPanel(): void {
    const panel = this.timePanel()?.nativeElement;
    if (!panel) {
      return;
    }

    this.anchorPanel();
    panel.focus({ preventScroll: true });
    // Con veinticuatro horas en una columna, la que está puesta puede quedar fuera de la
    // vista: se centra en su columna para que el panel se abra enseñando la hora actual.
    for (const cell of panel.querySelectorAll<HTMLElement>('.fs-clock__cell.is-picked')) {
      const column = cell.parentElement;
      if (column) {
        column.scrollTop = cell.offsetTop - (column.clientHeight - cell.clientHeight) / 2;
      }
    }
  }

  /**
   * Deja el panel bajo el botón, o encima si abajo no cabe, y sin salirse por los lados.
   * En hoja no hay nada que calcular: la pone el CSS pegada al borde inferior.
   */
  private anchorPanel(): void {
    const panel = this.timePanel()?.nativeElement;
    const trigger = this.timeTrigger()?.nativeElement;
    if (!panel || !trigger || this.narrow()) {
      return;
    }

    this.spot.set(
      anchorSpot(
        trigger.getBoundingClientRect(),
        { width: panel.offsetWidth, height: panel.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
        // Pegado al borde derecho del botón, que es donde está el número de la hora.
        'end',
      ),
    );
  }

  /** Frame pedido para la próxima recolocación, o cero si no hay ninguno pendiente. */
  private pending = 0;

  /**
   * Vuelve a colocar el panel mientras algo se mueve por debajo.
   * Se mide una sola vez por frame: un scroll dispara decenas de eventos seguidos y medir en
   * cada uno obliga al navegador a recalcular la página otras tantas veces.
   */
  private readonly follow = (): void => {
    if (this.pending) {
      return;
    }
    this.pending = requestAnimationFrame(() => {
      this.pending = 0;
      this.anchorPanel();
    });
  };

  private stopFollowing(): void {
    window.removeEventListener('scroll', this.follow, { capture: true });
    window.removeEventListener('resize', this.follow);
    cancelAnimationFrame(this.pending);
    this.pending = 0;
  }

  /** Pone la hora actual, que es la respuesta correcta casi siempre. */
  protected setNow(): void {
    this.onTimeChange(toInputDateTime(new Date()).slice(11, 16));
  }

  /**
   * Recoge la hora elegida conservando el día.
   * Si todavía no había fecha, se toma la de hoy: quien elige una hora está diciendo que
   * el movimiento es de hoy a esa hora.
   *
   * @param time hora elegida, en formato `HH:mm`
   */
  protected onTimeChange(time: string): void {
    if (!time) {
      return;
    }
    const current = this.value();
    const day = current ? current.slice(0, 10) : toInputDateTime(new Date()).slice(0, 10);
    this.value.set(`${day}T${time}`);
  }

  /** Opciones del calendario según lo que se esté eligiendo. */
  private options(): AirDatepickerOptions<HTMLInputElement> {
    const byMonth = this.mode() === 'month';
    return {
      locale: LOCALE_ES,
      // El mes se rotula como lo hacía la cabecera antes de tener calendario: el nombre
      // solo, y con el año únicamente cuando no es el de hoy.
      dateFormat: byMonth
        ? (date: Date) => monthLabel(date.getMonth() + 1, date.getFullYear())
        : 'dd MMM yyyy',
      // El reloj de la librería no se usa: son dos sliders de rango y la hora la lleva el
      // control del navegador, que en cada sistema abre el selector que la gente conoce.
      timepicker: false,
      view: byMonth ? 'months' : 'days',
      minView: byMonth ? 'months' : 'days',
      autoClose: true,
      maxDate: this.max() ? parse(this.max()) : undefined,
      // En una pantalla estrecha el calendario se abre centrado y con celdas grandes, en
      // lugar de colgando de un campo que puede estar al borde de la pantalla.
      isMobile: window.innerWidth < MOBILE_WIDTH,
      buttons: ['today'],
      onSelect: ({ date }) => {
        const selected = Array.isArray(date) ? date[0] : date;
        if (!selected) {
          this.value.set('');
          return;
        }
        const day = this.format(selected).slice(0, 10);
        // El calendario entrega el día a medianoche, así que la hora se conserva aparte.
        this.value.set(
          this.withTime() ? `${day}T${this.time() || '00:00'}` : this.format(selected),
        );
      },
    };
  }

  /** El valor que representa ahora mismo el calendario, para no repetir selecciones. */
  private selectedValue(): string {
    const [selected] = this.picker?.selectedDates ?? [];
    return selected ? this.format(selected) : '';
  }

  /**
   * Escribe la fecha en el formato que espera quien usa el campo.
   *
   * @param date fecha elegida en el calendario
   * @return el valor en texto
   */
  private format(date: Date): string {
    const full = toInputDateTime(date);
    switch (this.mode()) {
      case 'datetime':
        return full;
      case 'month':
        return full.slice(0, 7);
      default:
        return full.slice(0, 10);
    }
  }
}

/**
 * Interpreta el valor en hora local.
 * Se parte el texto a mano en lugar de dárselo a `new Date(...)`, que interpreta
 * `2026-08-26` como medianoche UTC y correría el día en cualquier huso al oeste.
 *
 * @param value valor en formato `yyyy-MM`, `yyyy-MM-dd` o `yyyy-MM-ddTHH:mm`
 * @return la fecha equivalente
 */
function parse(value: string): Date {
  const [datePart, timePart] = value.split('T');
  const [year, month = 1, day = 1] = datePart.split('-').map(Number);
  const [hours = 0, minutes = 0] = (timePart ?? '').split(':').map(Number);
  return new Date(year, month - 1, day, hours, minutes);
}
