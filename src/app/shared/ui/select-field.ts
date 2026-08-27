import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  model,
  signal,
} from '@angular/core';

/** Una opción del desplegable. */
export interface SelectOption {
  /** Valor que se entrega al elegirla. La cadena vacía es la opción de «sin filtro». */
  value: string;
  label: string;
  /** Icono opcional, para que la opción se reconozca por la misma marca que en el resto. */
  icon?: string;
  /** Texto secundario a la derecha, como el número de movimientos. */
  hint?: string;
}

/** A partir de cuántas opciones deja de servir recorrer la lista con la vista. */
const SEARCH_THRESHOLD = 8;

/** Contador para que cada desplegable tenga identificadores propios. */
let nextId = 1;

/**
 * Combobox de la casa.
 *
 * Un `<select>` nativo se puede vestir por fuera, pero su lista la dibuja el sistema
 * operativo: por dentro sigue siendo una ventana gris con la tipografía del escritorio, que
 * es justo lo que rompía la pantalla de filtros. Aquí la lista es HTML, así que hereda la
 * superficie, el radio, la sombra y el tema de la aplicación, y además caben cosas que un
 * `<option>` no admite: el icono de la categoría y su número de movimientos.
 *
 * Cuando las opciones pasan de un puñado aparece un buscador dentro del panel. Es lo que
 * separa un desplegable de un combobox de verdad, y con dos docenas de tags recorrer la
 * lista con la vista deja de ser razonable.
 *
 * Se comporta como espera un lector de pantalla: el control anuncia que despliega una lista,
 * la lista anuncia cuál es la opción activa, y el teclado la recorre sin que el foco salte
 * de sitio.
 */
