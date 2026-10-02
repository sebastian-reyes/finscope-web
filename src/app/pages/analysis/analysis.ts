import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Observable, catchError, forkJoin, map, of, switchMap } from 'rxjs';
import { CatalogueStylesService } from '../../core/catalogue-styles.service';
import { ExchangeRateService } from '../../core/exchange-rate.service';
import { FinscopeService } from '../../core/finscope.service';
import { MoneyViewService } from '../../core/money-view.service';
import { RefreshService } from '../../core/refresh.service';
import { TransactionEditorService } from '../../core/transaction-editor.service';
import { describeError } from '../../core/api-error';
import { CURRENCIES, CURRENCY_NAMES, currencySymbol, formatMoney } from '../../core/format/money';
import { bucketLabel, dayGroupLabel, monthLabel } from '../../core/format/period';
import {
  Currency,
  SummaryBucketResponse,
  SummaryConversion,
  SummarySeriesResponse,
  TransactionResponse,
  TransactionSummaryResponse,
} from '../../core/models';
import { AmountComponent } from '../../shared/ui/amount';
import { CategoryChipComponent } from '../../shared/ui/category-chip';
import { DateFieldComponent } from '../../shared/ui/date-field';
import { SegmentedDirective } from '../../shared/ui/segmented';
import { TagChipComponent } from '../../shared/ui/tag-chip';
import { TrendChartComponent } from '../dashboard/trend-chart';
import {
  AnalysisPeriod,
  AnalysisScope,
  CategorySide,
  Change,
  categoryRows,
  change,
  fillMonths,
  insights,
  isCurrentPeriod,
  largestExpenses,
  pace,
  periodFilters,
  previousPeriod,
  savingsRate,
  shiftPeriod,
  trendFilters,
  trendStats,
} from './analysis-report';
import { PaceChartComponent } from './pace-chart';

/** Cuántos tags se enseñan: son contexto, no reparto, y una lista larga no dice nada más. */
const TOP_TAGS = 5;

/** Cuántos gastos grandes se enseñan: los que se recuerdan, no un segundo historial. */
const LARGEST = 5;

/** Las dos series diarias del ritmo: el mes que se mira y el anterior. */
interface PaceSeries {
  current: SummarySeriesResponse;
  previous: SummarySeriesResponse;
}

/**
 * Análisis: el dinero mirado hacia atrás.
 *
 * El inicio contesta a cómo va el mes; esta pantalla, a cómo va comparado con antes. Por eso
 * todas las cifras llevan al lado su cambio frente al periodo anterior —el mes de antes o el
 * año de antes—, y la evolución enseña doce meses y no solo el que se mira.
 *
 * Todo va convertido a una sola moneda: comparar exige sumar, y sumar soles con dólares sin
 * convertir no da ninguna cantidad. Lo que cada moneda movió por separado tiene su propia
 * tarjeta, y solo aparece cuando hay más de una.
 */
@Component({
  selector: 'app-analysis',
  imports: [
    AmountComponent,
    CategoryChipComponent,
    DateFieldComponent,
    PaceChartComponent,
    RouterLink,
    SegmentedDirective,
    TagChipComponent,
    TrendChartComponent,
  ],
  templateUrl: './analysis.html',
  styleUrl: './analysis.scss',
})
export class AnalysisPage {
  private readonly api = inject(FinscopeService);
  private readonly rates = inject(ExchangeRateService);
  private readonly styles = inject(CatalogueStylesService);
  private readonly editor = inject(TransactionEditorService);

  protected readonly summary = signal<TransactionSummaryResponse | null>(null);
  /** El periodo anterior. Si no se pudo pedir, las cifras se enseñan sin comparar. */
  protected readonly previous = signal<TransactionSummaryResponse | null>(null);
  protected readonly series = signal<SummarySeriesResponse | null>(null);

  /** Las series diarias del ritmo. Solo en la vista mensual; nulas si no se pudieron pedir. */
  private readonly paceSeries = signal<PaceSeries | null>(null);

  /** Los más grandes de cada moneda, tal y como llegan; nulo si no se pudieron pedir. */
  private readonly largestByCurrency = signal<TransactionResponse[][] | null>(null);

  /**
   * Identificador del tipo «egreso», que es como el listado filtra los gastos.
   * Se pide una vez: el catálogo de tipos no cambia mientras se usa la pantalla.
   */
  private expenseTypeId: number | null = null;

  /** Qué reparte la tarjeta de categorías: lo que se gastó, que es lo normal, o lo que entró. */
  protected readonly side = signal<CategorySide>('expense');
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly period = signal<AnalysisPeriod>(currentPeriod());

