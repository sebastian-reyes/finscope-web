import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, forkJoin } from 'rxjs';
import { FinscopeService } from '../../core/finscope.service';
import { ToastService } from '../../core/toast.service';
import { describeError } from '../../core/api-error';
import { currentMonth, monthLabel, startOfDay } from '../../core/format/period';
import { formatMoney } from '../../core/format/money';
import { iconFor } from '../../core/format/icons';
import {
  CategoryResponse,
  RecurringOccurrenceResponse,
  TransactionTypeCode,
  TransactionTypeResponse,
} from '../../core/models';
import { CategoryPickerComponent } from '../../shared/ui/category-picker';
import { DateFieldComponent } from '../../shared/ui/date-field';
import { SelectFieldComponent, SelectOption } from '../../shared/ui/select-field';

/** Cómo va el mes de fijos: lo que falta, lo que ya se pagó y lo que se espera cobrar. */
interface RecurringTotals {
  /** Cuántos vencen este mes y siguen sin resolverse. */
  pendingCount: number;
  /** Suma de los egresos que faltan por pagar. */
  pendingExpense: number;
  paidCount: number;
  /** Suma de lo que de verdad se pagó, que puede no ser lo estimado. */
  paidExpense: number;
  /** Ingresos fijos del mes, pagados o no: el sueldo también es un fijo. */
  income: number;
}

/** Cada cuántos meses puede repetirse un fijo, con el nombre que se le da a cada ritmo. */
const RHYTHMS: ReadonlyArray<readonly [string, string]> = [
  ['1', 'Cada mes'],
  ['2', 'Cada dos meses'],
  ['3', 'Cada tres meses'],
  ['6', 'Cada seis meses'],
  ['12', 'Una vez al año'],
];

/**
 * Movimientos fijos del mes.
 *
 * Un fijo es una plantilla, no un movimiento: dice que el alquiler vuelve todos los meses,
 * no que ya se haya pagado. La plantilla no registra nada sola. Cada mes produce un
 * pendiente que se confirma de un toque, y esa confirmación es la que crea el movimiento,
 * porque un historial que se inventa cargos deja de servir para lo único que sirve.
 *
 * Por eso la pantalla se lee mes a mes, con la misma cabecera de periodo que el inicio y
 * los presupuestos: la lista de plantillas es la misma siempre, pero lo que falta por pagar
 * solo significa algo dentro de un mes.
 *
 * Los ingresos entran igual que los egresos. El sueldo es lo más recurrente que existe y es
 * lo que hace que «cuánto me queda» sea una cuenta y no una intuición.
 */
