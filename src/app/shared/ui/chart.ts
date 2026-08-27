import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  afterNextRender,
  effect,
  input,
  viewChild,
} from '@angular/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';

Chart.register(...registerables);

/**
 * Lienzo de Chart.js gobernado por señales.
 *
 * Se prescinde de un envoltorio de terceros porque lo único que hay que resolver es el
 * ciclo de vida, y en una aplicación sin zone.js eso se hace mejor a mano: el gráfico nace
 * cuando el canvas ya existe, se actualiza en lugar de recrearse cuando cambian los datos
 * —recrearlo pierde la animación y filtra el anterior— y se destruye al desmontarse, que
 * es la fuga clásica de esta librería.
 */
@Component({
  selector: 'fs-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fs-chart" [style.height.px]="height()">
      <canvas #canvas [attr.aria-label]="label()" role="img"></canvas>
    </div>
  `,
  styles: `
    .fs-chart {
      position: relative;
      width: 100%;
      /* Sin esto, la anchura del lienzo pasa a ser la anchura mínima del hueco que lo
         contiene y la rejilla ya no puede encogerse por debajo de él. */
      min-width: 0;
    }

    /* Chart.js escribe la anchura del lienzo en línea, calculada a partir del hueco que
       ocupa. Si ese hueco depende a su vez del lienzo, cada medida lo agranda y ninguna lo
       encoge: es lo que desbordaba la pantalla en móvil. El tope lo corta, porque max-width
       gana a la anchura escrita en línea. */
    canvas {
      display: block;
      max-width: 100%;
    }
  `,
})
export class ChartComponent implements OnDestroy {
  readonly config = input.required<ChartConfiguration>();
  readonly height = input(220);
  /** Descripción del gráfico para quien no puede verlo. */
  readonly label = input('');

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private chart: Chart | null = null;
  /** Tipo con el que se creó el gráfico vivo, que Chart.js no expone de vuelta tipado. */
  private renderedType: ChartConfiguration['type'] | null = null;
  private ready = false;

  constructor() {
    afterNextRender(() => {
      this.ready = true;
      this.render();
    });

    effect(() => {
      // Leer la configuración deja al efecto suscrito a sus señales de origen.
      this.config();
      if (this.ready) {
        this.render();
      }
    });
  }

  ngOnDestroy(): void {
    this.chart?.destroy();
    this.chart = null;
    this.renderedType = null;
  }

  /**
   * Crea el gráfico la primera vez y a partir de ahí solo le cambia los datos.
   * Cambiar el tipo de gráfico sí obliga a rehacerlo, porque Chart.js no lo admite en
   * caliente.
   */
  private render(): void {
    const config = this.config();
    if (!this.chart || this.renderedType !== config.type) {
      this.chart?.destroy();
      this.chart = new Chart(this.canvas().nativeElement, config);
      this.renderedType = config.type;
      return;
    }
    this.chart.data = config.data;
    this.chart.options = config.options ?? {};
    this.chart.update();
  }
}
