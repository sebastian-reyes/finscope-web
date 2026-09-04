import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of } from 'rxjs';
import { FinscopeService } from '../../core/finscope.service';
import { ToastService } from '../../core/toast.service';
import { TransactionEditorService } from '../../core/transaction-editor.service';
import { describeError } from '../../core/api-error';
import { currentMonth, monthLabel, toInputDateTime } from '../../core/format/period';
import {
  BudgetResponse,
  RecurringOccurrenceResponse,
  SummaryGranularity,
  SummarySeriesResponse,
  TransactionResponse,
  TransactionSummaryResponse,
} from '../../core/models';
import { AmountComponent } from '../../shared/ui/amount';
import { BudgetSummaryComponent } from './budget-summary';
import { DateFieldComponent } from '../../shared/ui/date-field';
import { QuickTransactionComponent } from './quick-transaction';
import { RecentTransactionsComponent } from './recent-transactions';
import { RecurringSummaryComponent } from './recurring-summary';
import { SpendingBreakdown, SpendingChartComponent } from './spending-chart';
import { TrendChartComponent } from './trend-chart';
import { SegmentedDirective } from '../../shared/ui/segmented';

/** Cuántos movimientos recientes se enseñan antes de mandar al historial completo. */
const RECENT_SIZE = 6;

/** Cuánto se queda resaltado el movimiento que se acaba de registrar. */
const HIGHLIGHT_MS = 1800;

/**
 * Pantalla de inicio.
 *
 * Contesta, en este orden, a cuánto tengo, en qué se me va y qué he movido últimamente, y
 * deja registrar sin cambiar de sitio. El periodo por defecto es el mes en curso, que es la
 * unidad en la que se piensa un sueldo.
 */
