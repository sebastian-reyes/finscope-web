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
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CategoryPickerComponent } from '../../shared/ui/category-picker';
import { DateFieldComponent } from '../../shared/ui/date-field';
import { TagsFieldComponent } from '../../shared/ui/tags-field';
import { ExchangeRateService } from '../../core/exchange-rate.service';
import { FinscopeService } from '../../core/finscope.service';
import { ToastService } from '../../core/toast.service';
import { describeError } from '../../core/api-error';
import {
  BASE_CURRENCY,
  CURRENCIES,
  currencySymbol,
  formatMoney,
  toBaseCurrency,
} from '../../core/format/money';
import { toApiDateTime } from '../../core/format/period';
import {
  CategoryResponse,
  CreateTransactionRequest,
  Currency,
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
  private readonly rates = inject(ExchangeRateService);
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

  protected readonly currencies = CURRENCIES;
  /** Moneda elegida. Manda sobre el tipo de cambio, que solo existe fuera de la base. */
  protected readonly currency = signal<Currency>(BASE_CURRENCY);
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
    // Obligatorio o prohibido segun la moneda: lo decide `setCurrency`.
    exchangeRate: [null as number | null],
    description: ['', Validators.maxLength(255)],
    date: [''],
  });

  /** Si el movimiento esta en la moneda base, la unica que no lleva tipo de cambio. */
  protected readonly isBaseCurrency = computed(() => this.currency() === BASE_CURRENCY);

  /** Simbolo de la moneda elegida, el que acompana al monto mientras se escribe. */
  protected readonly symbol = computed(() => currencySymbol(this.currency()));

  /** Lo escrito en el formulario, como senal, para poder recalcular la conversion. */
  private readonly draft = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  /** De cuando es la tasa propuesta, o nulo si el usuario ya escribio otra. */
  protected readonly suggestedFrom = computed(() => {
    const last = this.rates.lastRate(this.currency());
    if (this.isBaseCurrency() || !last || Number(this.draft().exchangeRate) !== last.rate) {
      return null;
    }
    return new Date(last.date).toLocaleDateString('es', { day: 'numeric', month: 'long' });
  });

  /** La conversion en palabras, que es lo que delata un cambio mal tecleado. */
  protected readonly converted = computed(() => {
    const value = this.draft();
    const amount = Number(value.amount);
    const rate = Number(value.exchangeRate);
    if (!amount || !rate || this.isBaseCurrency()) {
      return null;
    }
    const money = formatMoney(amount, this.currency());
    return `${money} \u00d7 ${rate} = ${formatMoney(toBaseCurrency(amount, rate))}`;
  });

  /** Tags escritos. Viven fuera del formulario porque se manejan como fichas. */
  protected readonly pickedTags = signal<string[]>([]);

  /** El tipo elegido dentro del catálogo, que es de donde sale su identificador. */
  protected readonly selectedType = computed(() =>
    this.types().find((type) => type.code === this.kind()),
  );

  constructor() {
    // La ultima tasa conocida se pide a la API, asi que puede llegar despues de haber
    // elegido la moneda: sin esto habria que volver a tocar el selector para verla.
    effect(() => {
      const currency = this.currency();
      const last = this.rates.lastRate(currency);
      const control = this.form.controls.exchangeRate;
      if (currency !== BASE_CURRENCY && last && control.value == null) {
        control.setValue(last.rate);
      }
    });

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

  /**
   * Elige la moneda y deja el tipo de cambio como esa moneda exige: obligatorio fuera de la
   * base, vaciado al volver a ella para que no viaje un cambio que ya no convierte nada.
   *
   * @param currency moneda elegida
   */
  protected setCurrency(currency: Currency): void {
    this.currency.set(currency);
    const control = this.form.controls.exchangeRate;
    if (currency === BASE_CURRENCY) {
      control.reset(null);
      control.clearValidators();
    } else {
      control.setValidators([Validators.required, Validators.min(0.000001)]);
      // Se propone la ultima que se uso: teclearla en cada movimiento es el paso de sobra
      // que hace que se deje de registrar. Solo si el campo esta vacio.
      this.rates.ensureLoaded(currency);
      const last = this.rates.lastRate(currency);
      if (control.value == null && last) {
        control.setValue(last.rate);
      }
    }
    control.updateValueAndValidity();
  }

  /** Simbolo con el que se rotula cada moneda en el selector. */
  protected symbolOf(currency: Currency): string {
    return currencySymbol(currency);
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
      currency: this.currency(),
      transactionTypeId: type.id,
      categoryId,
    };
    if (!this.isBaseCurrency()) {
      request.exchangeRate = Number(value.exchangeRate);
    }
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
        // Lo que acaba de guardarse es, por definicion, lo ultimo: se recuerda para el
        // siguiente movimiento en lugar de volver a preguntarselo a la API.
        if (created.currency && created.exchangeRate) {
          this.rates.remember(created.currency, created.exchangeRate, created.date);
        }
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
    this.form.reset({ amount: null, exchangeRate: null, description: '', date: '' });
    this.setCurrency(BASE_CURRENCY);
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
