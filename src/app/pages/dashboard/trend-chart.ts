import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ChartConfiguration } from 'chart.js';
import { ChartComponent } from '../../shared/ui/chart';
import { PaletteService } from '../../core/palette.service';
import { ThemeService } from '../../core/theme.service';
import { BASE_CURRENCY, formatAxisMoney, formatMoney } from '../../core/format/money';
import { bucketLabel, bucketTick } from '../../core/format/period';
import { Currency, SummarySeriesResponse } from '../../core/models';

/**
 * A partir de cuántos tramos la serie se dibuja sin marcar cada punto.
 *
 * Un mes por días son treinta puntos, y en un teléfono el hueco de la línea da para unos
 * trescientos píxeles: diez por punto, cuando cada marca mide cinco de radio más dos de
 * borde. Las marcas se tocaban entre sí y la línea se leía como un collar de cuentas, que
 * es lo que tapaba la forma —que es lo único que se le pide a una evolución—. Por debajo de
 * este número sí caben, y ahí sí ayudan a ver dónde está el dato.
 *
 * Quitarlas no quita nada: el globo sigue saliendo al tocar cualquier punto de la vertical,
 * porque la interacción va por índice y no por acierto sobre la marca.
 */
const DENSE_BUCKETS = 12;

/**
 * Evolución de ingresos y egresos.
 *
 * Las dos series comparten eje porque son la misma magnitud; nunca se les pone un segundo
 * eje, que es lo que convierte un gráfico financiero en un adorno engañoso. La API solo
 * devuelve los tramos con movimiento, así que un salto en la línea significa que ahí no
 * pasó nada y no que falte el dato.
 *
 * Todo lo que el eje puede no decir, no lo dice: es un gráfico que tiene que caber en un
 * teléfono, y cada píxel que se lleva un rótulo se lo quita a la línea.
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
  private readonly palette = inject(PaletteService);

  readonly series = input.required<SummarySeriesResponse>();

  /**
   * Moneda de la serie, para rotular sus importes.
   * La línea ya viene de una sola: acotarla es cosa de quien pide el resumen, y aquí solo
   * hace falta saber con qué símbolo se leen sus números.
   */
  readonly currency = input<Currency>(BASE_CURRENCY);

  /** Da formato a un importe de la serie con la moneda que se está mirando. */
  private readonly money = computed(() => (amount: number) => formatMoney(amount, this.currency()));

  protected readonly labels = computed(() =>
    this.series().buckets.map((bucket) =>
      bucketLabel(bucket.periodStart, this.series().granularity),
    ),
  );

  /**
   * Los mismos tramos rotulados para el eje, que es donde no cabe el rótulo entero.
   * El completo no se pierde: `labels` sigue siendo lo que lee el globo.
   */
  protected readonly ticks = computed(() =>
    this.series().buckets.map((bucket) =>
      bucketTick(bucket.periodStart, this.series().granularity),
    ),
  );

  protected readonly description = computed(() => {
    const buckets = this.series().buckets;
    const income = buckets.reduce((total, bucket) => total + bucket.income, 0);
    const expense = buckets.reduce((total, bucket) => total + bucket.expense, 0);
    const money = this.money();
    return `Evolución de ${buckets.length} tramos. Ingresos ${money(income)}, egresos ${money(expense)}.`;
  });

  protected readonly config = computed<ChartConfiguration>(() => {
    const palette = this.palette.chart();
    const buckets = this.series().buckets;
    const ticks = this.ticks();
    const pointRadius = buckets.length > DENSE_BUCKETS ? 0 : 3;
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
            pointRadius,
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
            pointRadius,
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
            ticks: {
              color: palette.inkMuted,
              font: { size: 11 },
              // Horizontal o nada. Torcidos cuarenta y cinco grados se llevaban unos
              // cincuenta píxeles de alto —de los doscientos cuarenta que mide la tarjeta—
              // y aun así había que leerlos de lado.
              maxRotation: 0,
              // En una escala de categorías, el valor que llega es el índice del tramo.
              callback: (_value, index) => ticks[index],
            },
          },
          y: {
            beginAtZero: true,
            grid: { color: palette.grid },
            border: { display: false },
            ticks: {
              color: palette.inkMuted,
              font: { size: 11 },
              // Cuatro rayas bastan para leer la altura de la línea, y cada una que sobra
              // es una línea de rejilla cruzando el dibujo.
              maxTicksLimit: 4,
              callback: (value) => formatAxisMoney(Number(value), this.currency()),
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
              label: (item) => ` ${item.dataset.label}: ${this.money()(Number(item.parsed.y))}`,
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