@Component({
  selector: 'fs-select-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(keydown.escape)': 'close()',
  },
  template: `
    <button
      #trigger
      type="button"
      class="fs-select"
      role="combobox"
      aria-haspopup="listbox"
      [attr.id]="inputId()"
      [attr.aria-label]="ariaLabel()"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="listId"
      [attr.aria-activedescendant]="open() && !searchable() ? optionId(activeIndex()) : null"
      [disabled]="disabled()"
      (click)="toggle()"
      (keydown)="onKeydown($event)"
    >
      @if (selected(); as option) {
        @if (option.icon) {
          <i class="bi {{ option.icon }} fs-select__icon" aria-hidden="true"></i>
        }
        <span class="fs-select__label text-truncate">{{ option.label }}</span>
      }
      <i class="bi bi-chevron-down fs-select__caret" aria-hidden="true"></i>
    </button>

    @if (open()) {
      <div class="fs-select__panel" animate.enter="fs-anim-expand">
        @if (searchable()) {
          <div class="fs-select__search">
            <i class="bi bi-search" aria-hidden="true"></i>
            <input
              #search
              type="text"
              role="combobox"
              autocomplete="off"
              placeholder="Buscar…"
              aria-haspopup="listbox"
              aria-expanded="true"
              [attr.aria-controls]="listId"
              [attr.aria-activedescendant]="optionId(activeIndex())"
              [attr.aria-label]="'Buscar en ' + (ariaLabel() ?? 'la lista')"
              [value]="query()"
              (input)="onSearch($any($event.target).value)"
              (keydown)="onKeydown($event)"
            />
          </div>
        }

        <ul class="fs-select__list" role="listbox" [id]="listId">
          @for (option of filtered(); track option.value; let index = $index) {
            <li
              class="fs-select__option"
              role="option"
              [id]="optionId(index)"
              [class.is-active]="activeIndex() === index"
              [class.is-selected]="value() === option.value"
              [attr.aria-selected]="value() === option.value"
              (click)="pick(option)"
              (mouseenter)="activeIndex.set(index)"
            >
              @if (option.icon) {
                <i class="bi {{ option.icon }} fs-select__icon" aria-hidden="true"></i>
              }
              <span class="fs-select__label text-truncate">{{ option.label }}</span>
              @if (option.hint) {
                <span class="fs-select__hint fs-num">{{ option.hint }}</span>
              }
              @if (value() === option.value) {
                <i class="bi bi-check2 fs-select__check" aria-hidden="true"></i>
              }
            </li>
          } @empty {
            <li class="fs-select__empty">Nada coincide con «{{ query() }}»</li>
          }
        </ul>
      </div>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: inline-block;
    }

    .fs-select {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      width: 100%;
      padding: 0.4rem 0.7rem;
      border: 1px solid var(--fs-line);
      border-radius: var(--fs-radius);
      background-color: var(--fs-surface-sunken);
      color: var(--fs-ink);
      font-size: 0.9375rem;
      text-align: left;
      transition:
        border-color 0.15s ease,
        box-shadow 0.15s ease;
    }

    .fs-select:hover {
      border-color: var(--fs-ink-muted);
    }

    .fs-select[aria-expanded='true'],
    .fs-select:focus-visible {
      border-color: var(--fs-brand);
      box-shadow: 0 0 0 0.2rem rgba(var(--fs-brand-rgb), 0.15);
    }

    .fs-select:disabled {
      opacity: 0.6;
    }

    .fs-select__label {
      flex: 1;
      min-width: 0;
    }

    .fs-select__icon {
      flex: none;
      color: var(--fs-ink-muted);
      font-size: 0.9rem;
    }

    .fs-select__caret {
      flex: none;
      color: var(--fs-ink-muted);
      font-size: 0.7rem;
      transition: transform 0.15s ease;
    }

    .fs-select[aria-expanded='true'] .fs-select__caret {
      transform: rotate(180deg);
    }

    /* El panel es una superficie más de la aplicación: mismo papel, mismo radio y la sombra
       de las cosas que flotan. */
    .fs-select__panel {
      position: absolute;
      z-index: 1040;
      top: calc(100% + 0.35rem);
      left: 0;
      min-width: 100%;
      max-width: min(22rem, 80vw);
      padding: 0.3rem;
      border: 1px solid var(--fs-line);
      border-radius: var(--fs-radius);
      background-color: var(--fs-surface);
      box-shadow: var(--fs-shadow-raised);
    }

    .fs-select__search {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      padding: 0.35rem 0.6rem;
      margin-bottom: 0.3rem;
      border-bottom: 1px solid var(--fs-line);
      color: var(--fs-ink-muted);
      font-size: 0.85rem;
    }

    .fs-select__search input {
      flex: 1;
      min-width: 0;
      border: none;
      background: none;
      color: var(--fs-ink);
      font-size: 0.9375rem;
    }

    .fs-select__search input:focus {
      outline: none;
    }

    .fs-select__list {
      max-height: 14rem;
      overflow-y: auto;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .fs-select__option {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.45rem 0.6rem;
      border-radius: 0.5rem;
      font-size: 0.9375rem;
      white-space: nowrap;
      cursor: pointer;
    }

    /* Una sola marca de «dónde estoy», la lleve el ratón o el teclado. */
    .fs-select__option.is-active {
      background-color: var(--fs-hover);
    }

    .fs-select__option.is-selected {
      color: var(--fs-brand);
      font-weight: 500;
    }

    .fs-select__hint {
      margin-left: auto;
      font-size: 0.8125rem;
      color: var(--fs-ink-faint);
    }

    .fs-select__check {
      flex: none;
      color: var(--fs-brand);
      font-size: 0.9rem;
    }

    .fs-select__empty {
      padding: 0.6rem;
      font-size: 0.875rem;
      color: var(--fs-ink-faint);
    }
  `,
})
export class SelectFieldComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly options = input.required<SelectOption[]>();

  /** Valor elegido. La cadena vacía suele ser la opción de «sin filtro». */
  readonly value = model<string>('');

  readonly inputId = input<string | null>(null);
  readonly ariaLabel = input<string | null>(null);
  readonly disabled = input(false);

  protected readonly open = signal(false);
  protected readonly activeIndex = signal(0);
  protected readonly query = signal('');

  protected readonly listId = `selectPanel-${nextId++}`;

  /** La opción elegida, o la primera si el valor no está en la lista. */
  protected readonly selected = computed(
    () => this.options().find((option) => option.value === this.value()) ?? this.options()[0],
  );

  /** Con pocas opciones el buscador estorba más de lo que ayuda. */
  protected readonly searchable = computed(() => this.options().length > SEARCH_THRESHOLD);

  /** Lo que se está enseñando: todo, o lo que coincide con lo escrito. */
  protected readonly filtered = computed(() => {
    const query = normalise(this.query());
    if (!query) {
      return this.options();
    }
    return this.options().filter((option) => normalise(option.label).includes(query));
  });

  constructor() {
    // Al abrir, la opción elegida es de donde parte el teclado, y el buscador empieza vacío.
    effect(() => {
      if (this.open()) {
        this.query.set('');
        const index = this.options().findIndex((option) => option.value === this.value());
        this.activeIndex.set(index < 0 ? 0 : index);
        this.focusSearch();
      }
    });
  }

  protected optionId(index: number): string {
    return `${this.listId}-${index}`;
  }

  protected toggle(): void {
    this.open.set(!this.open());
  }

  protected close(): void {
    this.open.set(false);
  }

  protected pick(option: SelectOption): void {
    this.value.set(option.value);
    this.close();
  }

  /** Al escribir, la opción activa vuelve a la primera de las que quedan. */
  protected onSearch(query: string): void {
    this.query.set(query);
    this.activeIndex.set(0);
  }

  /**
   * Recorre la lista sin que el foco salte de sitio: se queda en el control y va anunciando
   * cuál es la opción activa, que es lo que espera el patrón de combobox.
   *
   * @param event pulsación recibida
   */
  protected onKeydown(event: KeyboardEvent): void {
    const options = this.filtered();

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();
        if (!this.open()) {
          this.open.set(true);
          return;
        }
        if (!options.length) {
          return;
        }
        const step = event.key === 'ArrowDown' ? 1 : -1;
        const next = (this.activeIndex() + step + options.length) % options.length;
        this.activeIndex.set(next);
        this.scrollActiveIntoView(next);
        return;
      }
      case 'Home':
      case 'End':
        if (this.open() && options.length) {
          event.preventDefault();
          const index = event.key === 'Home' ? 0 : options.length - 1;
          this.activeIndex.set(index);
          this.scrollActiveIntoView(index);
        }
        return;
      case 'Enter':
        if (this.open() && options.length) {
          event.preventDefault();
          this.pick(options[this.activeIndex()]);
        }
        return;
      case ' ':
        // El espacio elige solo cuando no se está escribiendo: dentro del buscador es un
        // carácter más.
        if (this.open() && options.length && !this.searchable()) {
          event.preventDefault();
          this.pick(options[this.activeIndex()]);
        }
        return;
      case 'Tab':
        this.close();
        return;
      default:
        return;
    }
  }

  /** Cierra al pulsar fuera, que es lo que hace cualquier desplegable. */
  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.close();
    }
  }

  /** Lleva el foco al buscador en cuanto aparece, para poder escribir sin tocar nada más. */
  private focusSearch(): void {
    if (!this.searchable()) {
      return;
    }
    requestAnimationFrame(() => {
      this.host.nativeElement.querySelector<HTMLInputElement>('.fs-select__search input')?.focus();
    });
  }

  /** Mantiene a la vista la opción que recorre el teclado. */
  private scrollActiveIntoView(index: number): void {
    const option = this.host.nativeElement.querySelector<HTMLElement>(`#${this.optionId(index)}`);
    option?.scrollIntoView({ block: 'nearest' });
  }
}

/**
 * Deja el texto comparable: en minúsculas y sin tildes, para que «educacion» encuentre
 * «Educación».
 *
 * @param value texto a normalizar
 * @return el texto comparable
 */
function normalise(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}
