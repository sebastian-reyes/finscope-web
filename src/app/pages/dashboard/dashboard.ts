import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of } from 'rxjs';
import { ExchangeRateService } from '../../core/exchange-rate.service';
import { FinscopeService } from '../../core/finscope.service';
import { ToastService } from '../../core/toast.service';
import { TransactionEditorService } from '../../core/transaction-editor.service';
import { describeError } from '../../core/api-error';
import { BASE_CURRENCY, CURRENCY_NAMES, currencySymbol } from '../../core/format/money';
import { currentMonth, monthLabel, toInputDateTime } from '../../core/format/period';
import {
  BudgetResponse,
  Currency,
  CurrencySummaryResponse,
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
  private readonly rates = inject(ExchangeRateService);
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
   * Moneda de la que hablan el reparto y la evolución.
   *
   * No afecta al balance, que enseña todas a la vez: ahí la pregunta es cuánto hay, y hay
   * una respuesta por moneda. En los gráficos sí hace falta elegir, porque un anillo que
   * mezclara soles con dólares repartiría porcentajes de una cantidad que no existe.
   */
  protected readonly currency = signal<Currency>(BASE_CURRENCY);

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

  /**
   * Totales de cada moneda del periodo, que es lo que enseña el balance.
   * Vienen de `byCurrency`, el único desglose al que no afecta la moneda elegida: de él sale
   * también qué monedas ofrecer.
   */
  protected readonly currencyTotals = computed<CurrencySummaryResponse[]>(
    () => this.summary()?.byCurrency ?? [],
  );

  /** Si el periodo tiene movimientos en más de una moneda, que es cuando hay que elegir. */
  protected readonly hasSeveralCurrencies = computed(() => this.currencyTotals().length > 1);

  /** Las monedas entre las que se puede cambiar el reparto, en el orden del resumen. */
  protected readonly currencyChoices = computed(() =>
    this.currencyTotals().map((totals) => totals.currency),
  );

  /**
   * Nombre y simbolo con los que se rotula una moneda en pantalla.
   *
   * @param currency moneda a rotular
   * @return su nombre en castellano
   */
  protected currencyName(currency: Currency): string {
    return CURRENCY_NAMES[currency];
  }

  /**
   * Simbolo de una moneda, para los rotulos donde no cabe su nombre.
   *
   * @param currency moneda a rotular
   * @return su simbolo
   */
  protected currencySign(currency: Currency): string {
    return currencySymbol(currency);
  }

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

  /**
   * Cambia la moneda del reparto y de la evolución.
   *
   * Recarga, no filtra en memoria: los desgloses por categoría y por tag vienen ya acotados
   * del servidor, que es lo que garantiza que el anillo sume exactamente lo que dice el
   * total de esa moneda.
   *
   * @param currency moneda elegida
   */
  protected setCurrency(currency: Currency): void {
    if (this.currency() === currency) {
      return;
    }
    this.currency.set(currency);
    this.load();
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
    // El reparto y la evolucion van acotados a una moneda; el listado de los ultimos
    // movimientos no, porque cada fila ensena la suya.
    const scoped = { ...filters, currency: this.currency() };
    forkJoin({
      summary: this.api.getSummary(scoped),
      series: this.api.getSummarySeries(scoped, this.granularity),
      recent: this.api.listTransactions({
        ...filters,
        page: 0,
        size: RECENT_SIZE,
        sort: 'date,desc',
      }),
      // El plan del mes es lo único de esta pantalla que puede fallar solo. Si se dejara
      // caer con los demás, un problema con los presupuestos borraría el balance, el reparto
      // y el historial, que no tienen nada que ver.
      budgets: this.api.listBudgets(filters.month!, filters.year!).pipe(catchError(() => of(null))),
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
    // Un fijo que no está en la moneda base necesita el tipo de cambio del día, y aquí no
    // hay dónde escribirlo: esta tarjeta es de un toque. Se usa el último que se apuntó, y
    // si todavía no hay ninguno se manda a la pantalla de fijos, que sí puede pedirlo.
    const rate =
      item.currency === BASE_CURRENCY ? undefined : this.rates.lastRate(item.currency)?.rate;
    if (item.currency !== BASE_CURRENCY && !rate) {
      this.toasts.error(
        `Confírmalo desde Fijos: hace falta el tipo de cambio de hoy para registrarlo en ` +
          `${this.currencyName(item.currency).toLowerCase()}.`,
      );
      return;
    }
    this.confirming.set(true);
    this.api
      .confirmRecurring(item.id, { month: month!, year: year!, exchangeRate: rate })
      .subscribe({
        next: () => {
          if (rate) {
            this.rates.remember(item.currency, rate, new Date().toISOString());
          }
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
