import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AmountComponent } from '../../shared/ui/amount';
import { CategoryChipComponent } from '../../shared/ui/category-chip';
import { dayGroupLabel } from '../../core/format/period';
import { TransactionResponse } from '../../core/models';

/** Movimientos de un mismo día, con el rótulo bajo el que se agrupan. */
interface DayGroup {
  label: string;
  transactions: TransactionResponse[];
}

/**
 * Los últimos movimientos, agrupados por día.
 *
 * Es una lista, no una tabla: en el dashboard interesa reconocer de un vistazo qué ha
 * pasado, y para eso la categoría y el importe pesan más que la fecha exacta.
 *
 * Los tags no se dibujan aquí a propósito. Son el matiz, no la clasificación, y en un
 * resumen de seis líneas añadirían ruido; están enteros en el historial, a un toque del
 * enlace del final.
 */
@Component({
  selector: 'fs-recent-transactions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AmountComponent, CategoryChipComponent],
  template: `
    @for (group of groups(); track group.label) {
      <p class="fs-day">{{ group.label }}</p>
      <ul class="fs-list">
        @for (transaction of group.transactions; track transaction.id) {
          <li class="fs-item" [class.is-fresh]="highlightId() === transaction.id">
            <fs-category-chip [name]="transaction.category.name" [iconOnly]="true" />
            <div class="fs-item__body">
              <p class="fs-item__category text-truncate">{{ transaction.category.name }}</p>
              @if (transaction.description) {
                <p class="fs-item__note text-truncate">{{ transaction.description }}</p>
              }
            </div>
            <fs-amount [amount]="transaction.amount" [code]="transaction.transactionType.code" />
          </li>
        }
      </ul>
    } @empty {
      <div class="fs-blank">
        <i class="bi bi-receipt" aria-hidden="true"></i>
        <p>Todavía no hay movimientos en este periodo.</p>
        <p class="fs-blank__hint">Registra el primero con el formulario de arriba.</p>
      </div>
    }

    @if (groups().length) {
      <a class="fs-more" [routerLink]="['/transactions']">
        Ver todos los movimientos<i class="bi bi-chevron-right" aria-hidden="true"></i>
      </a>
    }
  `,
  styles: `
    .fs-day {
      margin: 1rem 0 0.5rem;
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--fs-ink-faint);
    }

    .fs-day:first-child {
      margin-top: 0;
    }

    .fs-list {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
    }

    .fs-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.7rem 0;
      border-bottom: 1px solid var(--fs-line);
    }

    .fs-item:last-child {
      border-bottom: none;
    }

    /* Destello del movimiento recién registrado: aparece en la lista y se anuncia solo. */
    .fs-item.is-fresh {
      animation: fs-fresh 1.8s ease-out;
    }

    @keyframes fs-fresh {
      0%,
      20% {
        background-color: var(--fs-brand-tint);
      }
      100% {
        background-color: transparent;
      }
    }

    .fs-item fs-category-chip {
      flex: none;
      line-height: 0;
    }

    .fs-item__body {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 0.1rem;
    }

    .fs-item__category {
      margin: 0;
      font-size: 0.9375rem;
      font-weight: 600;
      color: var(--fs-ink);
    }

    .fs-item__note {
      margin: 0;
      font-size: 0.8125rem;
      color: var(--fs-ink-muted);
    }

    .fs-blank {
      padding: 2rem 1rem;
      text-align: center;
      color: var(--fs-ink-muted);
      font-size: 0.9375rem;
    }

    .fs-blank i {
      display: block;
      margin-bottom: 0.5rem;
      font-size: 1.75rem;
      color: var(--fs-ink-faint);
    }

    .fs-blank__hint {
      font-size: 0.8125rem;
      color: var(--fs-ink-faint);
    }

    .fs-more {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      margin-top: 1rem;
      font-size: 0.875rem;
      font-weight: 500;
      text-decoration: none;
    }
  `,
})
export class RecentTransactionsComponent {
  readonly transactions = input.required<TransactionResponse[]>();

  /** Movimiento que se acaba de registrar, para señalarlo al aparecer. */
  readonly highlightId = input<number | null>(null);

  /**
   * Agrupa por día conservando el orden en que llegan.
   * La API ya los devuelve del más reciente al más antiguo, de modo que basta con abrir un
   * grupo nuevo cada vez que cambia el día.
   */
  protected readonly groups = computed<DayGroup[]>(() => {
    const groups: DayGroup[] = [];
    for (const transaction of this.transactions()) {
      const label = dayGroupLabel(transaction.date);
      const current = groups.at(-1);
      if (current?.label === label) {
        current.transactions.push(transaction);
      } else {
        groups.push({ label, transactions: [transaction] });
      }
    }
    return groups;
  });
}
