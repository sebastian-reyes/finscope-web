import {
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
import { TagResponse } from '../../core/models';
import { Spot, anchorSpot } from './anchor';
import { TagChipComponent } from './tag-chip';

/** Longitud que admite el contrato para un nombre de tag. */
const MAX_LENGTH = 70;

/** Cuántos tags del catálogo se ofrecen de un toque antes de que la fila se haga larga. */
const SUGGESTION_COUNT = 8;

/** Contador para que cada instancia tenga identificadores propios. */
let nextId = 1;

/**
 * Deja un nombre en lo esencial para compararlo: sin mayúsculas y sin tildes.
 * Buscar «alimentacion» tiene que encontrar «alimentación»; si no, se acaba creando el tag
 * dos veces, una con tilde y otra sin ella, que es justo lo que hay que evitar.
 *
 * @param value nombre a normalizar
 * @return el nombre plegado
 */
function fold(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

/**
 * Campo para los tags de un movimiento.
 *
 * Un movimiento puede llevar varios, así que se escriben como fichas y no como un texto
 * separado por comas: así se ve cuántos hay, cada uno conserva el color y el icono con el
 * que aparece en el resto de la aplicación, y quitar uno no obliga a reeditar una frase.
 * La API reemplaza el conjunto entero al guardar, de modo que lo que quede aquí es lo que
 * tendrá el movimiento.
 *
 * Buscar en el catálogo lo hace un desplegable propio y no el `datalist` del navegador. Aquel
 * se ve distinto en cada navegador, no se puede vestir, en un móvil casi no aparece y no deja
 * moverse con las flechas. Con cuatro tags daba igual; con cuarenta, el que se busca no está
 * entre los que se ofrecen de un toque y hay que escribirlo entero a ciegas —y una tilde de
 * más acaba creando el mismo tag dos veces—. El desplegable filtra el catálogo entero según lo
 * que se escribe, ignorando mayúsculas y tildes, y dice en voz alta cuándo se está creando uno
 * nuevo en lugar de reutilizar el que ya existe.
 */
@Component({
  selector: 'fs-tags-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TagChipComponent],
  template: `
    <div class="fs-tags" #box [class.is-disabled]="disabled()">
      @for (tag of tags(); track tag) {
        <button
          type="button"
          class="fs-tags__item"
          animate.enter="fs-anim-pop"
          [disabled]="disabled()"
          [attr.aria-label]="'Quitar el tag ' + tag"
          (click)="remove(tag)"
        >
          <fs-tag-chip [name]="tag" />
          <span class="fs-tags__x" aria-hidden="true"><i class="bi bi-x"></i></span>
        </button>
      }

      <input
        #field
        class="fs-tags__input"
        type="text"
        role="combobox"
        [id]="inputId()"
        [value]="draft()"
        [disabled]="disabled()"
        [placeholder]="tags().length ? 'Añadir otro…' : 'alimentación, transporte…'"
        maxlength="70"
        autocomplete="off"
        aria-autocomplete="list"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="panelId"
        [attr.aria-activedescendant]="open() ? optionId(active()) : null"
        (focus)="openPanel()"
        (input)="onInput($any($event.target).value)"
        (keydown)="onKeydown($event)"
        (blur)="onBlur()"
      />
    </div>

    @if (open() && total()) {
      <!-- El ratón se para antes de robar el foco: sin esto, la salida del campo cerraría el
           desplegable antes de que llegase a contarse el clic sobre la opción. -->
      <div
        #panel
        class="fs-picker"
        [id]="panelId"
        role="listbox"
        [attr.aria-label]="'Tus tags'"
        [style.top.px]="spot().top"
        [style.left.px]="spot().left"
        [style.width.px]="width()"
        animate.enter="is-in"
        (mousedown)="$event.preventDefault()"
      >
        @for (tag of matches(); track tag.id; let index = $index) {
          <button
            type="button"
            role="option"
            class="fs-picker__item"
            [id]="optionId(index)"
            [class.is-active]="active() === index"
            [attr.aria-selected]="active() === index"
            (mousemove)="active.set(index)"
            (click)="add(tag.name)"
          >
            <fs-tag-chip [name]="tag.name" />
            <span class="fs-picker__count fs-num">
              {{ tag.transactionCount }}
            </span>
          </button>
        }

        @if (creatable(); as name) {
          <button
            type="button"
            role="option"
            class="fs-picker__item fs-picker__create"
            [id]="optionId(matches().length)"
            [class.is-active]="active() === matches().length"
            [attr.aria-selected]="active() === matches().length"
            (mousemove)="active.set(matches().length)"
            (click)="add(name)"
          >
            <i class="bi bi-plus-lg" aria-hidden="true"></i>
            <span class="text-truncate">Crear «{{ name }}»</span>
          </button>
        }
      </div>
    }

    @if (suggestions().length) {
      <div class="fs-tags__suggestions" role="group" aria-label="Tags que ya usas">
        @for (tag of suggestions(); track tag.id) {
          <button
            type="button"
            class="fs-tags__suggestion"
            [disabled]="disabled()"
            [attr.aria-label]="'Añadir el tag ' + tag.name"
            (click)="add(tag.name)"
          >
            <fs-tag-chip [name]="tag.name" />
          </button>
        }
      </div>
    }
  `,
  styles: `
    /* La caja imita a un campo de formulario para que se lea como tal, pero por dentro es
       una fila que envuelve: las fichas y el texto que se escribe comparten el mismo sitio. */
    .fs-tags {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.4rem;
      min-height: 2.9rem;
      padding: 0.4rem 0.6rem;
      border: 1px solid var(--fs-line);
      border-radius: var(--fs-radius);
      background-color: var(--fs-surface-sunken);
      transition:
        border-color 0.15s ease,
        box-shadow 0.15s ease;
    }

    .fs-tags:focus-within {
      border-color: var(--fs-brand);
      box-shadow: 0 0 0 0.2rem rgba(var(--fs-brand-rgb), 0.15);
    }

    .fs-tags.is-disabled {
      opacity: 0.6;
    }

    .fs-tags__item {
      position: relative;
      padding: 0;
      border: none;
      background: none;
      line-height: 0;
      border-radius: 999px;
      outline-offset: 2px;
    }

    /* La cruz está siempre visible y no solo al pasar el ratón: en un móvil no hay ratón
       que pasar, y un tag que no se sabe quitar acaba quedándose donde no debe. */
    .fs-tags__x {
      position: absolute;
      top: -0.25rem;
      right: -0.25rem;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 1.05rem;
      height: 1.05rem;
      border-radius: 50%;
      background-color: var(--fs-ink-muted);
      color: var(--fs-surface);
      font-size: 0.7rem;
      line-height: 1;
    }

    .fs-tags__item:hover .fs-tags__x,
    .fs-tags__item:focus-visible .fs-tags__x {
      background-color: var(--fs-expense);
    }

    .fs-tags__input {
      flex: 1;
      min-width: 7rem;
      padding: 0.15rem 0;
      border: none;
      background: none;
      color: var(--fs-ink);
      font-size: 0.9375rem;
    }

    .fs-tags__input:focus {
      outline: none;
    }

    /* --- El desplegable ------------------------------------------------------------------
       Fijo a la ventana y colocado desde las medidas del campo: dentro de la hoja del editor,
       que recorta lo que se sale y tiene su propio desplazamiento, uno absoluto se cortaría
       por abajo o se iría con el scroll. */
    .fs-picker {
      position: fixed;
      z-index: 1061;
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
      max-height: 15rem;
      padding: 0.35rem;
      overflow-y: auto;
      overscroll-behavior: contain;
      scrollbar-width: thin;
      border: 1px solid var(--fs-line);
      border-radius: var(--fs-radius);
      background-color: var(--fs-surface);
      box-shadow: var(--fs-shadow-raised);
    }

    .fs-picker.is-in {
      animation: fs-picker-in 0.16s cubic-bezier(0.22, 1, 0.36, 1) both;
    }

    @keyframes fs-picker-in {
      from {
        opacity: 0;
        transform: translateY(-0.3rem);
      }
    }

    .fs-picker__item {
      display: flex;
      flex: none;
      align-items: center;
      gap: 0.5rem;
      padding: 0.35rem 0.5rem;
      border: none;
      border-radius: 0.5rem;
      background: none;
      color: var(--fs-ink);
      font-size: 0.875rem;
      text-align: left;
    }

    /* La opción marcada lo está tanto si se llegó a ella con las flechas como con el ratón:
       es la que se añade al pulsar intro, y eso tiene que verse sin tener que adivinarlo. */
    .fs-picker__item.is-active {
      background-color: var(--fs-hover);
    }

    .fs-picker__count {
      margin-left: auto;
      padding-left: 0.5rem;
      font-size: var(--fs-text-xs);
      color: var(--fs-ink-faint);
    }

    /* Crear uno nuevo se separa de reutilizar los que ya existen: es la única opción de la
       lista que cambia el catálogo. */
    .fs-picker__create {
      margin-top: 0.15rem;
      padding-top: 0.5rem;
      border-top: 1px solid var(--fs-line);
      border-radius: 0 0 0.5rem 0.5rem;
      color: var(--fs-brand);
      font-weight: 500;
    }

    .fs-tags__suggestions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin-top: 0.6rem;
    }

    .fs-tags__suggestion {
      padding: 0;
      border: none;
      background: none;
      border-radius: 999px;
      line-height: 0;
      opacity: 0.75;
      outline-offset: 2px;
      transition:
        opacity 0.12s ease,
        transform 0.12s ease;
    }

    .fs-tags__suggestion:hover {
      opacity: 1;
    }

    .fs-tags__suggestion:active {
      transform: scale(0.96);
    }

    .fs-tags__suggestion:disabled {
      opacity: 0.4;
    }
  `,
})
export class TagsFieldComponent implements OnDestroy {
  private readonly injector = inject(Injector);

  private readonly box = viewChild<ElementRef<HTMLElement>>('box');
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  /** Tags del movimiento. Es un modelo porque el campo los añade y los quita por su cuenta. */
  readonly tags = model<string[]>([]);

  /** Catálogo del usuario, para autocompletar y para sugerir los que más usa. */
  readonly catalogue = input<TagResponse[]>([]);

  readonly disabled = input(false);

  /** Identificador del `input`, para que la etiqueta de fuera pueda apuntarle. */
  readonly inputId = input('tagsField');

  /** Texto que se está escribiendo y que todavía no es un tag. */
  protected readonly draft = signal('');

  /** Si el desplegable está abierto. */
  protected readonly open = signal(false);

  /** Opción marcada, la que se añade al pulsar intro. */
  protected readonly active = signal(0);

  /** Esquina y ancho del desplegable, en coordenadas de la ventana. */
  protected readonly spot = signal<Spot>({ top: 0, left: 0 });
  protected readonly width = signal(0);

  private readonly instance = nextId++;
  protected readonly panelId = `tagsPicker-${this.instance}`;

  /**
   * El catálogo que encaja con lo que se está escribiendo, sin los que ya lleva el
   * movimiento y ordenado por uso.
   *
   * Por uso y no por orden alfabético porque aquí no se recorre una lista, se busca lo que
   * ya se hizo otras veces; y con el campo vacío el catálogo entero, que es la forma de ver
   * qué hay sin tener que acertar la primera letra.
   */
  protected readonly matches = computed(() => {
    const picked = new Set(this.tags().map(fold));
    const needle = fold(this.draft());
    return [...this.catalogue()]
      .filter((tag) => !picked.has(fold(tag.name)) && (!needle || fold(tag.name).includes(needle)))
      .sort(
        (left, right) =>
          right.transactionCount - left.transactionCount || left.name.localeCompare(right.name),
      );
  });

  /**
   * El nombre que se crearía, o vacío si no hay nada que crear.
   * Solo aparece cuando lo escrito no es ya un tag del catálogo ni uno de los puestos: si
   * existe, lo que toca es reutilizarlo, y ofrecer crearlo invitaría a duplicarlo.
   */
  protected readonly creatable = computed(() => {
    const value = this.draft().trim().slice(0, MAX_LENGTH);
    if (!value) {
      return '';
    }
    const needle = fold(value);
    const known = [...this.catalogue().map((tag) => tag.name), ...this.tags()];
    return known.some((name) => fold(name) === needle) ? '' : value;
  });

  /** Cuántas opciones hay en total, contando la de crear. */
  protected readonly total = computed(() => this.matches().length + (this.creatable() ? 1 : 0));

  /**
   * Los tags que más usa y que este movimiento todavía no lleva.
   * Se ordenan por uso y no alfabéticamente porque aquí no se busca un tag concreto, se
   * repite el de siempre; el resto sigue estando al alcance escribiendo.
   */
  protected readonly suggestions = computed(() => {
    const picked = new Set(this.tags().map((tag) => tag.toLowerCase()));
    return [...this.catalogue()]
      .filter((tag) => !picked.has(tag.name.toLowerCase()))
      .sort(
        (left, right) =>
          right.transactionCount - left.transactionCount || left.name.localeCompare(right.name),
      )
      .slice(0, SUGGESTION_COUNT);
  });

  constructor() {
    // El desplegable se coloca cada vez que cambia lo que enseña: al escribir crece y mengua,
    // y si estaba volteado hacia arriba su borde inferior se movería con él.
    effect(() => {
      this.open();
      this.total();
      if (this.open()) {
        afterNextRender({ mixedReadWrite: () => this.place() }, { injector: this.injector });
      }
    });
  }

  ngOnDestroy(): void {
    this.stopFollowing();
  }

  protected optionId(index: number): string {
    return `tagsOption-${this.instance}-${index}`;
  }

  protected openPanel(): void {
    if (this.open()) {
      return;
    }
    this.active.set(0);
    this.open.set(true);
    // Va fijo a la ventana, así que lo que se desplace por debajo no lo arrastra: hay que
    // volver a colocarlo. En captura, porque el desplazamiento del cuerpo de la hoja del
    // editor no llega a la ventana por sí solo.
    window.addEventListener('scroll', this.follow, { capture: true, passive: true });
    window.addEventListener('resize', this.follow);
  }

  protected closePanel(): void {
    this.stopFollowing();
    this.open.set(false);
  }

  /**
   * Recoge lo que se escribe y vuelve a marcar la primera opción.
   * La primera es la más usada de las que encajan, que es la que se quiere el noventa por
   * ciento de las veces: así escribir tres letras y pulsar intro acierta sin mirar.
   *
   * @param value texto que hay ahora en el campo
   */
  protected onInput(value: string): void {
    this.draft.set(value);
    this.active.set(0);
    this.openPanel();
  }

  /** Al salir del campo se cierra el desplegable y se queda lo escrito, si había algo. */
  protected onBlur(): void {
    this.closePanel();
    this.commit();
  }

  /**
   * Atajos de teclado del campo.
   *
   * Las flechas recorren el desplegable y el intro elige lo marcado, que es lo que evita
   * crear «alimentacion» teniendo ya «alimentación». La coma cierra el tag tal cual está
   * escrito, que es lo que se espera al separar de corrido. El retroceso sobre un campo
   * vacío borra el último, como cualquier campo de fichas.
   *
   * @param event pulsación recibida en el campo de texto
   */
  protected onKeydown(event: KeyboardEvent): void {
    const total = this.total();

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.openPanel();
      if (total) {
        const step = event.key === 'ArrowDown' ? 1 : -1;
        this.active.set((this.active() + step + total) % total);
      }
      return;
    }

    if (event.key === 'Escape') {
      this.closePanel();
      return;
    }

    if (event.key === 'Enter') {
      // Sin esto, el intro enviaría el formulario entero con el tag a medio escribir.
      event.preventDefault();
      const chosen = this.optionAt(this.active());
      if (this.open() && chosen) {
        this.add(chosen);
      } else {
        this.commit();
      }
      return;
    }

    if (event.key === ',') {
      event.preventDefault();
      this.commit();
      return;
    }

    if (event.key === 'Backspace' && !this.draft()) {
      const current = this.tags();
      if (current.length) {
        this.tags.set(current.slice(0, -1));
      }
    }
  }

  /**
   * El nombre que hay en una posición del desplegable, contando la opción de crear.
   *
   * @param index posición marcada
   * @return el nombre, o vacío si ahí no hay ninguna opción
   */
  private optionAt(index: number): string {
    const matches = this.matches();
    return index < matches.length ? matches[index].name : this.creatable();
  }

  /** Deja el desplegable pegado al campo, y encima de él si abajo no cabe. */
  private place(): void {
    const box = this.box()?.nativeElement;
    const panel = this.panel()?.nativeElement;
    if (!box || !panel) {
      return;
    }
    const anchor = box.getBoundingClientRect();
    this.width.set(anchor.width);
    this.spot.set(
      anchorSpot(
        anchor,
        { width: anchor.width, height: panel.offsetHeight },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }

  /** Frame pedido para la próxima recolocación, o cero si no hay ninguno pendiente. */
  private pending = 0;

  /** Se mide una sola vez por frame: un scroll dispara decenas de sucesos seguidos. */
  private readonly follow = (): void => {
    if (this.pending) {
      return;
    }
    this.pending = requestAnimationFrame(() => {
      this.pending = 0;
      this.place();
    });
  };

  private stopFollowing(): void {
    window.removeEventListener('scroll', this.follow, { capture: true });
    window.removeEventListener('resize', this.follow);
    cancelAnimationFrame(this.pending);
    this.pending = 0;
  }

  /**
   * Convierte en tag lo que haya escrito, si es que hay algo.
   * Se llama también al salir del campo: quien escribe un tag y va directo a guardar da por
   * hecho que cuenta, y perderlo por no haber pulsado intro sería una trampa.
   */
  protected commit(): void {
    const value = this.draft().trim();
    if (value) {
      this.add(value);
    }
    this.draft.set('');
  }

  /**
   * Añade un tag descartando los repetidos.
   * La comparación ignora las mayúsculas igual que la API, que reutiliza el tag existente
   * en vez de crear uno nuevo: sin esto se verían dos fichas que al guardar serían una.
   *
   * @param name nombre del tag a añadir
   */
  protected add(name: string): void {
    const value = name.trim().slice(0, MAX_LENGTH);
    if (!value) {
      return;
    }
    const exists = this.tags().some((tag) => tag.toLowerCase() === value.toLowerCase());
    if (!exists) {
      this.tags.set([...this.tags(), value]);
    }
    this.draft.set('');
  }

  protected remove(name: string): void {
    this.tags.set(this.tags().filter((tag) => tag !== name));
  }
}
