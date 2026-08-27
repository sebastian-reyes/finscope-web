import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { FinscopeService } from '../../core/finscope.service';
import { ToastService } from '../../core/toast.service';
import { describeError } from '../../core/api-error';
import { CategoryResponse, TransactionTypeCode } from '../../core/models';
import { CategoryChipComponent } from './category-chip';

/** Cuántas categorías se ven sin desplegar. Más allá, la fila deja de leerse de un vistazo. */
const VISIBLE_COUNT = 8;

/**
 * Selector de la categoría de un movimiento.
 *
 * La categoría es obligatoria y se elige de un toque: las que más usa el usuario van
 * delante y el resto queda a un «ver todas», de modo que registrar no gana ningún paso ni
 * ningún desplegable que haya que abrir para saber qué hay dentro.
 *
 * No se preselecciona ninguna a propósito. Elegir por el usuario ahorraría un toque, pero
 * clasificaría el gasto con una categoría que nadie ha mirado, y un dato financiero puesto
 * por defecto es peor que uno que cuesta un toque.
 *
 * También se puede crear una aquí mismo. Como sin categoría no hay movimiento que registrar,
 * mandar al catálogo cuando falta una dejaría el formulario a medias y el gasto sin apuntar.
 */
@Component({
  selector: 'fs-category-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CategoryChipComponent],
  template: `
    <div class="fs-picker" role="group" aria-label="Categoría del movimiento">
      @for (category of visible(); track category.id) {
        <button
          type="button"
          class="fs-picker__option"
          [class.is-picked]="selected() === category.id"
          [attr.aria-pressed]="selected() === category.id"
          [disabled]="disabled()"
          (click)="pick(category.id)"
        >
          <fs-category-chip [name]="category.name" />
        </button>
      }

      @if (hidden() > 0) {
        <button
          type="button"
          class="fs-picker__more"
          [disabled]="disabled()"
          (click)="expanded.set(true)"
        >
          Ver {{ hidden() }} más
        </button>
      }

      @if (!creating()) {
        <button
          type="button"
          class="fs-picker__more"
          [disabled]="disabled()"
          (click)="startCreate()"
        >
          <i class="bi bi-plus-lg" aria-hidden="true"></i> Nueva
        </button>
      }
    </div>

    @if (creating()) {
      <div class="fs-picker__create" animate.enter="fs-anim-expand">
        <input
          type="text"
          class="fs-field fs-field--sm"
          maxlength="70"
          autocomplete="off"
          placeholder="Nombre de la categoría"
          [value]="draft()"
          [disabled]="saving()"
          (input)="draft.set($any($event.target).value)"
          (keydown.enter)="create($event)"
          (keydown.escape)="cancelCreate()"
        />
        <button
          type="button"
          class="fs-btn fs-btn--sm fs-btn--solid"
          [disabled]="saving() || !draft().trim()"
          (click)="create()"
        >
          Crear
        </button>
        <button type="button" class="fs-btn fs-btn--sm fs-btn--ghost" (click)="cancelCreate()">
          Cancelar
        </button>
        <p class="fs-picker__hint">
          Se creará para {{ kind() === 'INCOME' ? 'ingresos' : 'egresos' }} y quedará en tu
          catálogo.
        </p>
      </div>
    }

    @if (!applicable().length && !creating()) {
      <p class="fs-picker__hint">
        No tienes ninguna categoría para {{ kind() === 'INCOME' ? 'ingresos' : 'egresos' }}. Crea la
        primera con el botón de arriba.
      </p>
    }
  `,
  styles: `
    .fs-picker {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.4rem;
    }

    .fs-picker__option {
      padding: 0;
      border: none;
      background: none;
      border-radius: 999px;
      line-height: 0;
      opacity: 0.7;
      outline-offset: 2px;
      transition:
        opacity 0.12s ease,
        transform 0.12s ease,
        box-shadow 0.12s ease;
    }

    .fs-picker__option:hover {
      opacity: 1;
    }

    .fs-picker__option:active {
      transform: scale(0.96);
    }

    /* Elegida: un aro en vez de un cambio de color, para no pisar el color propio de la
       categoría, que es lo que la hace reconocible. */
    .fs-picker__option.is-picked {
      opacity: 1;
      box-shadow: 0 0 0 2px var(--fs-brand);
    }

    .fs-picker__option:disabled {
      opacity: 0.4;
    }

    .fs-picker__more {
      padding: 0.25rem 0.7rem;
      border: 1px dashed var(--fs-line);
      border-radius: 999px;
      background: none;
      font-size: 0.8125rem;
      color: var(--fs-ink-muted);
    }

    .fs-picker__more:hover {
      border-style: solid;
      color: var(--fs-ink);
    }

    .fs-picker__create {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
      margin-top: 0.6rem;
    }

    .fs-picker__create .form-control {
      flex: 1;
      min-width: 9rem;
    }

    .fs-picker__hint {
      width: 100%;
      margin: 0.5rem 0 0;
      font-size: 0.75rem;
      color: var(--fs-ink-faint);
    }

    .fs-muted {
      color: var(--fs-ink-muted);
      text-decoration: none;
    }
  `,
})
export class CategoryPickerComponent {
  private readonly api = inject(FinscopeService);
  private readonly toasts = inject(ToastService);

