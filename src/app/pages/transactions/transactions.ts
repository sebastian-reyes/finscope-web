import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { FinscopeService } from '../../core/finscope.service';
import { TransactionEditorService } from '../../core/transaction-editor.service';
import { describeError } from '../../core/api-error';
import {
  PeriodMode,
  dayGroupLabel,
  endOfDay,
  startOfDay,
  toInputDateTime,
} from '../../core/format/period';
import {
  TransactionFilters,
  TransactionPageQuery,
  TransactionPageResponse,
  TransactionResponse,
  TransactionSummaryResponse,
  TransactionTypeCode,
} from '../../core/models';
import { iconFor } from '../../core/format/icons';
import { AmountComponent } from '../../shared/ui/amount';
import { CategoryChipComponent } from '../../shared/ui/category-chip';
import { DateFieldComponent } from '../../shared/ui/date-field';
import { SegmentedDirective } from '../../shared/ui/segmented';
import { SelectFieldComponent, SelectOption } from '../../shared/ui/select-field';
import { TagChipComponent } from '../../shared/ui/tag-chip';

/** Cuántos movimientos trae cada página por defecto. */
const DEFAULT_SIZE = 20;

/** Cuánto se queda resaltado el movimiento que se acaba de guardar. */
const HIGHLIGHT_MS = 1800;

/** Movimientos de un mismo día, con el rótulo bajo el que se agrupan. */
interface DayGroup {
  /** Vacío cuando la lista no va ordenada por fecha y agrupar por día no significaría nada. */
  label: string;
  transactions: TransactionResponse[];
}

/**
 * Historial de movimientos.
 *
 * Es la pantalla a la que se viene a buscar algo concreto y a corregirlo, así que la lista
 * manda: se lee como un extracto agrupado por día, y tocar cualquier movimiento lo abre
 * entero para cambiarle el monto, la categoría, el nombre, la fecha, el tipo o los tags.
 *
 * Cada fila la encabeza su categoría, que es en qué se fue el dinero; la descripción y los
 * tags quedan debajo, en ese orden, porque matizan pero no clasifican.
 *
 * Sobre la lista se ven los totales del mismo periodo y los mismos filtros, que la API
 * calcula aparte: lo que se está mirando y lo que suma lo que se está mirando son la misma
 * pregunta y no deberían obligar a cambiar de pantalla.
 */
@Component({
  selector: 'app-transactions',
  imports: [
    DatePipe,
    RouterLink,
    AmountComponent,
    CategoryChipComponent,
    DateFieldComponent,
    SegmentedDirective,
    SelectFieldComponent,
    TagChipComponent,
  ],
  templateUrl: './transactions.html',
  styleUrl: './transactions.scss',
})
export class TransactionsPage {
  private readonly api = inject(FinscopeService);
  private readonly route = inject(ActivatedRoute);
  private readonly editor = inject(TransactionEditorService);

  protected readonly result = signal<TransactionPageResponse | null>(null);
  protected readonly summary = signal<TransactionSummaryResponse | null>(null);
  /**
   * Los catálogos son los del editor y no unos propios: alimentan los mismos filtros que
   * el formulario de la hoja y cambian con cada guardado, así que tenerlos en un solo sitio
   * evita que la lista y la hoja discrepen sobre qué categorías existen.
   */
  protected readonly types = this.editor.types;
  protected readonly categories = this.editor.categories;
  protected readonly catalogue = this.editor.catalogue;
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  /** Cómo se acota el periodo: el mes en curso, un rango de días o el historial entero. */
  protected readonly periodMode = signal<PeriodMode>('month');
  protected readonly month = signal(new Date().getMonth() + 1);
  protected readonly year = signal(new Date().getFullYear());
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly typeId = signal<number | null>(null);
  protected readonly categoryId = signal<number | null>(null);
  protected readonly tag = signal<string | null>(null);
  /** Cómo se puede ordenar la lista. */
  protected readonly sortOptions: SelectOption[] = [
    { value: 'date,desc', label: 'Más recientes', icon: 'bi-sort-down' },
    { value: 'date,asc', label: 'Más antiguos', icon: 'bi-sort-up' },
    { value: 'amount,desc', label: 'Monto mayor', icon: 'bi-sort-numeric-down-alt' },
    { value: 'amount,asc', label: 'Monto menor', icon: 'bi-sort-numeric-down' },
  ];

  /** Cuántos movimientos caben en una página. */
  protected readonly sizeOptions: SelectOption[] = [10, 20, 50].map((size) => ({
    value: String(size),
    label: `${size} por página`,
  }));
  protected readonly sort = signal('date,desc');
  protected readonly size = signal(DEFAULT_SIZE);
  protected readonly pageIndex = signal(0);

  /**
   * Movimiento recién guardado, que se resalta un momento en la lista.
   * Tras guardar, la lista se recarga entera y el movimiento puede haber cambiado de sitio
   * —o haber aparecido de la nada—: el destello es lo que dice dónde ha quedado.
   */
  protected readonly highlightId = signal<number | null>(null);

