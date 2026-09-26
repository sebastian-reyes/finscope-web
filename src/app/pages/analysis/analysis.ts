import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { CatalogueStylesService } from '../../core/catalogue-styles.service';
import { ExchangeRateService } from '../../core/exchange-rate.service';
import { FinscopeService } from '../../core/finscope.service';
import { MoneyViewService } from '../../core/money-view.service';
import { RefreshService } from '../../core/refresh.service';
import { TransactionEditorService } from '../../core/transaction-editor.service';
import { describeError } from '../../core/api-error';
import { CURRENCIES, CURRENCY_NAMES, currencySymbol } from '../../core/format/money';
import { bucketLabel, monthLabel } from '../../core/format/period';
import {
  Currency,
  SummaryBucketResponse,
  SummaryConversion,
  SummarySeriesResponse,
  TransactionSummaryResponse,
} from '../../core/models';
import { AmountComponent } from '../../shared/ui/amount';
import { DateFieldComponent } from '../../shared/ui/date-field';
import { SegmentedDirective } from '../../shared/ui/segmented';
import { TagChipComponent } from '../../shared/ui/tag-chip';
import { TrendChartComponent } from '../dashboard/trend-chart';
import {
  AnalysisPeriod,
  AnalysisScope,
  Change,
  categoryRows,
  change,
  fillMonths,
  isCurrentPeriod,
  periodFilters,
  previousPeriod,
  savingsRate,
  shiftPeriod,
  trendFilters,
  trendStats,
} from './analysis-report';

/** Cuántos tags se enseñan: son contexto, no reparto, y una lista larga no dice nada más. */
const TOP_TAGS = 5;

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
    DateFieldComponent,
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

  protected readonly summary = signal<TransactionSummaryResponse | null>(null);
  /** El periodo anterior. Si no se pudo pedir, las cifras se enseñan sin comparar. */
  protected readonly previous = signal<TransactionSummaryResponse | null>(null);
  protected readonly series = signal<SummarySeriesResponse | null>(null);
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
    categoryRows(this.summary()?.byCategory ?? [], this.previous()?.byCategory ?? null),
  );

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

    // Lo que se registra desde el botón central cambia las cifras que se están mirando.
    inject(TransactionEditorService)
      .changes$.pipe(takeUntilDestroyed())
      .subscribe(() => this.load());
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
    }).subscribe({
      next: ({ summary, previous, series }) => {
        this.summary.set(summary);
        this.previous.set(previous);
        this.series.set(series);
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(describeError(error));
        this.loading.set(false);
      },
    });
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