  protected readonly scopes: ReadonlyArray<{ value: AnalysisScope; label: string }> = [
    { value: 'month', label: 'Mes' },
    { value: 'year', label: 'Año' },
  ];

  /**
   * La moneda en la que se lee todo. Abre en la del inicio, pero cambiarla aquí no la cambia
   * allí: en el inicio se puede ver cada moneda por separado y aquí no, así que no son la
   * misma preferencia.
   */
  protected readonly currency = signal<Currency>(
    inject(MoneyViewService).view() === 'USD' ? 'USD' : 'PEN',
  );

  /** El último tipo registrado en dólares, que es el que sirve para verlo todo en dólares. */
  private readonly usdRate = computed(() => this.rates.lastRate('USD')?.rate ?? null);

  /** Si se puede ver en dólares: hace falta un tipo de referencia. */
  protected readonly offersUsd = computed(() => !!this.usdRate());

  private readonly conversion = computed<SummaryConversion>(() =>
    this.currency() === 'USD' && this.usdRate()
      ? { convertTo: 'USD', rate: this.usdRate() }
      : { convertTo: 'PEN' },
  );

  /** La moneda en la que de verdad vienen las cifras, que es la de la conversión. */
  protected readonly shownCurrency = computed<Currency>(() => this.conversion().convertTo);

  protected readonly isCurrent = computed(() => isCurrentPeriod(this.period()));

  /** Cómo se nombra el periodo: «Septiembre», «Marzo 2025» o «2025». */
  protected readonly title = computed(() => {
    const { scope, month, year } = this.period();
    return scope === 'year' ? String(year) : monthLabel(month, year);
  });

  /** Contra qué se compara, dicho como se lee: «vs. agosto» o «vs. 2024». */
  protected readonly versus = computed(() => {
    const before = previousPeriod(this.period());
    return before.scope === 'year'
      ? String(before.year)
      : monthLabel(before.month, before.year).toLowerCase();
  });

  /** El mes en el formato del selector de mes. */
  protected readonly monthValue = computed(() => {
    const { month, year } = this.period();
    return `${year}-${String(month).padStart(2, '0')}`;
  });

  /** Las cuatro cifras de arriba, cada una con su cambio. */
  protected readonly figures = computed(() => {
    const now = this.summary();
    if (!now) {
      return null;
    }
    const before = this.previous();
    const rate = savingsRate(now.income, now.expense);
    const rateBefore = before ? savingsRate(before.income, before.expense) : null;
    return {
      income: now.income,
      expense: now.expense,
      net: now.net,
      rate,
      incomeChange: change(now.income, before?.income),
      expenseChange: change(now.expense, before?.expense),
      // El ahorro ya es un porcentaje: su cambio se cuenta en puntos, no en porcentaje de
      // porcentaje, que no lo entendería nadie.
      rateDelta: rate !== null && rateBefore !== null ? rate - rateBefore : null,
    };
  });

  protected readonly categories = computed(() =>
    categoryRows(
      this.summary()?.byCategory ?? [],
      this.previous()?.byCategory ?? null,
      this.side(),
    ),
  );

  /** Las conclusiones de la tarjeta «Lo que destaca». */
  protected readonly highlights = computed(() => {
    const now = this.summary();
    return now
      ? insights(now, this.previous(), this.shownCurrency(), this.versus(), !this.isCurrent())
      : [];
  });

  /** El ritmo del mes contra el anterior. Solo existe en la vista mensual. */
  protected readonly pace = computed(() => {
    const series = this.paceSeries();
    return series && this.period().scope === 'month'
      ? pace(series.current, series.previous, this.period())
      : null;
  });

  /** Cómo se llama el mes anterior en la leyenda del ritmo: «Septiembre». */
  protected readonly previousTitle = computed(() => {
    const before = previousPeriod(this.period());
    return monthLabel(before.month, before.year);
  });

