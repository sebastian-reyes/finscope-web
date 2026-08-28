import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { ChartConfiguration } from 'chart.js';
import { ChartComponent } from '../../shared/ui/chart';
import { ThemeService } from '../../core/theme.service';
import { MAX_SLICES, chartPalette } from '../../core/format/chart-palette';
import { formatMoney } from '../../core/format/money';
import { CategorySummaryResponse, TagSummaryResponse } from '../../core/models';

/** Por qué se reparte el gasto del periodo: por su categoría o por sus tags. */
export type SpendingBreakdown = 'category' | 'tag';

/** Nombre del grupo de movimientos que no llevan ningún tag. */
const UNTAGGED = 'Sin tag';

/** Una barra o una porción, ya con su color resuelto. */
export interface Slice {
  label: string;
  value: number;
  count: number;
  color: string;
  /**
   * Filtro del historial que aísla lo que representa, o nulo si no hay ninguno que lo haga.
   * Lo tienen nulo los dos grupos que no son una cosa sino un resto: «Otras», que son varias
   * categorías, y «Sin tag», que es la ausencia de uno.
   */
  filter: { categoria: number } | { tag: string } | null;
}

/**
 * Las categorías con más gasto, con la cola sumada en un grupo aparte.
 *
 * Más allá de un puñado de porciones el anillo deja de leerse, y agrupar la cola es
 * preferible a inventar colores nuevos para trozos minúsculos. Como «Otras» conserva la suma
 * de lo que agrupa, el reparto sigue cuadrando con el total.
 *
 * @param rows        desglose por categoría, de mayor a menor egreso
 * @param categorical colores de las porciones, en orden
 * @param other       gris del grupo que agrupa la cola
 * @return las porciones a dibujar
 */
export function categorySlices(
  rows: readonly CategorySummaryResponse[],
  categorical: readonly string[],
  other: string,
): Slice[] {
  const spending = rows.filter((row) => row.expense > 0);
  const top = spending.slice(0, MAX_SLICES);
  const rest = spending.slice(MAX_SLICES);

  const slices: Slice[] = top.map((row, index) => ({
    label: row.category,
    value: row.expense,
    count: row.transactionCount,
    color: categorical[index],
    filter: { categoria: row.categoryId },
  }));

  if (rest.length) {
    slices.push({
      label: `Otras (${rest.length})`,
      value: rest.reduce((total, row) => total + row.expense, 0),
      count: rest.reduce((total, row) => total + row.transactionCount, 0),
      color: other,
      filter: null,
    });
  }
  return slices;
}

/**
 * Los tags con más gasto.
 *
 * Aquí no hay grupo «otros»: sumar la cola contaría dos veces el movimiento que lleva dos de
 * esos tags, y como las barras no prometen repartir nada, quedarse con las que más pesan y
 * dejar el resto fuera no falsea la lectura. El grupo sin tag conserva su sitio —es el gasto
 * que todavía no se ha puesto en contexto— y va en gris, porque no es un tag más.
 *
 * @param rows        desglose por tag, de mayor a menor egreso
 * @param categorical colores de las barras, en orden
 * @param other       gris del grupo sin tag
 * @return las barras a dibujar
 */
export function tagSlices(
  rows: readonly TagSummaryResponse[],
  categorical: readonly string[],
  other: string,
): Slice[] {
  return rows
    .filter((row) => row.expense > 0)
    .slice(0, MAX_SLICES + 1)
    .map((row, index) => ({
      label: row.tag ?? UNTAGGED,
      value: row.expense,
      count: row.transactionCount,
      color: row.tag ? categorical[index % categorical.length] : other,
      // El historial filtra por el nombre del tag; «sin tag» no es un nombre, es su falta.
      filter: row.tag ? { tag: row.tag } : null,
    }));
}

