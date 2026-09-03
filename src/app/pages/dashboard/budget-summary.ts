import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BudgetResponse } from '../../core/models';
import { formatMoney } from '../../core/format/money';
import { BudgetBarComponent } from '../../shared/ui/budget-bar';

/** Cuántos presupuestos caben en el inicio antes de que la tarjeta deje de leerse. */
const VISIBLE = 4;

/**
 * Avance del plan del mes, en el inicio.
 *
 * Enseña unos pocos y no todos a propósito: el inicio contesta a «¿voy bien?», y para eso
 * bastan los que están peor. El plan completo se mira en su pantalla, que es donde además
 * se puede tocar.
 *
 * El orden no es el alfabético con el que llegan, sino el del apuro: primero lo que se pasó
 * y lo que está a punto. Un presupuesto holgado no es noticia y no debería ocupar el sitio
 * de uno que sí lo es.
 */
@Component({
  selector: 'fs-budget-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, BudgetBarComponent],
  template: `
    @if (budgets().length) {
      <p class="fs-budsum__total">
        <span class="fs-num fs-budsum__spent">{{ money(spent()) }}</span>
        <span class="fs-budsum__of">de {{ money(planned()) }} presupuestados</span>
      </p>

      <ul class="fs-budsum__list">
        @for (budget of visible(); track budget.id) {
          <li><fs-budget-bar [budget]="budget" /></li>
        }
      </ul>

      <p class="fs-note">
        @if (hidden() > 0) {
          Y {{ hidden() }} {{ hidden() === 1 ? 'categoría más' : 'categorías más' }}
          con presupuesto este mes.
        } @else {
          Lo gastado son los egresos de cada categoría dentro del mes, lo mismo que reparte el
          gráfico de arriba.
        }
      </p>
    } @else {
      <p class="fs-budsum__empty">
        Este mes no tiene presupuesto. Ponerle un límite a las dos o tres categorías que más se te
        van es lo que convierte el resumen en una decisión.
      </p>
      <a class="fs-btn fs-btn--soft fs-btn--sm" [routerLink]="['/budgets']">
        <i class="bi bi-clipboard-check" aria-hidden="true"></i>Presupuestar el mes
      </a>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .fs-budsum__total {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin: 0 0 0.85rem;
    }

    .fs-budsum__spent {
      font-size: var(--fs-text-md);
      font-weight: 680;
      letter-spacing: -0.02em;
    }

    .fs-budsum__of {
      font-size: var(--fs-text-xs);
      color: var(--fs-ink-muted);
    }

    .fs-budsum__list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: 0.9rem;
    }

    /* En pantalla ancha la tarjeta cruza las dos columnas, y cuatro barras de lado a lado se
       leerían como cuatro renglones sueltos. En dos columnas vuelven a formar un bloque. */
    @media (min-width: 992px) {
      .fs-budsum__list {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.9rem 2rem;
      }

      /* Si el número es impar, el último se queda solo en la columna izquierda con un vacío
         a su derecha, y ese hueco no se lee como espacio sino como algo que falta. Ocupando
         el renglón entero pasa a ser el cierre del bloque. Cubre también el caso de un solo
         presupuesto, que es el mismo problema visto desde el principio. */
      .fs-budsum__list > li:last-child:nth-child(odd) {
        grid-column: 1 / -1;
      }
    }

    .fs-budsum__empty {
      margin: 0 0 0.85rem;
      font-size: var(--fs-text-sm);
      color: var(--fs-ink-muted);
    }
  `,
})
export class BudgetSummaryComponent {
  readonly budgets = input.required<BudgetResponse[]>();

  /**
   * Los que peor están, primero.
   * Se ordena por la parte gastada y no por el importe: gastar 90 de 100 aprieta más que
   * gastar 300 de 1000, aunque la segunda cifra sea mayor.
   */
  protected readonly visible = computed(() =>
    [...this.budgets()].sort((left, right) => ratio(right) - ratio(left)).slice(0, VISIBLE),
  );

  protected readonly hidden = computed(() => Math.max(0, this.budgets().length - VISIBLE));

  protected readonly planned = computed(() =>
    this.budgets().reduce((sum, budget) => sum + budget.amount, 0),
  );

  protected readonly spent = computed(() =>
    this.budgets().reduce((sum, budget) => sum + budget.spent, 0),
  );

  protected money(amount: number): string {
    return formatMoney(amount);
  }
}

/**
 * Qué parte de su presupuesto lleva gastada una categoría.
 *
 * @param budget presupuesto con su avance
 * @return la proporción gastada, que puede pasar de uno
 */
function ratio(budget: BudgetResponse): number {
  return budget.amount > 0 ? budget.spent / budget.amount : 0;
}