@Component({
  selector: 'app-recurring',
  imports: [ReactiveFormsModule, CategoryPickerComponent, DateFieldComponent, SelectFieldComponent],
  templateUrl: './recurring.html',
  styleUrl: './recurring.scss',
})
export class RecurringPage {
  private readonly api = inject(FinscopeService);
  private readonly toasts = inject(ToastService);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly items = signal<RecurringOccurrenceResponse[]>([]);
  protected readonly categories = signal<CategoryResponse[]>([]);
  protected readonly types = signal<TransactionTypeResponse[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Si el formulario de arriba está abierto, sea para dar de alta o para modificar. */
  protected readonly showForm = signal(false);

  /** Plantilla que se está modificando, o nulo si el formulario es de alta. */
  protected readonly editingId = signal<number | null>(null);

  /** Fijo cuyo importe real se está ajustando antes de confirmarlo. */
  protected readonly adjustingId = signal<number | null>(null);

  /** Fijo cuya eliminación espera confirmación en su propia fila. */
  protected readonly confirmingId = signal<number | null>(null);

  protected readonly period = signal(currentMonth());

  protected readonly rhythms: SelectOption[] = RHYTHMS.map(([value, label]) => ({ value, label }));

  /**
   * Formulario de alta y de cambio.
   *
   * Es uno solo y vive arriba, no dentro de cada fila: un fijo tiene siete campos y siete
   * campos incrustados en una fila de lista dejan de parecer una lista. La fila solo lleva
   * lo que se hace de un toque —confirmar, omitir, pausar—, que es a lo que se entra aquí
   * casi siempre.
   */
  protected readonly form = this.formBuilder.nonNullable.group({
    description: ['', [Validators.required, Validators.maxLength(70)]],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    dayOfMonth: [1, [Validators.required, Validators.min(1), Validators.max(31)]],
  });

  /** Importe real con el que se confirma un mes que no salió por lo previsto. */
  protected readonly adjustForm = this.formBuilder.nonNullable.group({
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
  });

  /**
   * Los tres campos que no son del formulario reactivo.
   * El selector de categoría, el desplegable de la casa y el campo de mes se comunican con
   * `value`/`valueChange` y no implementan el acceso de los formularios reactivos.
   */
  protected readonly kind = signal<TransactionTypeCode>('EXPENSE');
  protected readonly categoryId = signal<number | null>(null);
  protected readonly everyMonths = signal('1');
  protected readonly startValue = signal('');

  /** Fecha real del movimiento con el que se confirma, cuando no es la prevista. */
  protected readonly adjustDate = signal('');

  protected readonly title = computed(() => {
    const { month, year } = this.period();
    return monthLabel(month!, year!);
  });

  protected readonly monthValue = computed(() => {
    const { month, year } = this.period();
    return `${year}-${String(month).padStart(2, '0')}`;
  });

  /**
   * Los que este mes hay que mirar: vencen en él, en cualquiera de sus estados.
   * Los que no vencen se listan aparte y en gris, porque en un checklist estorban.
   */
  protected readonly due = computed(() =>
    this.items().filter((item) => item.status !== 'NOT_DUE'),
  );

  /** Los que no tocan este mes: pausados, o de los que van cada varios meses. */
  protected readonly resting = computed(() =>
    this.items().filter((item) => item.status === 'NOT_DUE'),
  );

  /** Lo que falta por resolver, que es lo que se viene a hacer a esta pantalla. */
  protected readonly pending = computed(() =>
    this.due().filter((item) => item.status === 'PENDING' || item.status === 'OVERDUE'),
  );

  protected readonly totals = computed<RecurringTotals>(() => {
    const due = this.due();
    const pending = this.pending();
    const paid = due.filter((item) => item.status === 'PAID');
    return {
      pendingCount: pending.length,
      pendingExpense: sum(pending.filter(isExpense).map((item) => item.amount)),
      paidCount: paid.length,
      paidExpense: sum(paid.filter(isExpense).map((item) => item.paidAmount ?? item.amount)),
      income: sum(
        due
          .filter((item) => !isExpense(item) && item.status !== 'SKIPPED')
          .map((item) => item.paidAmount ?? item.amount),
      ),
    };
  });

  /** El tipo elegido en el formulario, resuelto contra el catálogo de tipos. */
  protected readonly typeId = computed(
    () => this.types().find((type) => type.code === this.kind())?.id ?? null,
  );

  constructor() {
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set(null);
    const { month, year } = this.period();
    forkJoin({
      items: this.api.listRecurring(month!, year!),
      categories: this.api.listCategories(),
      types: this.api.listTransactionTypes(),
    }).subscribe({
      next: ({ items, categories, types }) => {
        this.items.set(items);
        this.categories.set(categories);
        this.types.set(types);
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
    this.closeAll();
    this.reload();
  }

  protected shiftMonth(delta: number): void {
    const { month, year } = this.period();
    const moved = new Date(year!, month! - 1 + delta, 1);
    this.period.set({ month: moved.getMonth() + 1, year: moved.getFullYear() });
    this.closeAll();
    this.reload();
  }

  // --- Alta y cambio de la plantilla ------------------------------------------------------

  protected toggleForm(): void {
    if (this.showForm()) {
      this.closeForm();
      return;
    }
    this.resetForm();
    this.showForm.set(true);
  }

  protected startEdit(item: RecurringOccurrenceResponse): void {
    this.editingId.set(item.id);
    this.confirmingId.set(null);
    this.adjustingId.set(null);
    this.form.setValue({
      description: item.description,
      amount: item.amount,
      dayOfMonth: item.dayOfMonth,
    });
    this.kind.set(item.type);
    this.categoryId.set(item.categoryId);
    this.everyMonths.set(String(item.everyMonths));
    this.startValue.set(`${item.startYear}-${String(item.startMonth).padStart(2, '0')}`);
    this.showForm.set(true);
  }

  protected closeForm(): void {
    this.showForm.set(false);
    this.editingId.set(null);
  }

  /**
   * Guarda la plantilla, sea nueva o existente.
   *
   * Al modificar se mandan todos los campos y no solo los que cambiaron: el formulario los
   * tiene todos delante, y comparar contra el original para enviar la diferencia solo
   * añadiría una forma de equivocarse.
   */
  protected save(): void {
    const typeId = this.typeId();
    const categoryId = this.categoryId();
    if (this.form.invalid || !categoryId || !typeId || this.saving()) {
      this.form.markAllAsTouched();
      return;
    }
    const [startYear, startMonth] = this.startValue().split('-').map(Number);
    const request = {
      categoryId,
      transactionTypeId: typeId,
      description: this.form.controls.description.value.trim(),
      amount: Number(this.form.controls.amount.value),
      dayOfMonth: Number(this.form.controls.dayOfMonth.value),
      everyMonths: Number(this.everyMonths()),
      startMonth,
      startYear,
    };
    const editing = this.editingId();
    this.saving.set(true);
    const call = editing
      ? this.api.updateRecurring(editing, request)
      : this.api.createRecurring(request);
    call.subscribe({
      next: (saved) => {
        this.toasts.success(
          editing ? `«${saved.description}» actualizado` : `«${saved.description}» quedó fijo`,
        );
        this.saving.set(false);
        this.closeForm();
        this.reload();
      },
      error: (error) => this.fail(error),
    });
  }

  // --- Lo que se hace de un toque ---------------------------------------------------------

  /** Registra el movimiento con lo previsto: el caso de casi todos los meses. */
  protected confirm(item: RecurringOccurrenceResponse): void {
    const { month, year } = this.period();
    this.run(this.api.confirmRecurring(item.id, { month: month!, year: year! }), () =>
      this.toasts.success(`«${item.description}» registrado por ${formatMoney(item.amount)}`),
    );
  }

  /** Abre el ajuste con lo previsto ya puesto: casi siempre solo cambia el importe. */
  protected startAdjust(item: RecurringOccurrenceResponse): void {
    this.adjustingId.set(item.id);
    this.confirmingId.set(null);
    this.adjustForm.setValue({ amount: item.amount });
    this.adjustDate.set(item.dueDate ?? '');
  }

  protected cancelAdjust(): void {
    this.adjustingId.set(null);
  }

  protected confirmAdjusted(item: RecurringOccurrenceResponse): void {
    if (this.adjustForm.invalid || this.saving()) {
      this.adjustForm.markAllAsTouched();
      return;
    }
    const { month, year } = this.period();
    const amount = Number(this.adjustForm.controls.amount.value);
    const date = this.adjustDate();
    this.run(
      this.api.confirmRecurring(item.id, {
        month: month!,
        year: year!,
        amount,
        // El campo entrega un día suelto y la API espera un instante. Se manda el comienzo
        // del día porque lo que importa es en qué día cae, no a qué hora se pagó.
        date: date ? startOfDay(date) : undefined,
      }),
      () => this.toasts.success(`«${item.description}» registrado por ${formatMoney(amount)}`),
    );
  }

  protected skip(item: RecurringOccurrenceResponse): void {
    const { month, year } = this.period();
    this.run(this.api.skipRecurring(item.id, month!, year!), () =>
      this.toasts.success(`«${item.description}» no cuenta este mes`),
    );
  }

  protected unskip(item: RecurringOccurrenceResponse): void {
    const { month, year } = this.period();
    this.run(this.api.unskipRecurring(item.id, month!, year!), () =>
      this.toasts.success(`«${item.description}» vuelve a contar este mes`),
    );
  }

  /**
   * Pausa o reanuda la plantilla.
   * Es lo que hay que usar al dejar de pagar algo: borrarla perdería los meses en los que
   * sí se pagó.
   */
  protected togglePause(item: RecurringOccurrenceResponse): void {
    this.run(this.api.updateRecurring(item.id, { active: !item.active }), () =>
      this.toasts.success(
        item.active ? `«${item.description}» en pausa` : `«${item.description}» reanudado`,
      ),
    );
  }

  protected askRemove(item: RecurringOccurrenceResponse): void {
    this.confirmingId.set(item.id);
    this.adjustingId.set(null);
  }

  protected cancelRemove(): void {
    this.confirmingId.set(null);
  }

  protected remove(item: RecurringOccurrenceResponse): void {
    this.run(this.api.deleteRecurring(item.id), () =>
      this.toasts.success(`«${item.description}» ya no es un fijo`),
    );
  }

  // --- Rótulos ----------------------------------------------------------------------------

  /** Cuándo toca, dicho como se diría en voz alta. */
  protected schedule(item: RecurringOccurrenceResponse): string {
    const rhythm = RHYTHMS.find(([value]) => value === String(item.everyMonths));
    const every = item.everyMonths === 1 ? '' : ` · ${(rhythm?.[1] ?? '').toLowerCase()}`;
    return `día ${item.dayOfMonth}${every}`;
  }

  protected stateLabel(item: RecurringOccurrenceResponse): string {
    switch (item.status) {
      case 'PAID':
        return isExpense(item) ? 'Pagado' : 'Cobrado';
      case 'OVERDUE':
        return 'Vencido';
      case 'SKIPPED':
        return 'Omitido';
      case 'PENDING':
        return 'Pendiente';
      case 'NOT_DUE':
        return item.active ? 'No toca este mes' : 'En pausa';
    }
  }

  protected icon(item: RecurringOccurrenceResponse): string {
    return iconFor(item.description || item.category);
  }

  protected money(amount: number): string {
    return formatMoney(amount);
  }

  protected setKind(kind: TransactionTypeCode): void {
    if (this.kind() === kind) {
      return;
    }
    this.kind.set(kind);
    // La categoría elegida puede no admitir el tipo nuevo, y la API lo rechazaría al
    // guardar. Se suelta aquí para que el selector vuelva a pedirla en lugar de enseñar una
    // que ya no vale.
    this.categoryId.set(null);
  }

  // --- Fontanería -------------------------------------------------------------------------

  /**
   * Lanza una operación que cambia algo y recarga el mes con lo que salga.
   *
   * Se recarga entero en lugar de coser la respuesta en la lista porque una sola de estas
   * operaciones mueve más cosas de las que devuelve: confirmar un fijo cambia además lo
   * comprometido de su categoría, y omitirlo también.
   */
  private run(call: Observable<unknown>, done: () => void): void {
    this.saving.set(true);
    call.subscribe({
      next: () => {
        done();
        this.saving.set(false);
        this.adjustingId.set(null);
        this.confirmingId.set(null);
        this.reload();
      },
      error: (error: unknown) => this.fail(error),
    });
  }

  private fail(error: unknown): void {
    this.saving.set(false);
    this.toasts.error(describeError(error));
  }

  private resetForm(): void {
    const { month, year } = this.period();
    this.editingId.set(null);
    this.form.reset({ description: '', amount: null, dayOfMonth: 1 });
    this.kind.set('EXPENSE');
    this.categoryId.set(null);
    this.everyMonths.set('1');
    this.startValue.set(`${year}-${String(month).padStart(2, '0')}`);
  }

  private closeAll(): void {
    this.closeForm();
    this.adjustingId.set(null);
    this.confirmingId.set(null);
  }
}

/** Si el movimiento que se repite es un gasto. */
function isExpense(item: RecurringOccurrenceResponse): boolean {
  return item.type === 'EXPENSE';
}

function sum(amounts: number[]): number {
  return amounts.reduce((total, amount) => total + amount, 0);
}
