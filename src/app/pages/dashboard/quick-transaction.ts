import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CategoryPickerComponent } from '../../shared/ui/category-picker';
import { DateFieldComponent } from '../../shared/ui/date-field';
import { TagsFieldComponent } from '../../shared/ui/tags-field';
import { FinscopeService } from '../../core/finscope.service';
import { ToastService } from '../../core/toast.service';
import { describeError } from '../../core/api-error';
import { CURRENCY_SYMBOL } from '../../core/format/money';
import { toApiDateTime } from '../../core/format/period';
import {
  CategoryResponse,
  CreateTransactionRequest,
  TagResponse,
  TransactionTypeCode,
  TransactionTypeResponse,
} from '../../core/models';

/**
 * Registro de un movimiento.
 *
 * Es la acción por la que se abre la aplicación, así que el camino corto es el que se ve:
 * importe, egreso o ingreso, categoría y guardar. La categoría se elige de un toque entre
 * las que más se usan, que es lo que evita que obligarla alargue el formulario. Los tags
 * son opcionales de verdad —si no se escribe ninguno la petición sale sin `tags`— y admiten
 * varios, igual que en el editor; la fecha y la descripción viven plegadas, porque la
 * mayoría de las veces la fecha correcta es ahora.
 */
@Component({
  selector: 'fs-quick-transaction',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, CategoryPickerComponent, DateFieldComponent, TagsFieldComponent],
  templateUrl: './quick-transaction.html',
  styleUrl: './quick-transaction.scss',
})
export class QuickTransactionComponent {
  private readonly api = inject(FinscopeService);
  private readonly toasts = inject(ToastService);
  private readonly formBuilder = inject(FormBuilder);

  /** Catálogo global de tipos, del que sale el identificador que espera la API. */
  readonly types = input.required<TransactionTypeResponse[]>();
  /** Catálogo de categorías del usuario, de donde sale la clasificación principal. */
  readonly categories = input.required<CategoryResponse[]>();
  readonly tags = input.required<TagResponse[]>();
  /**
   * Marca de la petición de registrar. Cada valor nuevo se lleva el foco al importe.
   * Es un número y no un booleano porque hay que poder pedirlo dos veces seguidas.
   */
  readonly focusRequest = input<number | null>(null);

  /**
   * Avisa de que hay un movimiento nuevo para que el dashboard se recalcule.
   * Lleva su identificador, para poder señalarlo en la lista de los últimos.
   */
  readonly saved = output<number>();

  /** Se ha creado una categoría desde el selector: el catálogo de fuera se ha quedado viejo. */
  readonly catalogueChanged = output<void>();

  protected readonly currency = CURRENCY_SYMBOL;
  protected readonly kind = signal<TransactionTypeCode>('EXPENSE');
  /** Categoría elegida. Vive fuera del formulario porque se elige tocando una ficha. */
  protected readonly categoryId = signal<number | null>(null);
  /** Se enseña el aviso de categoría solo tras intentar guardar sin ninguna. */
  protected readonly categoryMissing = signal(false);
  protected readonly showDetails = signal(false);
  protected readonly saving = signal(false);

  private readonly amountField = viewChild<ElementRef<HTMLInputElement>>('amountField');

  protected readonly form = this.formBuilder.nonNullable.group({
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    description: ['', Validators.maxLength(255)],
    date: [''],
  });

  /** Tags escritos. Viven fuera del formulario porque se manejan como fichas. */
  protected readonly pickedTags = signal<string[]>([]);

  /** El tipo elegido dentro del catálogo, que es de donde sale su identificador. */
  protected readonly selectedType = computed(() =>
    this.types().find((type) => type.code === this.kind()),
  );

  constructor() {
    effect(() => {
      if (this.focusRequest() === null) {
        return;
      }
      const field = this.amountField()?.nativeElement;
      field?.focus();
      // En móvil el formulario queda por debajo del balance: enfocarlo sin traerlo a la
      // vista dejaría al usuario escribiendo en un campo que no ve.
      field?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
  }

  protected setKind(kind: TransactionTypeCode): void {
    this.kind.set(kind);
  }

  /** Recoge la categoría elegida y retira el aviso en cuanto deja de faltar. */
  protected onCategoryChange(id: number | null): void {
    this.categoryId.set(id);
    if (id !== null) {
      this.categoryMissing.set(false);
    }
  }

  protected submit(): void {
    const type = this.selectedType();
    const categoryId = this.categoryId();
    if (this.form.invalid || !type || categoryId === null || this.saving()) {
      this.form.markAllAsTouched();
      this.categoryMissing.set(categoryId === null);
      return;
    }

    const value = this.form.getRawValue();
    const request: CreateTransactionRequest = {
      amount: Number(value.amount),
      transactionTypeId: type.id,
      categoryId,
    };
    if (value.description.trim()) {
      request.description = value.description.trim();
    }
    if (value.date) {
      request.date = toApiDateTime(value.date);
    }
    // Sin tags no se manda el campo: el contrato lo admite ausente y una lista vacía
    // significaría otra cosa distinta, que es dejar la transacción explícitamente sin tags.
    if (this.pickedTags().length) {
      request.tags = this.pickedTags();
    }

    this.saving.set(true);
    this.form.disable();
    this.api.createTransaction(request).subscribe({
      next: (created) => {
        this.toasts.success(type.code === 'INCOME' ? 'Ingreso registrado' : 'Egreso registrado');
        this.reset();
        this.saved.emit(created.id);
      },
      error: (error) => {
        this.toasts.error(describeError(error));
        this.finish();
      },
    });
  }

  private reset(): void {
    this.finish();
    this.form.reset({ amount: null, description: '', date: '' });
    this.pickedTags.set([]);
    this.categoryId.set(null);
    this.categoryMissing.set(false);
    this.showDetails.set(false);
    // Encadenar movimientos es lo normal al ponerse al día: el foco vuelve al importe.
    this.amountField()?.nativeElement.focus();
  }

  private finish(): void {
    this.saving.set(false);
    this.form.enable();
  }
}
