import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { FinscopeService } from '../../core/finscope.service';
import { RefreshService } from '../../core/refresh.service';
import { ToastService } from '../../core/toast.service';
import { describeError } from '../../core/api-error';
import {
  currentMonth,
  monthFromParam,
  monthLabel,
  toInputDateTime,
} from '../../core/format/period';
import {
  BASE_CURRENCY,
  CURRENCIES,
  CURRENCY_NAMES,
  currencySymbol,
  formatMoney,
} from '../../core/format/money';
import { CatalogueStylesService } from '../../core/catalogue-styles.service';
import { BudgetResponse, CategoryResponse, Currency } from '../../core/models';
import { BudgetBarComponent } from '../../shared/ui/budget-bar';
import { DateFieldComponent } from '../../shared/ui/date-field';
import { SegmentedDirective } from '../../shared/ui/segmented';
import { SelectFieldComponent, SelectOption } from '../../shared/ui/select-field';

/** Totales del mes: el plan entero contra lo que de verdad se lleva gastado. */
interface BudgetTotals {
  /** Moneda de la que hablan todas las cifras de este total. */
  currency: Currency;
  amount: number;
  spent: number;
  remaining: number;
  /** Qué parte del plan se lleva gastada, redondeada al entero. */
  percent: number;
}

/**
 * Presupuestos del mes.
 *
 * Es la única pantalla que mira hacia delante: las demás cuentan lo que pasó y esta dice
 * lo que se pensaba gastar. Por eso se lee mes a mes, con la misma cabecera de periodo que
 * el inicio, y no como un catálogo intemporal: un presupuesto de agosto no dice nada de
 * septiembre.
 *
 * Solo se presupuestan categorías que admitan egresos. El avance se mide contra lo gastado,
 * así que una categoría de solo ingresos tendría una barra que no podría moverse nunca, y
 * ni siquiera se ofrece en el desplegable.
 *
 * Copiar el mes anterior no es un adorno: sin ello, el día uno de cada mes obliga a teclear
 * el plan entero otra vez, y un plan que cuesta reescribir se deja de reescribir al segundo
 * mes. Lo que el destino ya tenga no se pisa, así que se puede pulsar sin miedo.
 */