  /**
   * El ritmo dicho con palabras, debajo del gráfico.
   *
   * En el mes en curso compara con el anterior **el mismo día** y dice cómo cerraría a este
   * paso; en uno cerrado, cómo cerró cada uno. La diferencia va aparte porque es lo que lleva
   * el color: ir por encima del mes pasado es la mala noticia.
   */
  protected readonly paceReading = computed(() => {
    const p = this.pace();
    if (!p) {
      return null;
    }
    const money = (amount: number) => formatMoney(amount, this.shownCurrency());
    const previousTotal = p.previous[p.previous.length - 1] ?? 0;
    const compared = p.projection === null ? previousTotal : p.previousAtDay;
    const diff = p.spent - compared;
    const closed = p.projection === null;
    const lead = closed
      ? `${this.title()} cerró en ${money(p.spent)}; ${this.versus()}, en ${money(previousTotal)}.`
      : `Al día ${p.day} llevas ${money(p.spent)}. En ${this.versus()}, a estas alturas, llevabas ${money(p.previousAtDay)}.`;
    let gap = '';
    if (compared > 0 && Math.abs(diff) >= 0.01) {
      if (closed) {
        gap = diff > 0 ? `Fueron ${money(diff)} más.` : `Fueron ${money(-diff)} menos.`;
      } else {
        gap = diff > 0 ? `Vas ${money(diff)} por encima.` : `Vas ${money(-diff)} por debajo.`;
      }
    }
    return {
      lead,
      gap,
      over: diff > 0,
      projection: p.projection === null ? null : money(p.projection),
    };
  });

  /** Los gastos más grandes del periodo, comparados en la moneda en que se lee la pantalla. */
  protected readonly largest = computed(() => {
    const lists = this.largestByCurrency();
    return lists ? largestExpenses(lists, this.shownCurrency(), this.usdRate(), LARGEST) : [];
  });

  /** Los tags en los que más se gastó. Sus cifras se solapan y por eso no llevan porcentaje. */
  protected readonly tags = computed(() =>
    (this.summary()?.byTag ?? [])
      .filter((row) => row.tag && row.expense > 0)
      .sort((a, b) => b.expense - a.expense)
      .slice(0, TOP_TAGS),
  );

  /** Lo que cada moneda movió sin convertir. Solo tiene sentido con más de una. */
  protected readonly byCurrency = computed(() => {
    const rows = this.summary()?.byCurrency ?? [];
    return rows.length > 1 ? rows : [];
  });

  protected readonly trend = computed(() => {
    const series = this.series();
    return series ? fillMonths(series, this.period()) : null;
  });

  protected readonly stats = computed(() => {
    const trend = this.trend();
    return trend ? trendStats(trend) : null;
  });

  constructor() {
    this.styles.watch();
    this.rates.ensureLoaded('USD');
    this.load();

    // Cualquier cambio en cómo se convierte vuelve a pedir las cifras: elegir otra moneda, o
    // que llegue el tipo de referencia de los dólares cuando se eligieron antes de saberlo
    // —hasta entonces se ven en soles—. La primera pasada solo toma nota: esa carga ya salió.
    let requested: string | null = null;
    effect(() => {
      const { convertTo, rate } = this.conversion();
      const key = `${convertTo}:${rate ?? ''}`;
      untracked(() => {
        if (requested !== null && requested !== key) {
          this.load();
        }
        requested = key;
      });
    });

    inject(DestroyRef).onDestroy(inject(RefreshService).register(() => this.load(), this.loading));

    // Lo que se registra desde el botón central —o se corrige desde un gasto grande— cambia
    // las cifras que se están mirando.
    this.editor.changes$.pipe(takeUntilDestroyed()).subscribe(() => this.load());
  }

  protected setScope(scope: AnalysisScope): void {
    if (this.period().scope === scope) {
      return;
    }
    this.period.update((period) => ({ ...period, scope }));
    this.load();
  }

  protected shift(delta: number): void {
    this.period.update((period) => shiftPeriod(period, delta));
    this.load();
  }

  protected setMonthValue(value: string): void {
    if (!value) {
      return;
    }
    const [year, month] = value.split('-').map(Number);
    this.period.set({ scope: 'month', month, year });
    this.load();
  }

  /** Cambia la moneda. La recarga la hace el efecto que vigila la conversión. */
  protected setCurrency(currency: Currency): void {
    this.currency.set(currency);
  }

  protected load(): void {
    this.loading.set(true);
    this.error.set(null);
    const period = this.period();
    const conversion = this.conversion();
    forkJoin({
      summary: this.api.getSummary(periodFilters(period), conversion),
      // Sin el periodo anterior la pantalla sigue diciendo todo menos cuánto cambió.
      previous: this.api
        .getSummary(periodFilters(previousPeriod(period)), conversion)
        .pipe(catchError(() => of(null))),
      series: this.api.getSummarySeries(trendFilters(period), 'MONTH', conversion),
      // Lo que sigue es complementario: si falla, su tarjeta no sale y el resto se ve igual.
      pace: this.loadPace(period, conversion),
      largest: this.loadLargest(period).pipe(catchError(() => of(null))),
    }).subscribe({
      next: ({ summary, previous, series, pace, largest }) => {
        this.summary.set(summary);
        this.previous.set(previous);
        this.series.set(series);
        this.paceSeries.set(pace);
        this.largestByCurrency.set(largest);
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(describeError(error));
        this.loading.set(false);
      },
    });
  }