  /** Filtros del periodo, tal y como los entienden el listado y el resumen. */
  protected readonly filters = computed<TransactionFilters>(() => {
    const filters: TransactionFilters = {
      transactionTypeId: this.typeId(),
      categoryId: this.categoryId(),
      tag: this.tag(),
    };
    if (this.periodMode() === 'month') {
      filters.month = this.month();
      filters.year = this.year();
    } else if (this.periodMode() === 'range') {
      // Los extremos se mandan solo si se han escrito: un rango a medias sigue siendo un
      // filtro válido, y la API entiende un extremo ausente como «sin acotar por ese lado».
      filters.dateFrom = this.from() ? startOfDay(this.from()) : null;
      filters.dateTo = this.to() ? endOfDay(this.to()) : null;
    }
    return filters;
  });

  protected readonly query = computed<TransactionPageQuery>(() => ({
    ...this.filters(),
    page: this.pageIndex(),
    size: this.size(),
    sort: this.sort(),
  }));

  /** Mes que se está mirando, en el formato que entiende el selector de mes. */
  /**
   * Las categorías, como opciones del filtro.
   * Cada una lleva su icono y su número de movimientos, que es lo que un `<option>` nativo
   * no admitía y lo que hace la lista reconocible de un vistazo.
   */
  protected readonly categoryOptions = computed<SelectOption[]>(() => [
    { value: '', label: 'Todas las categorías', icon: 'bi-grid-1x2' },
    ...this.categories().map((category) => ({
      value: String(category.id),
      label: category.name,
      icon: iconFor(category.name),
      hint: String(category.transactionCount),
    })),
  ]);

  protected readonly tagOptions = computed<SelectOption[]>(() => [
    { value: '', label: 'Todos los tags', icon: 'bi-tags' },
    ...this.catalogue().map((tag) => ({
      value: tag.name,
      label: tag.name,
      icon: iconFor(tag.name),
      hint: String(tag.transactionCount),
    })),
  ]);

  protected readonly monthValue = computed(
    () => `${this.year()}-${String(this.month()).padStart(2, '0')}`,
  );

  /** Hoy, como tope de los calendarios: no hay movimientos en el futuro que buscar. */
  protected readonly today = toInputDateTime(new Date()).slice(0, 10);

  protected readonly isCurrentMonth = computed(() => {
    const now = new Date();
    return this.month() === now.getMonth() + 1 && this.year() === now.getFullYear();
  });

  /** Código del tipo por el que se filtra, para marcar el botón correspondiente. */
  protected readonly filteredKind = computed(
    () => this.types().find((type) => type.id === this.typeId())?.code ?? null,
  );

  /**
   * Lo que suma de media cada movimiento del tipo por el que se filtra.
   *
   * Solo se calcula con un tipo puesto: mezclando ingresos y egresos, la media sería el
   * promedio de dos cosas que no se suman entre sí y no querría decir nada.
   */
  protected readonly average = computed(() => {
    const totals = this.summary();
    const kind = this.filteredKind();
    if (!totals || !kind || !totals.transactionCount) {
      return null;
    }
    const total = kind === 'INCOME' ? totals.income : totals.expense;
    return total / totals.transactionCount;
  });

  /** Si hay algo puesto que merezca ofrecer un «limpiar». */
  protected readonly isFiltered = computed(
    () =>
      this.typeId() !== null ||
      this.categoryId() !== null ||
      this.tag() !== null ||
      this.periodMode() !== 'month' ||
      !this.isCurrentMonth(),
  );

  protected readonly hasPrevious = computed(() => this.pageIndex() > 0);

  protected readonly hasNext = computed(() => {
    const current = this.result();
    return current ? current.page + 1 < current.totalPages : false;
  });

  /** Qué tramo del total se está viendo, para el pie de la lista. */
  protected readonly rangeLabel = computed(() => {
    const current = this.result();
    if (!current?.totalElements) {
      return '';
    }
    const first = current.page * current.size + 1;
    const last = Math.min(first + current.content.length - 1, current.totalElements);
    return `${first}–${last} de ${current.totalElements}`;
  });

  /**
   * Los movimientos repartidos por día.
   * Solo se agrupa cuando la lista va por fecha: ordenada por monto, los días saldrían
   * troceados y repetidos, así que entonces se devuelve un único grupo sin rótulo.
   */
  protected readonly groups = computed<DayGroup[]>(() => {
    const transactions = this.result()?.content ?? [];
    if (!this.sort().startsWith('date')) {
      return transactions.length ? [{ label: '', transactions }] : [];
    }
    const groups: DayGroup[] = [];
    for (const transaction of transactions) {
      const label = dayGroupLabel(transaction.date);
      const current = groups.at(-1);
      if (current?.label === label) {
        current.transactions.push(transaction);
      } else {
        groups.push({ label, transactions: [transaction] });
      }
    }
    return groups;
  });