@Component({
  selector: 'app-dashboard',
  imports: [
    AmountComponent,
    BudgetSummaryComponent,
    DateFieldComponent,
    QuickTransactionComponent,
    RecentTransactionsComponent,
    RecurringSummaryComponent,
    RouterLink,
    SegmentedDirective,
    SpendingChartComponent,
    TrendChartComponent,
  ],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class DashboardPage {
  private readonly api = inject(FinscopeService);
  private readonly route = inject(ActivatedRoute);
  private readonly editor = inject(TransactionEditorService);
  private readonly toasts = inject(ToastService);

  protected readonly summary = signal<TransactionSummaryResponse | null>(null);
  protected readonly series = signal<SummarySeriesResponse | null>(null);
  protected readonly recent = signal<TransactionResponse[]>([]);
  /** Plan del mes, para contestar a «voy bien» y no solo a «cuánto llevo gastado». */
  protected readonly budgets = signal<BudgetResponse[]>([]);

  /**
   * Si el plan del mes no pudo cargarse.
   *
   * Se lleva aparte del error de la pantalla porque no es lo mismo: sin balance no hay nada
   * que mirar, pero sin presupuestos el resto del inicio sigue contestando a todo lo que
   * conteste siempre. Tampoco se puede callar y enseñar el hueco vacío, que diría «este mes
   * no tiene presupuesto» cuando lo que pasa es que no se sabe.
   */
  protected readonly budgetsFailed = signal(false);

  /**
   * Los fijos del mes, para poder marcar lo que ya se pagó sin cambiar de pantalla.
   * Un recordatorio que vive donde nadie entra no recuerda nada, y a la pantalla de fijos
   * se entra a darlos de alta, que es algo que se hace una vez.
   */
  protected readonly recurring = signal<RecurringOccurrenceResponse[]>([]);

  /** Si los fijos no pudieron cargarse, por lo mismo que los presupuestos: caen solos. */
  protected readonly recurringFailed = signal(false);

  /** Mientras se registra uno, para que no se pueda dar dos veces por pagado. */
  protected readonly confirming = signal(false);
  /** Los mismos catálogos que usa la hoja de registro, para no pedirlos dos veces. */
  protected readonly types = this.editor.types;
  protected readonly categories = this.editor.categories;
  protected readonly tags = this.editor.catalogue;
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  /** Movimiento recién registrado, que se señala un momento entre los últimos. */
  protected readonly highlightId = signal<number | null>(null);

  /** Mes que se está mirando. Se mueve con las flechas de la cabecera. */
  protected readonly period = signal(currentMonth());

  /**
   * Por qué se reparte el gasto en la tarjeta del anillo.
   *
   * La categoría es el reparto de verdad y por eso abre; los tags contestan a la otra
   * pregunta —en qué contexto se gastó— y no salen de la API en el mismo viaje, sino en el
   * mismo resumen, así que cambiar de vista no pide nada al servidor.
   */
  protected readonly breakdown = signal<SpendingBreakdown>('category');

  protected readonly breakdowns: ReadonlyArray<{
    mode: SpendingBreakdown;
    label: string;
    icon: string;
  }> = [
    { mode: 'category', label: 'Categorías', icon: 'bi-grid-1x2' },
    { mode: 'tag', label: 'Tags', icon: 'bi-tags' },
  ];

  /**
   * Tramos de la evolución. Dentro de un mes el día es lo que se entiende; el resto del
   * periodo es cosa del historial.
   */
  private readonly granularity: SummaryGranularity = 'DAY';

  /**
   * Marca de la última petición de registrar llegada por la URL.
   * Se escucha en lugar de leerse una vez porque el botón central puede pulsarse estando ya
   * en esta pantalla, y entonces no hay componente nuevo que construir.
   */
  protected readonly focusRequest = toSignal(
    this.route.queryParamMap.pipe(map((params) => Number(params.get('registrar')) || null)),
    { initialValue: null },
  );

  protected readonly title = computed(() => {
    const { month, year } = this.period();
    return monthLabel(month!, year!);
  });

  /**
   * El mismo mes, para los enlaces que salen del reparto hacia el historial.
   * Sin él, tocar «ocio» en el reparto de agosto abriría el ocio de todos los tiempos, que
   * no es lo que se estaba preguntando.
   */
  protected readonly chartPeriod = computed(() => {
    const { month, year } = this.period();
    return { month: month!, year: year! };
  });

  /** Mes que se está mirando, en el formato que entiende el selector de mes. */
  protected readonly monthValue = computed(() => {
    const { month, year } = this.period();
    return `${year}-${String(month).padStart(2, '0')}`;
  });

  /** Hoy, como tope del calendario: no hay balance que mirar en el futuro. */
  protected readonly today = toInputDateTime(new Date()).slice(0, 10);

  protected readonly isCurrentMonth = computed(() => {
    const now = new Date();
    const { month, year } = this.period();
    return month === now.getMonth() + 1 && year === now.getFullYear();
  });

  constructor() {
    this.editor.refreshCatalogues();
    this.load();

    // Lo registrado desde el botón central de la barra inferior no pasa por el formulario
    // de esta pantalla, pero cambia el balance que se está mirando: sin esto, se guardaría
    // un gasto y el número de arriba seguiría diciendo lo de antes.
    this.editor.changes$.pipe(takeUntilDestroyed()).subscribe((change) => {
      if (change.kind === 'saved') {
        this.highlight(change.id);
      }
      this.load();
    });
  }

  /** Salta al mes elegido en el calendario. */
  protected setMonthValue(value: string): void {
    if (!value) {
      return;
    }
    const [year, month] = value.split('-').map(Number);
    this.period.set({ month, year });
    this.load();
  }

  /** Desplaza el periodo un mes hacia atrás o hacia delante. */
  protected shiftMonth(delta: number): void {
    const { month, year } = this.period();
    const moved = new Date(year!, month! - 1 + delta, 1);
    this.period.set({ month: moved.getMonth() + 1, year: moved.getFullYear() });
    this.load();
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    const filters = this.period();
    forkJoin({
      summary: this.api.getSummary(filters),
      series: this.api.getSummarySeries(filters, this.granularity),
      recent: this.api.listTransactions({
        ...filters,
        page: 0,
        size: RECENT_SIZE,
        sort: 'date,desc',
      }),
      // El plan del mes es lo único de esta pantalla que puede fallar solo. Si se dejara
      // caer con los demás, un problema con los presupuestos borraría el balance, el reparto
      // y el historial, que no tienen nada que ver.
      budgets: this.api
        .listBudgets(filters.month!, filters.year!)
        .pipe(catchError(() => of(null))),
      // Los fijos caen solos por el mismo motivo que los presupuestos: sin ellos el inicio
      // sigue contestando a todo lo demás.
      recurring: this.api
        .listRecurring(filters.month!, filters.year!)
        .pipe(catchError(() => of(null))),
    }).subscribe({
      next: ({ summary, series, recent, budgets, recurring }) => {
        this.summary.set(summary);
        this.series.set(series);
        this.recent.set(recent.content);
        this.budgets.set(budgets ?? []);
        this.budgetsFailed.set(budgets === null);
        this.recurring.set(recurring ?? []);
        this.recurringFailed.set(recurring === null);
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(describeError(error));
        this.loading.set(false);
      },
    });
  }

  /**
   * Tras registrar un movimiento hay que recalcularlo todo, incluidos los catálogos: el
   * número de movimientos de cada categoría y de cada tag es lo que ordena sus fichas en el
   * formulario, y acaba de cambiar.
   */
  protected onSaved(id: number): void {
    this.highlight(id);
    this.load();
    this.editor.refreshCatalogues();
  }

  /**
   * Da por pagado un fijo con el importe de siempre.
   *
   * Se recarga la pantalla entera y no solo la tarjeta porque acaba de aparecer un
   * movimiento: el balance, el reparto por categoría y el avance del presupuesto de esa
   * categoría cambian todos a la vez, y dejarlos como estaban sería enseñar tres cifras
   * que ya no cuadran con la cuarta.
   *
   * @param item fijo que el usuario acaba de marcar
   */
  protected onRecurringConfirmed(item: RecurringOccurrenceResponse): void {
    if (this.confirming()) {
      return;
    }
    const { month, year } = this.period();
    this.confirming.set(true);
    this.api.confirmRecurring(item.id, { month: month!, year: year! }).subscribe({
      next: () => {
        this.toasts.success(`«${item.description}» registrado`);
        this.confirming.set(false);
        this.load();
      },
      error: (error) => {
        this.confirming.set(false);
        this.toasts.error(describeError(error));
      },
    });
  }

  /** Alguien creó una categoría desde el formulario: el catálogo de aquí ya no vale. */
  protected onCatalogueChanged(): void {
    this.editor.refreshCatalogues();
  }

  /**
   * Señala el movimiento recién registrado y lo deja de señalar solo.
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
}
