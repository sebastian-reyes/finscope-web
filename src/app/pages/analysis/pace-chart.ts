import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ChartConfiguration } from 'chart.js';
import { ChartComponent } from '../../shared/ui/chart';
import { PaletteService } from '../../core/palette.service';
import { BASE_CURRENCY, formatAxisMoney, formatMoney } from '../../core/format/money';
import { Currency } from '../../core/models';
import { Pace } from './analysis-report';

/**
 * El gasto acumulado del mes contra el del mes anterior.
 *
 * Dos líneas que solo suben: la del mes que se mira, en el color del gasto, y la del anterior,
 * en gris y discontinua, de fondo. Lo único que se lee es cuál va por encima, y eso se ve sin
 * leer ningún número. La del mes en curso se corta en hoy, porque lo que todavía no ha pasado
 * no es un cero.
 */
@Component({
  selector: 'fs-pace-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartComponent],
  template: `<fs-chart [config]="config()" [height]="200" [label]="description()" />`,
})
export class PaceChartComponent {
  private readonly palette = inject(PaletteService);

  readonly pace = input.required<Pace>();

  readonly currency = input<Currency>(BASE_CURRENCY);

  /** Cómo se llaman las dos líneas en la leyenda: «Octubre» y «Septiembre». */
  readonly currentLabel = input.required<string>();
  readonly previousLabel = input.required<string>();

  protected readonly description = computed(() => {
    const pace = this.pace();
    return (
      `Gasto acumulado día a día. ${this.currentLabel()}: ${formatMoney(pace.spent, this.currency())} ` +
      `al día ${pace.day}; ${this.previousLabel()}: ${formatMoney(pace.previousAtDay, this.currency())}.`
    );
  });

  protected readonly config = computed<ChartConfiguration>(() => {
    const palette = this.palette.chart();
    const pace = this.pace();
    const money = (amount: number) => formatMoney(amount, this.currency());
    return {
      type: 'line',
      data: {
        labels: pace.days.map(String),
        datasets: [
          {
            label: this.currentLabel(),
            data: pace.current,
            borderColor: palette.expense,
            backgroundColor: `${palette.expense}1f`,
            fill: true,
            tension: 0.25,
            borderWidth: 2.5,
            pointRadius: 0,
            pointHoverRadius: 4,
            spanGaps: false,
          },
          {
            label: this.previousLabel(),
            data: pace.previous,
            borderColor: palette.inkMuted,
            backgroundColor: 'transparent',
            fill: false,
            tension: 0.25,
            borderWidth: 1.5,
            // Discontinua para que se distinga de la del mes aunque no se vea el color.
            borderDash: [4, 4],
            pointRadius: 0,
            pointHoverRadius: 4,
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
              maxRotation: 0,
              // Unos pocos días de referencia bastan: el eje dice «principio, mitad, final».
              autoSkip: true,
              maxTicksLimit: 7,
            },
          },
          y: {
            beginAtZero: true,
            grid: { color: palette.grid },
            border: { display: false },
            ticks: {
              color: palette.inkMuted,
              font: { size: 11 },
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
              title: (items) => `Día ${items[0]?.label ?? ''}`,
              label: (item) => ` ${item.dataset.label}: ${money(Number(item.parsed.y))}`,
            },
          },
        },
      },
    };
  });
}