  constructor() {
    // La pantalla de tags enlaza aquí con ?tag= para ver qué movimientos lo llevan. Ese
    // enlace pregunta por el tag y no por el mes, así que se abre el historial entero: si
    // no, un tag que no se usa desde marzo aparecería como si no tuviera nada.
    //
    // El inicio enlaza igual pero añadiendo ?mes= y ?anio=, porque allí la pregunta ya venía
    // acotada a un mes: quien toca «ocio» en el reparto de agosto quiere el ocio de agosto,
    // y abrirle el historial entero le contestaría otra cosa.
    const params = this.route.snapshot.queryParamMap;
    const month = Number(params.get('mes'));
    const year = Number(params.get('anio'));
    const scoped = Boolean(month && year);
    if (scoped) {
      this.month.set(month);
      this.year.set(year);
    }

    const tag = params.get('tag');
    if (tag) {
      this.tag.set(tag);
    }
    const category = Number(params.get('categoria'));
    if (category) {
      this.categoryId.set(category);
    }
    if ((tag || category) && !scoped) {
      this.periodMode.set('all');
    }

    this.editor.refreshCatalogues();
    this.reload();

    // La hoja vive en la carcasa y puede abrirse desde cualquier sitio, incluido el botón
    // central estando en esta pantalla: lo que se guarde ahí tiene que verse aquí, así que
    // la lista escucha lo que pasa en ella en lugar de enterarse por sus propios botones.
    this.editor.changes$.pipe(takeUntilDestroyed()).subscribe((change) => {
      if (change.kind === 'saved') {
        this.highlight(change.id);
      } else if (this.result()?.content.length === 1 && this.pageIndex() > 0) {
        // Borrado el último movimiento de una página, quedarse en ella la dejaría vacía.
        this.pageIndex.update((page) => page - 1);
      }
      this.reload();
    });
  }

  /** Vuelve a pedir la página y sus totales con los filtros que haya puestos. */
  protected reload(): void {
    this.loading.set(true);
    this.error.set(null);
    forkJoin({
      result: this.api.listTransactions(this.query()),
      summary: this.api.getSummary(this.filters()),
    }).subscribe({
      next: ({ result, summary }) => {
        this.result.set(result);
        this.summary.set(summary);
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(describeError(error));
        this.loading.set(false);
      },
    });
  }

  protected setPeriodMode(mode: PeriodMode): void {
    this.periodMode.set(mode);
    this.search();
  }

  /** Salta al mes elegido en el calendario. */
  protected setMonthValue(value: string): void {
    if (!value) {
      return;
    }
    const [year, month] = value.split('-').map(Number);
    this.year.set(year);
    this.month.set(month);
    this.search();
  }

  /** Desplaza el mes que se está mirando. */
  protected shiftMonth(delta: number): void {
    const moved = new Date(this.year(), this.month() - 1 + delta, 1);
    this.month.set(moved.getMonth() + 1);
    this.year.set(moved.getFullYear());
    this.search();
  }

  protected setFrom(value: string): void {
    this.from.set(value);
    this.search();
  }

  protected setTo(value: string): void {
    this.to.set(value);
    this.search();
  }

  /** Filtra por ingresos, por egresos o por nada. */
  protected setKind(code: TransactionTypeCode | null): void {
    const type = code ? this.types().find((candidate) => candidate.code === code) : null;
    this.typeId.set(type?.id ?? null);
    this.search();
  }

  protected setCategory(id: string): void {
    this.categoryId.set(id ? Number(id) : null);
    this.search();
  }

  /** Filtra por la categoría en la que se ha tocado dentro de la lista. */
  protected filterByCategory(id: number): void {
    this.categoryId.set(id);
    this.search();
  }

  protected setTag(name: string): void {
    this.tag.set(name || null);
    this.search();
  }

  protected setSort(value: string): void {
    this.sort.set(value);
    this.search();
  }

  protected setSize(value: string): void {
    this.size.set(Number(value) || DEFAULT_SIZE);
    this.search();
  }

  protected goToPage(page: number): void {
    this.pageIndex.set(page);
    this.reload();
    // Al cambiar de página se empieza a leer por arriba, no por donde se quedó el desplace.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected clearFilters(): void {
    const now = new Date();
    this.periodMode.set('month');
    this.month.set(now.getMonth() + 1);
    this.year.set(now.getFullYear());
    this.from.set('');
    this.to.set('');
    this.typeId.set(null);
    this.categoryId.set(null);
    this.tag.set(null);
    this.search();
  }

  protected openCreate(): void {
    this.editor.openCreate();
  }

  protected openEdit(transaction: TransactionResponse): void {
    this.editor.openEdit(transaction);
  }

  /**
   * Marca un movimiento como recién tocado y lo desmarca solo.
   * El destello dura lo justo para encontrarlo con la vista; dejarlo puesto lo convertiría
   * en un estado más que hay que entender.
   *
   * @param id identificador del movimiento
   */
  private highlight(id: number): void {
    this.highlightId.set(id);
    setTimeout(() => {
      if (this.highlightId() === id) {
        this.highlightId.set(null);
      }
    }, HIGHLIGHT_MS);
  }

  /** Cualquier cambio de filtro devuelve a la primera página: la que se veía ya no aplica. */
  private search(): void {
    this.pageIndex.set(0);
    this.reload();
  }
}
