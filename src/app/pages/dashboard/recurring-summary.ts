import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RecurringOccurrenceResponse } from '../../core/models';
import { formatMoney } from '../../core/format/money';

/** Cuántos pendientes caben en el inicio antes de que la tarjeta deje de ser un vistazo. */
const VISIBLE = 4;

/**
 * Lo que falta por pagar este mes, en el inicio.
 *
 * Es la mitad útil de los fijos. La otra —darlos de alta, cambiarlos, pausarlos— se hace una
 * vez y se olvida; esta se mira todos los meses, y una lista de pendientes en una pantalla
 * que no se visita no le recuerda nada a nadie. Por eso el botón de marcar como pagado está
 * aquí y no solo en su pantalla: si hay que navegar para dar un toque, el toque no se da.
 *
 * Primero lo vencido y después lo que está por vencer, que es el orden del apuro. Un fijo
 * que vence el día 28 no es noticia el día 3 y no debería ocupar el sitio de uno que sí lo
 * es.
 */
@Component({
  selector: 'fs-recurring-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    @if (pending().length) {
      <p class="fs-recsum__total">
        <span class="fs-num fs-recsum__amount">{{ money(pendingAmount()) }}</span>
        <span class="fs-recsum__of">
          en {{ pending().length }}
          {{ pending().length === 1 ? 'fijo por pagar' : 'fijos por pagar' }}
        </span>
      </p>

      <ul class="fs-recsum__list">
        @for (item of visible(); track item.id) {
          <li class="fs-recsum__item" [class.is-overdue]="item.status === 'OVERDUE'">
            <span class="fs-recsum__body">
              <span class="fs-recsum__name text-truncate">{{ item.description }}</span>
              <span class="fs-recsum__when">
                @if (item.status === 'OVERDUE') {
                  Venció el {{ item.dayOfMonth }}
                } @else {
                  Día {{ item.dayOfMonth }}
                }
              </span>
            </span>
            <span class="fs-num fs-recsum__figure">{{ money(item.amount) }}</span>
            <button
              class="fs-btn fs-btn--sm fs-btn--soft"
              type="button"
              [disabled]="busy()"
              (click)="confirmed.emit(item)"
              [attr.aria-label]="'Marcar ' + item.description + ' como pagado'"
            >
              <i class="bi bi-check2" aria-hidden="true"></i>
              {{ item.type === 'INCOME' ? 'Cobrado' : 'Pagado' }}
            </button>
          </li>
        }
      </ul>

      <p class="fs-note">
        @if (hidden() > 0) {
          Y {{ hidden() }} {{ hidden() === 1 ? 'fijo más' : 'fijos más' }} por resolver.
        } @else {
          Marcarlo registra el movimiento con el importe de siempre. Si vino distinto, ajústalo
          en la pantalla de fijos.
        }
      </p>
    } @else if (items().length) {
      <p class="fs-recsum__clear">
        <i class="bi bi-check2-circle" aria-hidden="true"></i>
        Este mes ya no te queda ningún fijo por resolver.
      </p>
    } @else {
      <p class="fs-recsum__empty">
        Los fijos son lo que se repite todos los meses. Con el alquiler, el internet y el sueldo
        apuntados ya sabes cuánto del mes está comprometido antes de gastar nada.
      </p>
      <a class="fs-btn fs-btn--soft fs-btn--sm" [routerLink]="['/recurring']">
        <i class="bi bi-arrow-repeat" aria-hidden="true"></i>Apuntar un fijo
      </a>
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .fs-recsum__total {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin: 0 0 0.85rem;
    }

    .fs-recsum__amount {
      font-size: var(--fs-text-md);
      font-weight: 680;
      letter-spacing: -0.02em;
    }

    .fs-recsum__of {
      font-size: var(--fs-text-xs);
      color: var(--fs-ink-muted);
    }

    .fs-recsum__list {
      list-style: none;
      margin: 0 0 0.75rem;
      padding: 0;
      display: flex;
      flex-direction: column;
    }

    .fs-recsum__item {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.5rem 0;
      border-top: 1px solid var(--fs-line);
    }

    .fs-recsum__item:first-child {
      border-top: 0;
    }

    .fs-recsum__body {
      flex: 1 1 auto;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .fs-recsum__name {
      font-size: var(--fs-text-sm);
      font-weight: 600;
      color: var(--fs-ink);
    }

    /* Lo vencido se dice con palabras —«Venció el 12»— y el color solo acompaña, porque quien
       no lo distingue tiene que poder leer igual qué se le pasó. */
    .fs-recsum__when {
      font-size: var(--fs-text-xs);
      color: var(--fs-ink-faint);
    }

    .fs-recsum__item.is-overdue .fs-recsum__when {
      color: var(--fs-expense-ink);
      font-weight: 500;
    }

    .fs-recsum__figure {
      flex: 0 0 auto;
      font-size: var(--fs-text-sm);
      font-weight: 600;
    }

    .fs-recsum__clear {
      display: flex;
      align-items: center;
      gap: 0.45rem;
      margin: 0;
      font-size: var(--fs-text-sm);
      color: var(--fs-ink-muted);
    }

    .fs-recsum__clear i {
      color: var(--fs-income);
    }

    .fs-recsum__empty {
      margin: 0 0 0.85rem;
      font-size: var(--fs-text-sm);
      color: var(--fs-ink-muted);
    }
  `,
})
export class RecurringSummaryComponent {
  /** Todos los fijos del mes, en cualquier estado, tal y como llegan de la API. */
  readonly items = input.required<RecurringOccurrenceResponse[]>();

  /** Mientras se está registrando uno, para que no se pueda pulsar dos veces. */
  readonly busy = input(false);

  /** El fijo que el usuario acaba de dar por pagado. */
  readonly confirmed = output<RecurringOccurrenceResponse>();

  /** Lo que este mes vence y sigue sin resolverse, que es lo único que importa aquí. */
  protected readonly pending = computed(() =>
    this.items().filter((item) => item.status === 'PENDING' || item.status === 'OVERDUE'),
  );

  /**
   * Los del apuro, primero.
   * Se ordena por el día de vencimiento y no por el importe: lo que ya venció aprieta más
   * que lo que vence dentro de tres semanas, cueste lo que cueste.
   */
  protected readonly visible = computed(() =>
    [...this.pending()]
      .sort((left, right) => left.dayOfMonth - right.dayOfMonth)
      .slice(0, VISIBLE),
  );

  protected readonly hidden = computed(() => Math.max(0, this.pending().length - VISIBLE));

  /** Lo que se van a llevar los que faltan. Solo los egresos: un cobro no es una deuda. */
  protected readonly pendingAmount = computed(() =>
    this.pending()
      .filter((item) => item.type === 'EXPENSE')
      .reduce((total, item) => total + item.amount, 0),
  );

  protected money(amount: number): string {
    return formatMoney(amount);
  }
}