  /**
   * Las dos series diarias del ritmo. En la vista anual no se piden: treinta puntos por mes
   * durante doce meses no dicen nada que no diga ya la evolución.
   */
  private loadPace(
    period: AnalysisPeriod,
    conversion: SummaryConversion,
  ): Observable<PaceSeries | null> {
    if (period.scope !== 'month') {
      return of(null);
    }
    return forkJoin({
      current: this.api.getSummarySeries(periodFilters(period), 'DAY', conversion),
      previous: this.api.getSummarySeries(periodFilters(previousPeriod(period)), 'DAY', conversion),
    }).pipe(catchError(() => of(null)));
  }

  /**
   * Los gastos más grandes de cada moneda.
   *
   * Una petición por moneda y no una sola: el listado ordena por el importe tal cual, sin
   * convertir, y mezclando monedas cien dólares quedarían por detrás de doscientos soles. Lo
   * más grande de todo está seguro entre lo más grande de cada una.
   */
  private loadLargest(period: AnalysisPeriod): Observable<TransactionResponse[][]> {
    const typeId$ =
      this.expenseTypeId !== null
        ? of(this.expenseTypeId)
        : this.api
            .listTransactionTypes()
            .pipe(map((types) => types.find((type) => type.code === 'EXPENSE')?.id ?? null));
    return typeId$.pipe(
      switchMap((typeId) => {
        this.expenseTypeId = typeId;
        if (typeId === null) {
          return of([]);
        }
        return forkJoin(
          CURRENCIES.map((currency) =>
            this.api
              .listTransactions({
                ...periodFilters(period),
                transactionTypeId: typeId,
                currency,
                page: 0,
                size: LARGEST,
                sort: 'amount,desc',
              })
              .pipe(map((page) => page.content)),
          ),
        );
      }),
    );
  }

  protected setSide(side: CategorySide): void {
    this.side.set(side);
  }

  /** Abre un gasto grande en el editor, que es donde se corrige si estaba mal apuntado. */
  protected openTransaction(transaction: TransactionResponse): void {
    this.editor.openEdit(transaction);
  }

  /** «Hoy», «Ayer» o la fecha, como en el resto de listas de movimientos. */
  protected dayOf(transaction: TransactionResponse): string {
    return dayGroupLabel(transaction.date);
  }

  /**
   * Adónde lleva una categoría: a sus movimientos del mismo mes.
   * En la vista anual no enlaza, porque el historial no sabe abrir un año entero.
   *
   * @param categoryId categoría de la fila
   * @return los parámetros del historial, o nulo si no hay adónde ir
   */
  protected categoryLink(categoryId: number): Record<string, number> | null {
    const { scope, month, year } = this.period();
    return scope === 'month' ? { categoria: categoryId, mes: month, anio: year } : null;
  }

  protected iconOf(name: string): string {
    return this.styles.iconOf('category', name);
  }

  protected readonly currencies = CURRENCIES;

  protected currencyName(currency: Currency): string {
    return CURRENCY_NAMES[currency];
  }

  protected currencySign(currency: Currency): string {
    return currencySymbol(currency);
  }

  /** «Marzo 2026», para decir de qué mes es una cifra de la evolución. */
  protected monthOf(bucket: SummaryBucketResponse): string {
    const label = bucketLabel(bucket.periodStart, 'MONTH');
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  /**
   * El cambio dicho con palabras y con el color de lo que significa: que suba el gasto es malo
   * y que suba lo que entra es bueno, así que el mismo «+12 %» va en un color u otro.
   *
   * @param value cambio de la cifra
   * @param goodWhen hacia dónde es una buena noticia
   * @return la clase del tono
   */
  protected tone(value: Change | null, goodWhen: 'up' | 'down'): string {
    if (!value || value.direction === 'same') {
      return 'is-flat';
    }
    return value.direction === goodWhen ? 'is-good' : 'is-bad';
  }

  protected arrow(value: Change): string {
    return value.direction === 'up'
      ? 'bi-arrow-up'
      : value.direction === 'down'
        ? 'bi-arrow-down'
        : 'bi-dash';
  }
}

function currentPeriod(): AnalysisPeriod {
  const now = new Date();
  return { scope: 'month', month: now.getMonth() + 1, year: now.getFullYear() };
}