/**
 * En qué se va el dinero, por categoría o por tag.
 *
 * Las dos vistas no se dibujan igual, y no es una decisión estética. La categoría sí es un
 * reparto: cada movimiento tiene exactamente una, así que las porciones suman el gasto del
 * periodo y el anillo con porcentajes dice la verdad. Un tag no: un movimiento puede llevar
 * tres y aporta su importe íntegro a cada uno, de modo que los importes se solapan y suman
 * más que el total. Dibujar eso como un anillo afirmaría un reparto que no existe —«ocio,
 * 40 % del gasto» con las porciones sumando más del cien por cien—, así que los tags van en
 * barras, que comparan magnitudes sin prometer que repartan nada.
 *
 * Y esas barras son HTML, no un lienzo. Un gráfico de barras horizontales gasta media
 * pantalla en rotular su eje con los mismos nombres que ya lleva la leyenda al lado, y en un
 * teléfono lo que le queda a las barras no compara nada. En HTML cada tag es un renglón con
 * su nombre, su importe y su barra: se lee igual en un móvil que en un monitor, se pulsa
 * entero en vez de tener que acertar sobre una barra fina, y no hay dos listas diciendo lo
 * mismo. El anillo sí se queda en el lienzo, porque un sector circular no se dibuja con una
 * caja.
 */
