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
import {
  ArcElement,
  CategoryScale,
  Chart,
  ChartConfiguration,
  DoughnutController,
  Filler,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';

// Solo las piezas que la aplicación dibuja, y no `...registerables`.
//
// Chart.js no reparte su código por tipo de gráfico: lo que se registra es lo que entra en
// el paquete. Con el juego completo viajaban también las barras, las burbujas, el radar, el
// polar y el de dispersión, que aquí no se usan, y el inicio es la primera pantalla que se
// abre tras entrar. Registrando lo justo, su fragmento baja de 74 a 64 kB en el cable.
//
// La lista es corta a propósito: si algún día se añade un gráfico de otro tipo, no pintará
// nada hasta que su controlador aparezca aquí. El error de Chart.js en ese caso es claro
// —dice qué falta por registrar—, así que el aviso llega en la primera ejecución.
Chart.register(
  // El desglose por categoría y por tag.
  DoughnutController,
  ArcElement,
  // La evolución de ingresos y egresos, con su área bajo la línea.
  LineController,
  LineElement,
  PointElement,
  Filler,
  // Los ejes de esa misma serie: importes a la izquierda, meses abajo.
  LinearScale,
  CategoryScale,
  // La leyenda es de la serie de evolución; el desglose rotula sus porciones aparte.
  Legend,
  Tooltip,
);

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
