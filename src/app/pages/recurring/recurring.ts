import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, forkJoin } from 'rxjs';
import { ExchangeRateService } from '../../core/exchange-rate.service';
import { RefreshService } from '../../core/refresh.service';
import { FinscopeService } from '../../core/finscope.service';
import { ToastService } from '../../core/toast.service';
import { describeError } from '../../core/api-error';
import { currentMonth, monthFromParam, monthLabel, startOfDay } from '../../core/format/period';
import {
  BASE_CURRENCY,
  CURRENCIES,
  CURRENCY_NAMES,
  currencySymbol,
  formatMoney,
} from '../../core/format/money';
import { iconFor } from '../../core/format/icons';
import { CatalogueStylesService } from '../../core/catalogue-styles.service';
import { chipIcon } from '../../core/format/icon-choices';
import {
  CategoryResponse,
  Currency,
  RecurringOccurrenceResponse,
  TagResponse,
  TransactionTypeCode,
  TransactionTypeResponse,
} from '../../core/models';
import { BottomSheetComponent } from '../../shared/ui/bottom-sheet';
import { CategoryPickerComponent } from '../../shared/ui/category-picker';
import { DateFieldComponent } from '../../shared/ui/date-field';
import { SegmentedDirective } from '../../shared/ui/segmented';
import { SelectOption } from '../../shared/ui/select-field';
import { TagChipComponent } from '../../shared/ui/tag-chip';
import { TagsFieldComponent } from '../../shared/ui/tags-field';

/** Cómo va el mes de fijos: lo que falta, lo que ya se pagó y lo que se espera cobrar. */
interface RecurringTotals {
  /** Cuántos vencen este mes y siguen sin resolverse. Contar sí cruza monedas. */
  pendingCount: number;
  /**
   * Los egresos que faltan por pagar, ya escritos.
   *
   * Es texto y no un número porque puede haber más de una moneda, y entonces no hay una
   * cifra: son dos cantidades distintas que se enseñan juntas —«S/ 180.00 · $ 15.99»— en
   * lugar de sumarse en un total que no significaría nada. Vacío si no hay ninguno.
   */
  pendingExpense: string;
  paidCount: number;
  /** Lo que de verdad se pagó, que puede no ser lo estimado, por moneda. */
  paidExpense: string;
  /** Ingresos fijos del mes, pagados o no, por moneda: el sueldo también es un fijo. */
  income: string;
}

/**
 * Escribe juntos los importes de una lista, uno por moneda.
 *
 * Nunca los suma entre sí: soles y dólares no se suman, así que lo que sale es «S/ 180.00 ·
 * $ 15.99» y no una tercera cifra que no corresponde a ningún dinero. Con una sola moneda
 * —lo normal— devuelve exactamente lo que decía antes.
 *
 * @param items lista de fijos a sumar
 * @param pick  de dónde sale el importe de cada uno
 * @return los totales escritos, o vacío si no hay ninguno
 */