@Component({
  selector: 'fs-spending-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartComponent, NgTemplateOutlet, RouterLink],
  template: `
    <div class="fs-swap" #swap>
      @if (mode() === 'category') {
        <div class="fs-swap__view" animate.enter="is-from-left" animate.leave="is-to-left">
          @if (slices().length) {
            <div class="fs-spending">
              <fs-chart [config]="config()" [height]="220" [label]="description()" />
              <ul class="fs-legend">
                @for (slice of slices(); track slice.label) {
                  <li>
                    @if (slice.filter; as filter) {
                      <a
                        class="fs-legend__row"
                        [routerLink]="['/transactions']"
                        [queryParams]="params(filter)"
                      >
                        <ng-container *ngTemplateOutlet="row; context: { $implicit: slice }" />
                        <i class="bi bi-chevron-right fs-legend__go" aria-hidden="true"></i>
                      </a>
                    } @else {
                      <span class="fs-legend__row is-plain">
                        <ng-container *ngTemplateOutlet="row; context: { $implicit: slice }" />
                      </span>
                    }
                  </li>
                }
              </ul>
            </div>

            <ng-template #row let-slice>
              <span class="fs-legend__dot" [style.background-color]="slice.color"></span>
              <span class="fs-legend__name text-truncate">{{ slice.label }}</span>
              <span class="fs-legend__share fs-num">{{ share(slice.value) }}</span>
              <span class="fs-legend__value fs-num">{{ money(slice.value) }}</span>
            </ng-template>

            <p class="fs-note">
              Cada movimiento cuenta en una sola categoría, así que estas porciones reparten
              exactamente lo gastado en el periodo.
            </p>
          } @else {
            <p class="fs-empty">
              No hay egresos en este periodo, así que no hay nada que repartir.
            </p>
          }
        </div>
      } @else {
        <div class="fs-swap__view" animate.enter="is-from-right" animate.leave="is-to-right">
          @if (slices().length) {
            <ul class="fs-rank">
              @for (slice of slices(); track slice.label) {
                <li>
                  <a
                    class="fs-rank__row"
                    [class.is-plain]="!slice.filter"
                    [routerLink]="slice.filter ? ['/transactions'] : null"
                    [queryParams]="slice.filter ? params(slice.filter) : null"
                    [attr.aria-label]="reading(slice)"
                  >
                    <span class="fs-rank__name text-truncate">{{ slice.label }}</span>
                    <span class="fs-rank__count fs-num">
                      {{ slice.count }} {{ slice.count === 1 ? 'mov.' : 'movs.' }}
                    </span>
                    <span class="fs-rank__value fs-num">{{ money(slice.value) }}</span>
                    <span class="fs-rank__track">
                      <span
                        class="fs-rank__bar"
                        [style.width.%]="weight(slice.value)"
                        [style.background-color]="slice.color"
                      ></span>
                    </span>
                  </a>
                </li>
              }
            </ul>

            <p class="fs-note">
              Un movimiento puede llevar varios tags y suma entero en cada uno: estos importes se
              solapan y no reparten el gasto, solo dicen cuánto pesa cada contexto.
            </p>
          } @else {
            <p class="fs-empty">Ningún egreso de este periodo lleva tags todavía.</p>
          }
        </div>
      }
    </div>
  `,
  styles: `
    /* --- El relevo entre las dos vistas --------------------------------------------------
       Una empuja a la otra en lugar de sustituirla de golpe, y cada una entra y sale por su
       propio lado: el anillo por la izquierda y las barras por la derecha, que es el orden
       que tienen en el conmutador. Al ser fijo, no hace falta recordar de dónde se venía —el
       sentido lo dice cuál de las dos se está yendo.

       La que se marcha pasa a posición absoluta mientras dura su salida: si siguiera
       ocupando sitio, la que entra empezaría debajo y bajaría de un tirón al terminar. */
    .fs-swap {
      position: relative;
      /* El realce de una fila se sale medio dedo del texto: el recorte se abre otro tanto
         para no cortarlo. */
      padding-inline: 0.5rem;
      margin-inline: -0.5rem;
      overflow: hidden;
    }

    .fs-swap__view.is-from-left {
      animation: fs-swap-in-left 0.32s cubic-bezier(0.22, 1, 0.36, 1) both;
    }

    .fs-swap__view.is-from-right {
      animation: fs-swap-in-right 0.32s cubic-bezier(0.22, 1, 0.36, 1) both;
    }

    /* Sin borde inferior: atada arriba y a los lados conserva su propio alto, y si la que
       entra es más corta la que se va no se aplasta mientras se marcha. */
    .fs-swap__view.is-to-left,
    .fs-swap__view.is-to-right {
      position: absolute;
      inset: 0 0.5rem auto;
    }

    .fs-swap__view.is-to-left {
      animation: fs-swap-in-left 0.28s cubic-bezier(0.5, 0, 0.75, 0) reverse both;
    }

    .fs-swap__view.is-to-right {
      animation: fs-swap-in-right 0.28s cubic-bezier(0.5, 0, 0.75, 0) reverse both;
    }

    @keyframes fs-swap-in-left {
      from {
        opacity: 0;
        transform: translateX(-40%);
      }
    }

    @keyframes fs-swap-in-right {
      from {
        opacity: 0;
        transform: translateX(40%);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .fs-swap__view.is-from-left,
      .fs-swap__view.is-from-right {
        animation: fs-swap-fade 0.18s ease both;
      }

      .fs-swap__view.is-to-left,
      .fs-swap__view.is-to-right {
        animation: fs-swap-fade 0.14s ease reverse both;
      }
    }

    @keyframes fs-swap-fade {
      from {
        opacity: 0;
      }
    }

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

    /* --- Reparto por tag ----------------------------------------------------------------
       Barras en HTML y no en un lienzo. En un teléfono, un gráfico de barras horizontales
       gasta media pantalla en rotular el eje con los mismos nombres que ya lleva la leyenda,
       y lo que queda para las barras se estruja hasta no comparar nada. Aquí cada tag es un
       renglón con su nombre, su importe y su barra: se lee igual en un móvil que en un
       monitor, se pulsa entero en lugar de tener que acertar en una barra fina, y no hay dos
       listas diciendo lo mismo. */
    .fs-rank {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
      margin: 0;
      padding: 0;
    }

    /* Dos renglones por tag y no tres: el nombre, su cuenta y su importe caben en el mismo,
       y la barra debajo. La cuenta ocupaba antes una línea entera para decir dos palabras, y
       multiplicado por seis tags eso hacía a esta tarjeta bastante más alta que el anillo
       —tanto como para descuadrar la columna de al lado al cambiar de vista—. */
    .fs-rank__row {
      display: grid;
      grid-template-columns: minmax(0, auto) auto minmax(0, 1fr);
      align-items: baseline;
      gap: 0.3rem 0.5rem;
      padding: 0.4rem 0.5rem;
      margin-inline: -0.5rem;
      border-radius: var(--fs-radius);
      color: inherit;
      text-decoration: none;
      transition: background-color 0.15s ease;
    }

    .fs-rank__row:not(.is-plain):hover {
      background-color: var(--fs-hover);
    }

    .fs-rank__name {
      font-size: 0.875rem;
      color: var(--fs-ink);
    }

    .fs-rank__value {
      justify-self: end;
      font-size: 0.875rem;
      font-weight: 600;
      color: var(--fs-ink);
      white-space: nowrap;
    }

    /* El carril ocupa el renglón entero: es lo que se compara de un vistazo entre filas, así
       que no comparte sitio con nada. */
    .fs-rank__track {
      grid-column: 1 / -1;
      position: relative;
      height: 0.4rem;
      border-radius: 999px;
      background-color: var(--fs-shade);
      overflow: hidden;
    }

    .fs-rank__bar {
      display: block;
      height: 100%;
      border-radius: 999px;
      /* El tag más caro llena el carril; los demás se leen contra él. */
      transition: width 0.35s cubic-bezier(0.22, 1, 0.36, 1);
    }

    /* Al lado del nombre y en gris: acompaña al tag, no es un dato por derecho propio. */
    .fs-rank__count {
      white-space: nowrap;
      font-size: var(--fs-text-xs);
      color: var(--fs-ink-faint);
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
    }

    /* Cada renglón lleva al historial de lo que nombra, que es la pregunta que sigue a verlo
       en el gráfico. Se comporta como una fila de lista: se tiñe al pasar por encima y no se
       subraya, porque lo que se pulsa es la fila entera y no su nombre. */
    .fs-legend__row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      flex: 1;
      min-width: 0;
      padding: 0.2rem 0.4rem;
      margin-inline: -0.4rem;
      border-radius: 0.5rem;
      color: inherit;
      text-decoration: none;
      transition: background-color 0.15s ease;
    }

    a.fs-legend__row:hover {
      background-color: var(--fs-hover);
    }

    /* La flecha solo aparece al apuntar: en reposo, ocho flechas en columna pesan más que
       los datos que acompañan. */
    .fs-legend__go {
      flex: none;
      font-size: 0.7rem;
      color: var(--fs-ink-faint);
      opacity: 0;
      transition: opacity 0.15s ease;
    }

    a.fs-legend__row:hover .fs-legend__go,
    a.fs-legend__row:focus-visible .fs-legend__go {
      opacity: 1;
    }

    /* El renglón que no lleva a ningún sitio deja el hueco de la flecha, para que la columna
       de importes no se desalinee entre unas filas y otras. */
    .fs-legend__row.is-plain {
      padding-right: 1.1rem;
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
      white-space: nowrap;
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
export class SpendingChartComponent {
  private readonly theme = inject(ThemeService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  private readonly swap = viewChild<ElementRef<HTMLElement>>('swap');

  /** Estiramiento en curso, para que dos cambios seguidos no se peleen por el alto. */
  private stretching: Animation | null = null;

  constructor() {
    // El relevo entre las dos vistas se anima; el cambio de alto que trae consigo, no. Y ese
    // alto no es cosa de esta tarjeta sola: la de al lado se estira hasta igualarla, así que
    // sin esto media pantalla daba un salto seco justo cuando la otra media se deslizaba.
    effect(() => {
      this.mode();
      afterNextRender({ mixedReadWrite: () => this.stretch() }, { injector: this.injector });
    });
  }

  /** Desglose por categoría, ya ordenado de mayor a menor egreso. */
  readonly byCategory = input.required<CategorySummaryResponse[]>();

  /** Desglose por tag, ya ordenado de mayor a menor egreso. */
  readonly byTag = input.required<TagSummaryResponse[]>();

  readonly mode = input<SpendingBreakdown>('category');

  /** Mes que se está mirando, que viaja con el filtro para no abrir el historial entero. */
  readonly period = input<{ month: number; year: number } | null>(null);

  protected readonly money = formatMoney;

  /**
   * Parámetros del enlace al historial: el filtro de la porción más el mes que se mira.
   *
   * @param filter filtro que aísla la porción
   * @return los parámetros de consulta del enlace
   */
  protected params(filter: NonNullable<Slice['filter']>): Record<string, string | number> {
    const period = this.period();
    return period ? { ...filter, mes: period.month, anio: period.year } : { ...filter };
  }

  /** Lo que se dibuja, ya sea en porciones o en barras. */
  protected readonly slices = computed<Slice[]>(() => {
    const palette = chartPalette(this.theme.resolved());
    return this.mode() === 'category'
      ? categorySlices(this.byCategory(), palette.categorical, palette.other)
      : tagSlices(this.byTag(), palette.categorical, palette.other);
  });

  /** Gasto total del periodo, que es lo que reparten las porciones. */
  protected readonly total = computed(() =>
    this.slices().reduce((sum, slice) => sum + slice.value, 0),
  );

  /** El importe más alto del reparto, que es el que llena el carril entero. */
  private readonly top = computed(() =>
    this.slices().reduce((most, slice) => Math.max(most, slice.value), 0),
  );

  /**
   * Cuánto llena el carril una barra.
   *
   * Se mide contra el tag que más pesa y no contra el total del periodo: los tags se solapan
   * y su suma no significa nada, así que el único punto de referencia honesto es el mayor
   * de ellos. De paso, con importes parecidos las barras se distinguen, que es justo lo que
   * se viene a ver.
   *
   * @param value importe de la barra
   * @return el porcentaje de carril que ocupa
   */
  protected weight(value: number): number {
    const top = this.top();
    return top ? (value / top) * 100 : 0;
  }

  /**
   * Lo que oye quien no ve la barra: nombre, importe y cuántos movimientos lo llevan.
   *
   * @param slice barra que se está leyendo
   * @return la frase completa
   */
  protected reading(slice: Slice): string {
    const movements = slice.count === 1 ? 'movimiento' : 'movimientos';
    return `${slice.label}: ${formatMoney(slice.value)} en ${slice.count} ${movements}`;
  }

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

  /** Lo que oye del anillo quien no puede verlo. Los tags no lo necesitan: cada barra lleva
   * su propia lectura en el enlace que la contiene. */
  protected readonly description = computed(() => {
    const parts = this.slices().map(
      (slice) => `${slice.label}: ${formatMoney(slice.value)}, ${this.share(slice.value)}`,
    );
    return `Gasto por categoría. ${parts.join('. ')}`;
  });

  protected readonly config = computed(() => this.doughnut());

  /**
   * Lleva el alto de la caja del que tenía al que va a tener.
   *
   * No hace falta apuntar el alto anterior antes de cambiar de vista: mientras dura el
   * relevo las dos están en el DOM —la que se va, en posición absoluta— así que una dice de
   * dónde se viene y la otra adónde se va. En el primer dibujado no hay ninguna que se vaya
   * y no hay nada que animar.
   */
  private stretch(): void {
    const swap = this.swap()?.nativeElement;
    if (!swap || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const leaving = swap.querySelector<HTMLElement>('.is-to-left, .is-to-right');
    const entering = swap.querySelector<HTMLElement>('.is-from-left, .is-from-right');
    if (!leaving || !entering || leaving.offsetHeight === entering.offsetHeight) {
      return;
    }

    this.stretching?.cancel();
    this.stretching = swap.animate(
      [{ height: `${leaving.offsetHeight}px` }, { height: `${entering.offsetHeight}px` }],
      { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
  }

  /**
   * Abre el historial de la porción que se acaba de tocar en el anillo.
   * «Otras» no lleva a ningún sitio, igual que en la leyenda: son varias categorías a la vez
   * y no hay filtro que las aísle.
   *
   * @param index posición de la porción, o indefinida si se tocó el hueco del anillo
   */
  private openSlice(index: number | undefined): void {
    const filter = index === undefined ? null : this.slices()[index]?.filter;
    if (filter) {
      this.router.navigate(['/transactions'], { queryParams: this.params(filter) });
    }
  }

  /** El puntero avisa de que hay algo que pulsar, y solo donde de verdad lo hay. */
  private showHand(event: Event | null | undefined, index: number | undefined): void {
    const canvas = event?.target;
    if (canvas instanceof HTMLElement) {
      const filter = index === undefined ? null : this.slices()[index]?.filter;
      canvas.style.cursor = filter ? 'pointer' : 'default';
    }
  }

  private doughnut(): ChartConfiguration<'doughnut'> {
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
        onClick: (_event, elements) => this.openSlice(elements[0]?.index),
        onHover: (event, elements) => this.showHand(event.native, elements[0]?.index),
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
  }
}
