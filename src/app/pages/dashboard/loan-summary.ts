import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Currency, LoanResponse } from '../../core/models';
import { formatMoney } from '../../core/format/money';
import { dueDistance, isoDate } from '../../core/format/loan-plan';

/** Cuántos préstamos caben en el inicio antes de que la tarjeta deje de ser un vistazo. */
const VISIBLE = 3;

/**
 * Lo que te deben, en el inicio.
 *
 * Igual que con los fijos, la pantalla de préstamos se visita para apuntarlos y poco más; lo
 * que hay que tener a la vista es quién te tiene que pagar pronto. Por eso el botón de
 * «Me pagó» está aquí: registra lo que falta de la próxima cuota con fecha de hoy, que es lo
 * que pasa casi siempre. Si pagó otra cifra, se ajusta en la pantalla de préstamos.
 *
 * El orden es el de la API —lo vencido primero, después por la próxima cuota—, que es el
 * orden del apuro.
 */
@Component({
  selector: 'fs-loan-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    @if (open().length) {
      <p class="fs-loansum__total">
        <span class="fs-num fs-loansum__amount">{{ outstanding() }}</span>
        <span class="fs-loansum__of">
          por cobrar en {{ open().length }}
          {{ open().length === 1 ? 'préstamo' : 'préstamos' }}
        </span>
      </p>

      <ul class="fs-loansum__list">
        @for (loan of visible(); track loan.id) {
          <li class="fs-loansum__item" [class.is-overdue]="loan.status === 'OVERDUE'">
            <span class="fs-loansum__body">
              <span class="fs-loansum__name text-truncate">{{ loan.borrowerName }}</span>
              <span class="fs-loansum__when">{{ when(loan) }}</span>
            </span>
            <span class="fs-num fs-loansum__figure">
              {{ money(loan.nextDueAmount ?? loan.outstanding, loan.currency) }}
            </span>
            <button
              class="fs-btn fs-btn--sm fs-btn--soft"
              type="button"
              [disabled]="busy()"
              (click)="collected.emit(loan)"
              [attr.aria-label]="'Registrar que ' + loan.borrowerName + ' te pagó'"
            >
              <i class="bi bi-check2" aria-hidden="true"></i>Me pagó
            </button>
          </li>
        }
      </ul>

      @if (hidden() > 0) {
        <p class="fs-note">
          Y {{ hidden() }} {{ hidden() === 1 ? 'préstamo más' : 'préstamos más' }} por cobrar.
        </p>
      }
    } @else if (loans().length) {
      <p class="fs-loansum__clear">
        <i class="bi bi-check2-circle" aria-hidden="true"></i>
        Nadie te debe nada ahora mismo.
      </p>
    } @else {
      <p class="fs-loansum__empty">
        Si le prestas dinero a alguien, apúntalo: te avisamos cuando se acerque el día en que te lo
        tiene que devolver.
      </p>
      <a class="fs-btn fs-btn--soft fs-btn--sm" [routerLink]="['/loans']">
        <i class="bi bi-cash-coin" aria-hidden="true"></i>Apuntar un préstamo
      </a>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .fs-loansum__total {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin: 0 0 0.85rem;
    }

    .fs-loansum__amount {
      font-size: var(--fs-text-md);
      font-weight: 680;
      letter-spacing: -0.02em;
    }

    .fs-loansum__of {
      font-size: var(--fs-text-xs);
      color: var(--fs-ink-muted);
    }

    .fs-loansum__list {
      list-style: none;
      margin: 0 0 0.75rem;
      padding: 0;
      display: flex;
      flex-direction: column;
    }

    .fs-loansum__item {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.5rem 0;
      border-top: 1px solid var(--fs-line);
    }

    .fs-loansum__item:first-child {
      border-top: 0;
    }

    .fs-loansum__body {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .fs-loansum__name {
      font-size: var(--fs-text-sm);
      font-weight: 600;
      color: var(--fs-ink);
    }

    /* Lo vencido se dice con palabras y el color solo acompaña, como en los fijos. */
    .fs-loansum__when {
      font-size: var(--fs-text-xs);
      color: var(--fs-ink-faint);
    }

    .fs-loansum__item.is-overdue .fs-loansum__when {
      color: var(--fs-expense-ink);
      font-weight: 500;
    }

    .fs-loansum__figure {
      flex: 0 0 auto;
      font-size: var(--fs-text-sm);
      font-weight: 600;
    }

    .fs-loansum__clear {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      margin: 0;
      font-size: var(--fs-text-sm);
      color: var(--fs-ink-muted);
    }

    .fs-loansum__clear i {
      color: var(--fs-income);
    }

    .fs-loansum__empty {
      margin: 0 0 0.85rem;
      font-size: var(--fs-text-sm);
      color: var(--fs-ink-muted);
    }
  `,
})
export class LoanSummaryComponent {
  /** Todos los préstamos, en el orden en que los devuelve la API. */
  readonly loans = input.required<LoanResponse[]>();

  /** Mientras se registra un pago, para que no se pueda pulsar dos veces. */
  readonly busy = input(false);

  /** El préstamo del que el usuario acaba de decir que le pagaron la próxima cuota. */
  readonly collected = output<LoanResponse>();

  /** Hoy, para decir cuánto falta. Fijo mientras dure la tarjeta. */
  private readonly today = isoDate();

  /** Los que todavía deben algo; lo saldado y lo cerrado no piden nada aquí. */
  protected readonly open = computed(() =>
    this.loans().filter((loan) => loan.status === 'ACTIVE' || loan.status === 'OVERDUE'),
  );

  protected readonly visible = computed(() => this.open().slice(0, VISIBLE));

  protected readonly hidden = computed(() => Math.max(0, this.open().length - VISIBLE));

  /** Lo que falta por cobrar, por moneda: soles y dólares no se suman. */
  protected readonly outstanding = computed(() => {
    const totals = new Map<Currency, number>();
    for (const loan of this.open()) {
      totals.set(loan.currency, (totals.get(loan.currency) ?? 0) + loan.outstanding);
    }
    return [...totals.entries()]
      .map(([currency, amount]) => formatMoney(amount, currency))
      .join(' · ');
  });

  /** Cuándo toca la próxima cuota, dicho en voz alta: «Vence mañana», «Venció hace 3 días». */
  protected when(loan: LoanResponse): string {
    if (!loan.nextDueDate) {
      return '';
    }
    const distance = dueDistance(loan.nextDueDate, this.today);
    return loan.status === 'OVERDUE' ? `Venció ${distance}` : `Vence ${distance}`;
  }

  protected money(amount: number, currency: Currency): string {
    return formatMoney(amount, currency);
  }
}