function byCurrency(
  items: RecurringOccurrenceResponse[],
  pick: (item: RecurringOccurrenceResponse) => number,
): string {
  const totals = new Map<Currency, number>();
  for (const item of items) {
    totals.set(item.currency, (totals.get(item.currency) ?? 0) + pick(item));
  }
  return [...totals.entries()]
    .map(([currency, amount]) => formatMoney(amount, currency))
    .join(' · ');
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
 *
 * Los tags se escriben en la plantilla, no cada mes. La categoría es una sola y reparte el
 * gasto; el contexto —casa, teletrabajo, mascota— se solapa, y por eso son tags. Al confirmar
 * un mes viajan al movimiento, de modo que lo más previsible del mes deja de ser justo lo que
 * falta en el desglose por tag.
 */
@Component({
  selector: 'app-recurring',
  imports: [
    ReactiveFormsModule,
    BottomSheetComponent,
    CategoryPickerComponent,
    DateFieldComponent,
    SegmentedDirective,
    TagsFieldComponent,
    TagChipComponent,
  ],
  templateUrl: './recurring.html',
  styleUrl: './recurring.scss',
})
export class RecurringPage {
  private readonly api = inject(FinscopeService);
  private readonly styles = inject(CatalogueStylesService);
  private readonly rates = inject(ExchangeRateService);
  private readonly toasts = inject(ToastService);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly items = signal<RecurringOccurrenceResponse[]>([]);
  protected readonly categories = signal<CategoryResponse[]>([]);
  protected readonly types = signal<TransactionTypeResponse[]>([]);

  /** Catálogo de tags del usuario: es lo que el campo ofrece de un toque al escribirlos. */
  protected readonly tagCatalogue = signal<TagResponse[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Si el formulario de arriba está abierto, sea para dar de alta o para modificar. */
  protected readonly showForm = signal(false);

  /** Plantilla que se está modificando, o nulo si el formulario es de alta. */
  protected readonly editingId = signal<number | null>(null);

  /** Fijo cuyo importe real se está ajustando antes de confirmarlo. */
  protected readonly adjustingId = signal<number | null>(null);

  /** El fijo cuyo mes se está registrando con otro importe, que es lo que abre su hoja. */
  protected readonly adjusting = computed(
    () => this.items().find((item) => item.id === this.adjustingId()) ?? null,
  );

  /** Fijo cuya eliminación espera confirmación en su propia fila. */
  protected readonly confirmingId = signal<number | null>(null);

  /**
   * Mes que se está mirando. Abre en el que diga la dirección (`?mes=2026-10`), que es por
   * donde llega un aviso del teléfono, y si no dice ninguno, en el mes en curso.
   */
  protected readonly period = signal(
    monthFromParam(inject(ActivatedRoute).snapshot.queryParamMap.get('mes')) ?? currentMonth(),
  );

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
    // El tipo de cambio del día en que se paga. Solo hace falta fuera de la moneda base, y
    // es `startAdjust` quien decide si es obligatorio, porque depende del fijo que se ajuste.
    exchangeRate: [null as number | null],
  });

  protected readonly currencies = CURRENCIES;

  /**
   * Moneda del fijo que se está dando de alta o editando.
   * Vive fuera del formulario porque se elige tocando un botón, igual que el tipo.
   */
  protected readonly currency = signal<Currency>(BASE_CURRENCY);

  /**
   * Los cuatro campos que no son del formulario reactivo.
   * El selector de categoría, el desplegable de la casa, el campo de mes y el de tags se
   * comunican con `value`/`valueChange` y no implementan el acceso de los formularios
   * reactivos.
   */
  protected readonly kind = signal<TransactionTypeCode>('EXPENSE');
  protected readonly categoryId = signal<number | null>(null);
  protected readonly everyMonths = signal('1');
  protected readonly startValue = signal('');

  /** Tags con los que queda la plantilla, y con los que nacerá el movimiento de cada mes. */
  protected readonly pickedTags = signal<string[]>([]);

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
  protected readonly due = computed(() => this.items().filter((item) => item.status !== 'NOT_DUE'));

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
      pendingExpense: byCurrency(pending.filter(isExpense), (item) => item.amount),
      paidCount: paid.length,
      paidExpense: byCurrency(paid.filter(isExpense), (item) => item.paidAmount ?? item.amount),
      income: byCurrency(
        due.filter((item) => !isExpense(item) && item.status !== 'SKIPPED'),
        (item) => item.paidAmount ?? item.amount,
      ),
    };
  });

  /** El tipo elegido en el formulario, resuelto contra el catálogo de tipos. */
  protected readonly typeId = computed(
    () => this.types().find((type) => type.code === this.kind())?.id ?? null,
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
      items: this.api.listRecurring(month!, year!),
      categories: this.api.listCategories(),
      types: this.api.listTransactionTypes(),
      tags: this.api.listTags(),
    }).subscribe({
      next: ({ items, categories, types, tags }) => {
        this.items.set(items);
        this.categories.set(categories);
        this.types.set(types);
        this.tagCatalogue.set(tags);
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

  protected openForm(): void {
    this.editingId.set(null);
    this.adjustingId.set(null);
    this.confirmingId.set(null);
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
    this.currency.set(item.currency);
    this.categoryId.set(item.categoryId);
    this.pickedTags.set([...item.tags]);
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
      currency: this.currency(),
      dayOfMonth: Number(this.form.controls.dayOfMonth.value),
      everyMonths: Number(this.everyMonths()),
      startMonth,
      startYear,
      // Van siempre, también vacíos: al modificar, la lista reemplaza la que hubiera, y el
      // formulario enseña la definitiva. Callarlos al quitar el último lo dejaría puesto.
      tags: this.pickedTags(),
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

  /**
   * Registra el movimiento con lo previsto: el caso de casi todos los meses.
   *
   * <p>Un fijo que no está en la moneda base necesita además el tipo de cambio del día. Se
   * usa el último que se apuntó, que es lo que evita convertir un toque en un formulario; y
   * si no hay ninguno todavía, se abre el ajuste para escribirlo en lugar de fallar contra
   * la API con un error que el usuario no sabría de dónde sale.</p>
   *
   * @param item fijo que se da por pagado
   */
  protected confirm(item: RecurringOccurrenceResponse): void {
    const { month, year } = this.period();
    const rate = this.needsRate(item) ? this.rates.lastRate(item.currency)?.rate : undefined;
    if (this.needsRate(item) && !rate) {
      this.startAdjust(item);
      return;
    }
    this.run(
      this.api.confirmRecurring(item.id, { month: month!, year: year!, exchangeRate: rate }),
      () => {
        this.rememberRate(item, rate);
        this.toasts.success(
          `«${item.description}» registrado por ${formatMoney(item.amount, item.currency)}`,
        );
      },
    );
  }

  /**
   * Se queda con la tasa que se acaba de usar, para proponerla en el siguiente fijo.
   *
   * @param item fijo confirmado
   * @param rate tipo de cambio con el que se confirmó, si llevaba
   */
  private rememberRate(item: RecurringOccurrenceResponse, rate?: number): void {
    if (rate) {
      this.rates.remember(item.currency, rate, new Date().toISOString());
    }
  }

  /** Abre el ajuste con lo previsto ya puesto: casi siempre solo cambia el importe. */
  protected startAdjust(item: RecurringOccurrenceResponse): void {
    this.showForm.set(false);
    this.editingId.set(null);
    this.adjustingId.set(item.id);
    this.confirmingId.set(null);
    const control = this.adjustForm.controls.exchangeRate;
    if (this.needsRate(item)) {
      this.rates.ensureLoaded(item.currency);
      control.setValidators([Validators.required, Validators.min(0.000001)]);
    } else {
      control.clearValidators();
    }
    this.adjustForm.setValue({
      amount: item.amount,
      // Se propone la última tasa usada, igual que al registrar a mano: teclearla cada mes
      // es el paso de sobra que hace que se deje de confirmar.
      exchangeRate: this.needsRate(item)
        ? (this.rates.lastRate(item.currency)?.rate ?? null)
        : null,
    });
    control.updateValueAndValidity();
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
    const rate = this.needsRate(item)
      ? Number(this.adjustForm.controls.exchangeRate.value)
      : undefined;
    const date = this.adjustDate();
    this.run(
      this.api.confirmRecurring(item.id, {
        month: month!,
        year: year!,
        amount,
        exchangeRate: rate,
        // El campo entrega un día suelto y la API espera un instante. Se manda el comienzo
        // del día porque lo que importa es en qué día cae, no a qué hora se pagó.
        date: date ? startOfDay(date) : undefined,
      }),
      () => {
        this.rememberRate(item, rate);
        this.toasts.success(
          `«${item.description}» registrado por ${formatMoney(amount, item.currency)}`,
        );
      },
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

  /**
   * El icono de un fijo es el que se eligió para su categoría; si no se eligió ninguno, se
   * deduce de la descripción, que dice más que la categoría («Netflix» frente a «Servicios»).
   */
  protected icon(item: RecurringOccurrenceResponse): string {
    const chosen = this.styles.styleOf('category', item.category).icon;
    return chosen ? chipIcon(item.category, chosen) : iconFor(item.description || item.category);
  }

  /**
   * Da formato a un importe en la moneda indicada.
   *
   * @param amount   importe a formatear
   * @param currency moneda del importe; la base si no se dice otra
   * @return el importe con el símbolo de su moneda
   */
  protected money(amount: number, currency: Currency = BASE_CURRENCY): string {
    return formatMoney(amount, currency);
  }

  /** Símbolo con el que se rotula cada moneda en el selector del formulario. */
  protected currencySign(currency: Currency): string {
    return currencySymbol(currency);
  }

  /** Nombre de una moneda, para las etiquetas que no caben en un símbolo. */
  protected currencyName(currency: Currency): string {
    return CURRENCY_NAMES[currency];
  }

  /** Si un fijo está en una moneda que exige tipo de cambio al confirmarlo. */
  protected needsRate(item: RecurringOccurrenceResponse): boolean {
    return item.currency !== BASE_CURRENCY;
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
    this.currency.set(BASE_CURRENCY);
    this.categoryId.set(null);
    this.pickedTags.set([]);
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
