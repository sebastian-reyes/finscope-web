import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ChartConfiguration } from 'chart.js';
import { ChartComponent } from '../../shared/ui/chart';
import { ThemeService } from '../../core/theme.service';
import { chartPalette } from '../../core/format/chart-palette';
import { formatMoney } from '../../core/format/money';
import { bucketLabel } from '../../core/format/period';
import { SummarySeriesResponse } from '../../core/models';

/**
 * Evolución de ingresos y egresos.
 *
 * Las dos series comparten eje porque son la misma magnitud; nunca se les pone un segundo
 * eje, que es lo que convierte un gráfico financiero en un adorno engañoso. La API solo
 * devuelve los tramos con movimiento, así que un salto en la línea significa que ahí no
 * pasó nada y no que falte el dato.
 */
@Component({
  selector: 'fs-trend-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartComponent],
  template: `
    @if (series().buckets.length > 1) {
      <fs-chart [config]="config()" [height]="240" [label]="description()" />
    } @else {
      <p class="fs-empty">
        Hace falta más de un tramo con movimientos para dibujar una evolución. Prueba a ampliar el
        periodo o a agrupar por días.
      </p>
    }
  `,
  styles: `
    .fs-empty {
      margin: 0;
      padding: 1.5rem 0;
      font-size: 0.875rem;
      color: var(--fs-ink-muted);
    }
  `,
})
export class TrendChartComponent {
  private readonly theme = inject(ThemeService);

  readonly series = input.required<SummarySeriesResponse>();

  protected readonly labels = computed(() =>
    this.series().buckets.map((bucket) =>
      bucketLabel(bucket.periodStart, this.series().granularity),
    ),
  );

  protected readonly description = computed(() => {
    const buckets = this.series().buckets;
    const income = buckets.reduce((total, bucket) => total + bucket.income, 0);
    const expense = buckets.reduce((total, bucket) => total + bucket.expense, 0);
    return `Evolución de ${buckets.length} tramos. Ingresos ${formatMoney(income)}, egresos ${formatMoney(expense)}.`;
  });

  protected readonly config = computed<ChartConfiguration>(() => {
    const palette = chartPalette(this.theme.resolved());
    const buckets = this.series().buckets;
    return {
      type: 'line',
      data: {
        labels: this.labels(),
        datasets: [
          {
            label: 'Ingresos',
            data: buckets.map((bucket) => bucket.income),
            borderColor: palette.income,
            backgroundColor: transparent(palette.income),
            fill: true,
            tension: 0.3,
            borderWidth: 2,
            pointRadius: 3,
            pointHoverRadius: 5,
            pointBackgroundColor: palette.income,
            pointBorderColor: palette.surface,
            pointBorderWidth: 2,
          },
          {
            label: 'Egresos',
            data: buckets.map((bucket) => bucket.expense),
            borderColor: palette.expense,
            backgroundColor: transparent(palette.expense),
            fill: true,
            tension: 0.3,
            borderWidth: 2,
            // El trazo discontinuo distingue las dos series aunque no se vea el color.
            borderDash: [5, 4],
            pointRadius: 3,
            pointHoverRadius: 5,
            pointBackgroundColor: palette.expense,
            pointBorderColor: palette.surface,
            pointBorderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: {
            grid: { display: false },
            border: { color: palette.grid },
            ticks: { color: palette.inkMuted, font: { size: 11 } },
          },
          y: {
            beginAtZero: true,
            grid: { color: palette.grid },
            border: { display: false },
            ticks: {
              color: palette.inkMuted,
              font: { size: 11 },
              maxTicksLimit: 5,
              callback: (value) => formatMoney(Number(value)),
            },
          },
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            align: 'end',
            labels: {
              color: palette.inkMuted,
              boxWidth: 10,
              boxHeight: 10,
              usePointStyle: true,
              pointStyle: 'rectRounded',
            },
          },
          tooltip: {
            callbacks: {
              label: (item) => ` ${item.dataset.label}: ${formatMoney(Number(item.parsed.y))}`,
            },
          },
        },
      },
    };
  });
}

/**
 * Versión translúcida de un color, para el relleno bajo la línea.
 *
 * @param hex color de la serie en notación hexadecimal
 * @return el mismo color con transparencia
 */
function transparent(hex: string): string {
  return `${hex}1f`;
}