  /** Catálogo completo del usuario. Aquí se filtra por el tipo de movimiento. */
  readonly categories = input.required<CategoryResponse[]>();

  /** Tipo del movimiento que se está registrando. */
  readonly kind = input.required<TransactionTypeCode>();

  readonly disabled = input(false);

  /** Categoría elegida, o nulo mientras no se haya elegido ninguna. */
  readonly selected = model<number | null>(null);

  /** Se ha creado una categoría: quien use el selector debería recargar su catálogo. */
  readonly created = output<CategoryResponse>();

  protected readonly expanded = signal(false);
  protected readonly creating = signal(false);
  protected readonly saving = signal(false);
  protected readonly draft = signal('');

  /**
   * Categorías creadas desde aquí.
   * Se conservan en local hasta que el catálogo de fuera vuelva a cargarse: sin esto, la
   * recién creada no estaría en la lista y quedaría elegida una categoría que el selector
   * no conoce, que es justo lo que el efecto de más abajo suelta.
   */
  private readonly justCreated = signal<CategoryResponse[]>([]);

  /**
   * Las categorías que admiten este tipo de movimiento, las más usadas primero.
   * El orden por uso es lo que hace que la de siempre esté casi siempre en el primer
   * puñado; el nombre desempata para que la fila no baile entre recargas.
   */
  protected readonly applicable = computed(() => {
    const known = new Set(this.categories().map((category) => category.id));
    const all = [
      ...this.categories(),
      ...this.justCreated().filter((category) => !known.has(category.id)),
    ];
    return all
      .filter((category) => category.appliesTo === 'BOTH' || category.appliesTo === this.kind())
      .sort(
        (left, right) =>
          right.transactionCount - left.transactionCount || left.name.localeCompare(right.name),
      );
  });

  protected readonly visible = computed(() =>
    this.expanded() ? this.applicable() : this.applicable().slice(0, VISIBLE_COUNT),
  );

  protected readonly hidden = computed(() => this.applicable().length - this.visible().length);

  constructor() {
    // Al cambiar de egreso a ingreso, la categoría elegida puede dejar de tener sentido.
    // Se suelta en lugar de arrastrarla: guardar un ingreso como «Comida» sería un dato
    // sin significado, y la API además lo rechazaría.
    effect(() => {
      const selected = this.selected();
      if (selected === null) {
        return;
      }
      const stillValid = this.applicable().some((category) => category.id === selected);
      if (!stillValid) {
        this.selected.set(null);
      }
    });
  }

  protected pick(id: number): void {
    this.selected.set(this.selected() === id ? null : id);
  }

  protected startCreate(): void {
    this.creating.set(true);
    this.draft.set('');
  }

  protected cancelCreate(): void {
    this.creating.set(false);
    this.draft.set('');
  }

  /**
   * Crea la categoría y la deja elegida.
   * Nace con el ámbito del movimiento que se está registrando, que es lo único que se sabe
   * de ella en este momento; afinarlo después es cosa del catálogo.
   *
   * @param event pulsación del intro, que no debe enviar el formulario de alrededor
   */
  protected create(event?: Event): void {
    event?.preventDefault();
    const name = this.draft().trim();
    if (!name || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.api.createCategory(name, this.kind()).subscribe({
      next: (category) => {
        this.justCreated.update((current) => [...current, category]);
        this.selected.set(category.id);
        this.saving.set(false);
        this.creating.set(false);
        this.draft.set('');
        this.toasts.success(`Categoría «${category.name}» creada`);
        this.created.emit(category);
      },
      error: (error) => {
        this.toasts.error(describeError(error));
        this.saving.set(false);
      },
    });
  }
}