@Component({
  selector: 'app-budgets',
  imports: [
    ReactiveFormsModule,
    BudgetBarComponent,
    DateFieldComponent,
    SegmentedDirective,
    SelectFieldComponent,
  ],
  templateUrl: './budgets.html',
  styleUrl: './budgets.scss',
})
export class BudgetsPage {
  private readonly styles = inject(CatalogueStylesService);
  private readonly api = inject(FinscopeService);
  private readonly toasts = inject(ToastService);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly budgets = signal<BudgetResponse[]>([]);
  protected readonly categories = signal<CategoryResponse[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly copying = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly showCreate = signal(false);

  /** Presupuesto que se está editando, si hay alguno. */
  protected readonly editingId = signal<number | null>(null);

  /** Presupuesto cuya retirada espera confirmación en su propia fila. */
  protected readonly confirmingId = signal<number | null>(null);

  /**
   * Mes que se está mirando. Se mueve con las flechas de la cabecera, como en el inicio. Abre
   * en el que diga la dirección (`?mes=2026-10`), que es por donde llega un aviso del
   * teléfono, y si no dice ninguno, en el mes en curso.
   */
  protected readonly period = signal(
    monthFromParam(inject(ActivatedRoute).snapshot.queryParamMap.get('mes')) ?? currentMonth(),
  );

  /**
   * Los dos formularios de la pantalla.
   *
   * Van en grupo y no como controles sueltos por el mismo motivo que en las categorías:
   * `ngSubmit` es una salida de `FormGroupDirective`, y sin `[formGroup]` en la etiqueta el
   * `<form>` se enviaría de verdad y recargaría la página.
   */
  protected readonly newForm = this.formBuilder.nonNullable.group({
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
  });

  protected readonly currencies = CURRENCIES;

  /**
   * Moneda del plan que se esta dando de alta.
   * Vive fuera del formulario porque se elige tocando un boton, igual que la categoria, y
   * porque forma parte de lo que identifica al presupuesto: una categoria admite uno por
   * moneda y mes.
   */
  protected readonly newCurrency = signal<Currency>(BASE_CURRENCY);

  protected readonly editForm = this.formBuilder.nonNullable.group({
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
  });

  protected readonly newAmount = this.newForm.controls.amount;
  protected readonly editAmount = this.editForm.controls.amount;

  /**
   * Categoría elegida en el formulario de alta.
   * Vive en su propia señal y no en el grupo porque el desplegable de la casa se comunica
   * con `value`/`valueChange` y no implementa el acceso de los formularios reactivos.
   */
  protected readonly newCategoryId = signal('');

  protected readonly title = computed(() => {
    const { month, year } = this.period();
    return monthLabel(month!, year!);
  });

  protected readonly monthValue = computed(() => {
    const { month, year } = this.period();
    return `${year}-${String(month).padStart(2, '0')}`;
  });

  /**
   * Hasta dónde llega el calendario.
   *
   * A diferencia del inicio, aquí sí se puede ir al futuro: presupuestar el mes que viene
   * antes de que empiece es justo el momento en que uno se sienta a planificar.
   */
  protected readonly today = toInputDateTime(new Date()).slice(0, 10);

  /** El mes anterior al que se está mirando, que es del que se copia. */
  protected readonly previous = computed(() => {
    const { month, year } = this.period();
    const moved = new Date(year!, month! - 2, 1);
    return { month: moved.getMonth() + 1, year: moved.getFullYear() };
  });

  protected readonly previousLabel = computed(() => {
    const { month, year } = this.previous();
    return monthLabel(month, year);
  });

  /**
   * Categorías que todavía se pueden presupuestar este mes.
   * Fuera las de solo ingresos, que no tienen gasto contra el que medirse, y fuera las que
   * ya tienen presupuesto: la API rechaza el segundo con un conflicto, y es mejor no
   * ofrecer lo que se va a rechazar.
   */
  protected readonly available = computed(() => {
    const taken = new Set(this.budgets().map((budget) => budget.categoryId));
    return this.categories().filter(
      (category) => category.appliesTo !== 'INCOME' && !taken.has(category.id),
    );
  });

  /**
   * Las mismas categorías, con la forma que entiende el desplegable de la casa.
   * Abre con una opción vacía a propósito: el desplegable enseña la primera cuando el valor
   * no está en la lista, y sin ella parecería que hay una categoría elegida antes de que
   * nadie la eligiera.
   */
  protected readonly categoryOptions = computed<SelectOption[]>(() => [
    { value: '', label: 'Elegir categoría' },
    ...this.available().map((category) => ({
      value: String(category.id),
      label: category.name,
      icon: this.styles.iconOf('category', category.name),
      hint: category.transactionCount ? `${category.transactionCount} movs.` : undefined,
    })),
  ]);

  /**
   * Totales del mes.
   * Se suman aquí y no en la API porque son la misma resta que ya viene fila a fila: pedir
   * un agregado más obligaría a un viaje extra para no aportar ningún dato nuevo.
   */
  /**
   * El mes entero, con un total por moneda.
   *
   * No hay una cifra que los resuma: un plan en soles y otro en dolares son dos cantidades
   * distintas, y sumarlas dará un numero que no significa nada. Con una sola moneda —lo
   * normal— la lista tiene un elemento y la pantalla se ve como siempre.
   */
  protected readonly totals = computed<BudgetTotals[]>(() => {
    const grouped = new Map<Currency, BudgetTotals>();
    for (const budget of this.budgets()) {
      const total = grouped.get(budget.currency) ?? {
        currency: budget.currency,
        amount: 0,
        spent: 0,
        remaining: 0,
        percent: 0,
      };
      total.amount += budget.amount;
      total.spent += budget.spent;
      grouped.set(budget.currency, total);
    }
    for (const total of grouped.values()) {
      total.remaining = total.amount - total.spent;
      total.percent = total.amount > 0 ? Math.round((total.spent / total.amount) * 100) : 0;
    }
    return [...grouped.values()];
  });

  /** Si el mes tiene planes en mas de una moneda, que es cuando hay que rotularlas. */
  protected readonly hasSeveralCurrencies = computed(() => this.totals().length > 1);

  /** Los que ya se pasaron del límite, que son los que hay que mirar primero. */
  protected readonly overspent = computed(() =>
    this.budgets().filter((budget) => budget.remaining < 0),
  );

  constructor() {
    // Arrastrar hacia abajo recarga esta pantalla. El gesto vive en la carcasa —el dedo
    // arrastra la ventana, no una pantalla concreta—, así que lo que se deja aquí es qué hay
    // que volver a pedir y cómo saber que ya ha terminado.
    inject(DestroyRef).onDestroy(
      inject(RefreshService).register(() => this.reload(), this.loading),
    );
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set(null);
    const { month, year } = this.period();
    forkJoin({
      budgets: this.api.listBudgets(month!, year!),
      categories: this.api.listCategories(),
    }).subscribe({
      next: ({ budgets, categories }) => {
        this.budgets.set(budgets);
        this.categories.set(categories);
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(describeError(error));
        this.loading.set(false);
      },
    });
  }

  protected setMonthValue(value: string): void {
    if (!value) {
      return;
    }
    const [year, month] = value.split('-').map(Number);
    this.period.set({ month, year });
    this.closeForms();
    this.reload();
  }

  protected shiftMonth(delta: number): void {
    const { month, year } = this.period();
    const moved = new Date(year!, month! - 1 + delta, 1);
    this.period.set({ month: moved.getMonth() + 1, year: moved.getFullYear() });
    this.closeForms();
    this.reload();
  }

  protected toggleCreate(): void {
    this.showCreate.set(!this.showCreate());
    this.resetCreate();
  }

  protected create(): void {
    if (this.newForm.invalid || !this.newCategoryId() || this.saving()) {
      this.newForm.markAllAsTouched();
      return;
    }
    const { month, year } = this.period();
    this.saving.set(true);
    this.api
      .createBudget(
        Number(this.newCategoryId()),
        month!,
        year!,
        this.newCurrency(),
        Number(this.newAmount.value),
      )
      .subscribe({
        next: (budget) => {
          this.toasts.success(
            `«${budget.category}» presupuestada en ${formatMoney(budget.amount, budget.currency)}`,
          );
          this.showCreate.set(false);
          this.resetCreate();
          this.saving.set(false);
          this.reload();
        },
        error: (error) => this.fail(error),
      });
  }

  protected startEdit(budget: BudgetResponse): void {
    this.editingId.set(budget.id);
    this.confirmingId.set(null);
    this.editAmount.setValue(budget.amount);
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
  }

  protected saveEdit(budget: BudgetResponse): void {
    if (this.editForm.invalid || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.api.updateBudget(budget.id, Number(this.editAmount.value)).subscribe({
      next: (updated) => {
        this.toasts.success(`«${updated.category}» ahora tiene ${formatMoney(updated.amount)}`);
        this.editingId.set(null);
        this.saving.set(false);
        this.reload();
      },
      error: (error) => this.fail(error),
    });
  }

  protected askRemove(budget: BudgetResponse): void {
    this.confirmingId.set(budget.id);
    this.editingId.set(null);
  }

  protected cancelRemove(): void {
    this.confirmingId.set(null);
  }

  protected remove(budget: BudgetResponse): void {
    this.saving.set(true);
    this.api.deleteBudget(budget.id).subscribe({
      next: () => {
        this.toasts.success(`«${budget.category}» se queda sin presupuesto este mes`);
        this.confirmingId.set(null);
        this.saving.set(false);
        this.reload();
      },
      error: (error) => this.fail(error),
    });
  }

  /**
   * Trae el plan del mes anterior.
   * Se cuenta cuántos entraron comparando con lo que ya había, porque «se copiaron 4» es lo
   * que contesta a la pregunta que uno se hace al pulsar; la API devuelve el mes entero, no
   * el número de filas escritas.
   */
  protected copyPrevious(): void {
    if (this.copying()) {
      return;
    }
    const { month, year } = this.period();
    const source = this.previous();
    const before = this.budgets().length;
    this.copying.set(true);
    this.api
      .copyBudgets({
        sourceMonth: source.month,
        sourceYear: source.year,
        month: month!,
        year: year!,
      })
      .subscribe({
        next: (budgets) => {
          const added = budgets.length - before;
          this.budgets.set(budgets);
          this.copying.set(false);
          if (added > 0) {
            this.toasts.success(
              added === 1
                ? `Se copió 1 presupuesto de ${this.previousLabel().toLowerCase()}`
                : `Se copiaron ${added} presupuestos de ${this.previousLabel().toLowerCase()}`,
            );
          } else {
            this.toasts.success(`No había nada nuevo que traer de ${this.previousLabel()}`);
          }
        },
        error: (error) => {
          this.toasts.error(describeError(error));
          this.copying.set(false);
        },
      });
  }

  /**
   * Da formato a un importe en la moneda indicada.
   *
   * @param amount   importe a formatear
   * @param currency moneda del importe; la base si no se dice otra
   * @return el importe con el simbolo de su moneda
   */
  protected money(amount: number, currency: Currency = BASE_CURRENCY): string {
    return formatMoney(amount, currency);
  }

  /** Nombre con el que se rotula una moneda cuando hay varias en pantalla. */
  protected currencyName(currency: Currency): string {
    return CURRENCY_NAMES[currency];
  }

  /** Simbolo con el que se rotula cada moneda en el selector del alta. */
  protected currencySign(currency: Currency): string {
    return currencySymbol(currency);
  }

  /** Cierra lo que estuviera abierto al cambiar de mes: ya no se refiere a lo que se mira. */
  private closeForms(): void {
    this.showCreate.set(false);
    this.editingId.set(null);
    this.confirmingId.set(null);
    this.resetCreate();
  }

  /** Deja el formulario de alta como recién abierto, con sus dos campos vacíos. */
  private resetCreate(): void {
    this.newForm.reset({ amount: null });
    this.newCategoryId.set('');
    this.newCurrency.set(BASE_CURRENCY);
  }

  private fail(error: unknown): void {
    this.toasts.error(describeError(error));
    this.saving.set(false);
  }
}
