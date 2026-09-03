import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { BudgetResponse } from '../../core/models';
import { formatMoney } from '../../core/format/money';

/** En qué punto está el gasto respecto a lo presupuestado. */
export type BudgetTone = 'ok' | 'close' | 'over';

/**
 * A partir de qué porcentaje del presupuesto se avisa de que queda poco.
 * A ojo, el punto en el que aún se puede hacer algo —dejar de gastar en eso el resto del
 * mes— pero ya no queda margen para despistarse.
 */
const CLOSE_RATIO = 0.85;

/**
 * Avance de un presupuesto: cuánto se lleva gastado de lo que se pensaba gastar.
 *
 * El color nunca viaja solo. Quien no distingue el rojo del verde tiene que poder leer si
 * se pasó, así que debajo de la barra siempre hay una frase que lo dice con palabras, y el
 * lector de pantalla recibe el avance completo en una sola etiqueta.
 *
 * Pasarse no rompe la barra: se llena entera y la frase dice de cuánto fue el exceso. Una
 * barra al 137% no se puede dibujar, pero «te pasaste por S/ 55,50» se entiende igual.
 */
@Component({
  selector: 'fs-budget-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fs-bud" [attr.data-tone]="tone()">
      <p class="fs-bud__head">
        <span class="fs-bud__name text-truncate">{{ budget().category }}</span>
        <span class="fs-bud__figures fs-num">
          <span class="fs-bud__spent">{{ money(budget().spent) }}</span>
          <span class="fs-bud__of">de {{ money(budget().amount) }}</span>
        </span>
      </p>

      <div
        class="fs-bud__track"
        role="progressbar"
        [attr.aria-valuenow]="percent()"
        aria-valuemin="0"
        aria-valuemax="100"
        [attr.aria-label]="reading()"
      >
        <span class="fs-bud__fill" [style.width.%]="width()"></span>
      </div>

      <p class="fs-bud__foot">
        <span class="fs-bud__reading">
          @if (tone() === 'over') {
            Te pasaste por {{ money(-budget().remaining) }}
          } @else {
            Queda {{ money(budget().remaining) }}
          }
        </span>
        <span class="fs-bud__percent fs-num">{{ percent() }}%</span>
      </p>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    /* Los tres estados salen de aquí y no de tres juegos de clases: la barra, el porcentaje
       y la frase tienen que cambiar de color a la vez, y con una variable por estado no hay
       manera de que uno se quede atrás. */
    .fs-bud {
      --fs-bud-ink: var(--fs-ink-muted);
      --fs-bud-fill: var(--fs-brand);
    }

    .fs-bud[data-tone='close'] {
      --fs-bud-ink: #8f5220;
      --fs-bud-fill: #d98324;
    }

    .fs-bud[data-tone='over'] {
      --fs-bud-ink: var(--fs-expense-ink);
      --fs-bud-fill: var(--fs-expense);
    }

    .fs-bud__head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 0.75rem;
      margin: 0 0 0.4rem;
    }

    .fs-bud__name {
      font-size: var(--fs-text-base);
      font-weight: 600;
      color: var(--fs-ink);
    }

    .fs-bud__figures {
      display: flex;
      align-items: baseline;
      gap: 0.3rem;
      white-space: nowrap;
    }

    /* Lo gastado es lo que se mira; lo presupuestado solo le da escala. */
    .fs-bud__spent {
      font-size: var(--fs-text-base);
      font-weight: 600;
      color: var(--fs-ink);
    }

    .fs-bud__of {
      font-size: var(--fs-text-xs);
      color: var(--fs-ink-faint);
    }

    .fs-bud__track {
      position: relative;
      height: 0.5rem;
      border-radius: 999px;
      background-color: var(--fs-shade);
      overflow: hidden;
    }

    .fs-bud__fill {
      display: block;
      height: 100%;
      border-radius: 999px;
      background-color: var(--fs-bud-fill);
      transition: width 0.35s cubic-bezier(0.22, 1, 0.36, 1);
    }

    @media (prefers-reduced-motion: reduce) {
      .fs-bud__fill {
        transition: none;
      }
    }

    .fs-bud__foot {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 0.75rem;
      margin: 0.35rem 0 0;
      font-size: var(--fs-text-xs);
    }

    .fs-bud__reading {
      color: var(--fs-bud-ink);
      font-weight: 500;
    }

    .fs-bud__percent {
      color: var(--fs-ink-faint);
    }
  `,
})
export class BudgetBarComponent {
  readonly budget = input.required<BudgetResponse>();

  /**
   * Qué parte del presupuesto se lleva gastada, redondeada al entero.
   * Puede pasar de cien: es justo el caso que hay que poder leer.
   */
  protected readonly percent = computed(() => {
    const { spent, amount } = this.budget();
    return amount > 0 ? Math.round((spent / amount) * 100) : 0;
  });

  /** Lo que se dibuja, que sí se corta en cien: no hay carril más allá del carril. */
  protected readonly width = computed(() => Math.min(100, Math.max(0, this.percent())));

  protected readonly tone = computed<BudgetTone>(() => {
    const { spent, amount } = this.budget();
    if (spent > amount) {
      return 'over';
    }
    return amount > 0 && spent / amount >= CLOSE_RATIO ? 'close' : 'ok';
  });

  /** El avance entero en una frase, que es lo que oye quien no ve la barra. */
  protected readonly reading = computed(() => {
    const budget = this.budget();
    const base = `${budget.category}: ${formatMoney(budget.spent)} de ${formatMoney(budget.amount)}`;
    return this.tone() === 'over'
      ? `${base}, te pasaste por ${formatMoney(-budget.remaining)}`
      : `${base}, queda ${formatMoney(budget.remaining)}`;
  });

  protected money(amount: number): string {
    return formatMoney(amount);
  }
}
