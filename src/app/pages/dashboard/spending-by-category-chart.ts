import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ChartConfiguration } from 'chart.js';
import { ChartComponent } from '../../shared/ui/chart';
import { ThemeService } from '../../core/theme.service';
import { MAX_SLICES, chartPalette } from '../../core/format/chart-palette';
import { formatMoney } from '../../core/format/money';
import { CategorySummaryResponse } from '../../core/models';

/**
 * En qué se va el dinero, por categoría.
 *
 * Este sí es un reparto y por eso se dibuja como un anillo con porcentajes: cada
 * transacción tiene exactamente una categoría, así que las porciones suman el gasto del
 * periodo sin que ninguna se cuente dos veces. Es justo lo que no podía hacerse por tag,
 * donde una transacción con dos tags sumaba entera en cada uno.
 */
@Component({
  selector: 'fs-spending-by-category-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartComponent],
  template: `
    @if (slices().length) {
      <div class="fs-spending">
        <fs-chart [config]="config()" [height]="220" [label]="description()" />
        <ul class="fs-legend">
          @for (slice of slices(); track slice.label) {
            <li>
              <span class="fs-legend__dot" [style.background-color]="slice.color"></span>
              <span class="fs-legend__name text-truncate">{{ slice.label }}</span>
              <span class="fs-legend__share fs-num">{{ share(slice.value) }}</span>
              <span class="fs-legend__value fs-num">{{ money(slice.value) }}</span>
            </li>
          }
        </ul>
      </div>
    } @else {
      <p class="fs-empty">No hay egresos en este periodo, así que no hay nada que repartir.</p>
    }
  `,
  styles: `
    /* En una tarjeta ancha, el anillo solo dejaría aire a los lados: la leyenda se pone a su
       derecha y ocupa ese sitio. En una estrecha se apilan, como antes. */
    .fs-spending {
      display: grid;
      gap: 1rem;
      /* El mínimo en cero es lo que deja que el anillo se encoja con la tarjeta: con un
         1fr a secas, el hueco nunca baja de lo que mide el lienzo que lleva dentro. */
      grid-template-columns: minmax(0, 1fr);
    }

    @media (min-width: 576px) {
      .fs-spending {
        grid-template-columns: 14rem minmax(0, 1fr);
        align-items: center;
        gap: 1.5rem;
      }
    }

    .fs-legend {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      font-size: 0.875rem;
    }

    .fs-legend li {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .fs-legend__dot {
      flex: none;
      width: 0.625rem;
      height: 0.625rem;
      border-radius: 3px;
    }

    .fs-legend__name {
      flex: 1;
      min-width: 0;
      color: var(--fs-ink);
    }

    .fs-legend__share {
      color: var(--fs-ink-faint);
      font-size: 0.8125rem;
    }

    .fs-legend__value {
      color: var(--fs-ink-muted);
    }

    .fs-empty {
      margin: 0;
      padding: 1.5rem 0;
      font-size: 0.875rem;
      color: var(--fs-ink-muted);
    }
  `,
})
export class SpendingByCategoryChartComponent {
  private readonly theme = inject(ThemeService);

  /** Desglose tal cual lo devuelve la API, ya ordenado de mayor a menor egreso. */
  readonly byCategory = input.required<CategorySummaryResponse[]>();

  protected readonly money = formatMoney;

  /**
   * Las porciones que se dibujan: las categorías con más gasto y el resto agrupado.
   * Más allá de un puñado de porciones el anillo deja de leerse, y agrupar la cola es
   * preferible a inventar colores nuevos para trozos minúsculos. Como «Otras» conserva la
   * suma de lo que agrupa, el reparto sigue cuadrando con el total.
   */
  protected readonly slices = computed(() => {
    const palette = chartPalette(this.theme.resolved());
    const spending = this.byCategory().filter((row) => row.expense > 0);
    const top = spending.slice(0, MAX_SLICES);
    const rest = spending.slice(MAX_SLICES);

    const slices = top.map((row, index) => ({
      label: row.category,
      value: row.expense,
      color: palette.categorical[index],
    }));

    if (rest.length) {
      slices.push({
        label: `Otras (${rest.length})`,
        value: rest.reduce((total, row) => total + row.expense, 0),
        color: palette.other,
      });
    }
    return slices;
  });

  /** Gasto total del periodo, que es lo que reparten las porciones. */
  protected readonly total = computed(() =>
    this.slices().reduce((sum, slice) => sum + slice.value, 0),
  );

  /**
   * Porcentaje que representa una porción sobre el gasto del periodo.
   *
   * @param value importe de la porción
   * @return el porcentaje con un decimal
   */
  protected share(value: number): string {
    const total = this.total();
    return total ? `${((value / total) * 100).toFixed(1)} %` : '';
  }

  protected readonly description = computed(() => {
    const parts = this.slices().map(
      (slice) => `${slice.label}: ${formatMoney(slice.value)}, ${this.share(slice.value)}`,
    );
    return `Gasto por categoría. ${parts.join('. ')}`;
  });

  protected readonly config = computed<ChartConfiguration>(() => {
    const palette = chartPalette(this.theme.resolved());
    const slices = this.slices();
    return {
      type: 'doughnut',
      data: {
        labels: slices.map((slice) => slice.label),
        datasets: [
          {
            data: slices.map((slice) => slice.value),
            backgroundColor: slices.map((slice) => slice.color),
            // El aro del color del papel separa las porciones sin dibujar un borde extra.
            borderColor: palette.surface,
            borderWidth: 2,
            hoverOffset: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        plugins: {
          // La leyenda se dibuja fuera, en HTML, donde caben el porcentaje y el importe.
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (item) =>
                ` ${item.label}: ${formatMoney(Number(item.parsed))} · ` +
                `${this.share(Number(item.parsed))}`,
            },
          },
        },
      },
    };
  });
}
