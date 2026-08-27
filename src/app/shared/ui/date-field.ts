import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  effect,
  input,
  model,
  viewChild,
} from '@angular/core';
import AirDatepicker, { AirDatepickerOptions } from 'air-datepicker';
import localeEs from 'air-datepicker/locale/es';
import { monthLabel, toInputDateTime } from '../../core/format/period';

/** Qué se elige en el campo: un día, un día con su hora, o un mes entero. */
export type DateFieldMode = 'date' | 'datetime' | 'month';

/** Ancho por debajo del cual el calendario se abre centrado, como una hoja del sistema. */
const MOBILE_WIDTH = 576;

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
 * La hora, en cambio, es un `input type="time"` del navegador, y a propósito. Ahí la
 * plataforma gana: en un iPhone abre la rueda del sistema, en Android el reloj de Material
 * y en escritorio se teclea «1335» y ya está. Solo se le pone la caja alrededor para que
 * haga juego con el campo de al lado; lo de dentro lo dibuja quien mejor sabe hacerlo. Para
 * la mayoría de las veces ni siquiera hace falta abrirlo: hay atajos con los momentos del
 * día debajo.
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
            type="button"
            class="fs-time__open"
            [disabled]="disabled()"
            aria-label="Elegir la hora"
            (click)="openTimePicker()"
          >
            <i class="bi bi-clock" aria-hidden="true"></i>
          </button>
          <input
            #timeField
            type="time"
            class="fs-time__input fs-num"
            aria-label="Hora"
            [value]="time()"
            [disabled]="disabled()"
            (change)="onTimeChange($any($event.target).value)"
          />
        </div>
      }
    </div>

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

    /* La hora lleva la misma caja que la fecha, pero por dentro es el control del navegador:
       en el móvil abre el selector del sistema y en escritorio se teclea. */
    .fs-time {
      flex: none;
      display: flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.4rem 0.7rem;
      border: 1px solid var(--fs-line);
      border-radius: var(--fs-radius);
      background-color: var(--fs-surface-sunken);
      transition:
        border-color 0.15s ease,
        box-shadow 0.15s ease;
    }

    .fs-date--field:hover,
    .fs-time:hover {
      border-color: var(--fs-ink-muted);
    }

    .fs-time:focus-within {
      border-color: var(--fs-brand);
      box-shadow: 0 0 0 0.2rem rgba(var(--fs-brand-rgb), 0.15);
    }

    .fs-time__open {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.5rem;
      height: 1.5rem;
      padding: 0;
      border: none;
      border-radius: 50%;
      background: none;
      color: var(--fs-ink-muted);
      font-size: 0.9rem;
      transition:
        background-color 0.12s ease,
        color 0.12s ease;
    }

    .fs-time__open:hover {
      background-color: var(--fs-hover);
      color: var(--fs-brand);
    }

    .fs-time__input {
      width: 4.25rem;
      padding: 0.15rem 0;
      border: none;
      background: none;
      color: var(--fs-ink);
      font-size: 0.9375rem;
      font-weight: 500;
      font-family: inherit;
    }

    .fs-time__input:focus {
      outline: none;
    }

    /* Sin hora puesta el campo enseña «--:--», que es un hueco por rellenar y no un dato. */
    .fs-time.is-empty .fs-time__input {
      color: var(--fs-ink-faint);
      font-weight: 400;
    }

    /* El icono de reloj del navegador sobra: ya hay uno a la izquierda, y ese además abre
       el selector en los navegadores que lo permiten. */
    .fs-time__input::-webkit-calendar-picker-indicator {
      display: none;
    }

    /* Lo de dentro del campo nativo también se puede vestir en los navegadores basados en
       Chromium: sin esto, la hora y los minutos se seleccionan con el azul del sistema, que
       es el único trozo de la aplicación que no sigue su propia paleta. En Firefox y Safari
       estas reglas no existen y el campo se queda con la caja de fuera, que ya hace juego. */
    .fs-time__input::-webkit-datetime-edit,
    .fs-time__input::-webkit-datetime-edit-fields-wrapper {
      padding: 0;
    }

    .fs-time__input::-webkit-datetime-edit-hour-field,
    .fs-time__input::-webkit-datetime-edit-minute-field {
      padding: 0.05rem 0.25rem;
      border-radius: 0.35rem;
    }

    /* Tinte de marca en vez del azul del sistema: el par tinte/tinta se invierte solo con
       el tema, así que el segmento elegido se lee igual de bien en claro y en oscuro. */
    .fs-time__input::-webkit-datetime-edit-hour-field:focus,
    .fs-time__input::-webkit-datetime-edit-minute-field:focus {
      background-color: var(--fs-brand-tint);
      color: var(--fs-brand);
      outline: none;
    }

    .fs-time__input::-webkit-datetime-edit-text {
      padding: 0 0.05rem;
      color: var(--fs-ink-faint);
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

  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');
  private readonly timeField = viewChild<ElementRef<HTMLInputElement>>('timeField');

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
  }

  protected clear(): void {
    this.picker?.clear({ silent: true });
    this.value.set('');
  }

  /**
   * Abre el selector de hora del navegador.
   * No todos lo permiten desde código, y donde no se puede no pasa nada: el campo se
   * escribe igual, y en el móvil basta con tocarlo para que salga el del sistema.
   */
  protected openTimePicker(): void {
    const field = this.timeField()?.nativeElement;
    try {
      field?.showPicker();
    } catch {
      field?.focus();
    }
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
      locale: localeEs,
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
