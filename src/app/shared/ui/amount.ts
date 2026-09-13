import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { BASE_CURRENCY, currencySymbol, formatAmount } from '../../core/format/money';
import { Currency, TransactionTypeCode } from '../../core/models';

/**
 * Importe con su signo y su moneda.
 *
 * La regla que hace falta respetar en toda la aplicación es que el color nunca viaja solo:
 * quien no distingue el verde del rojo tiene que poder leer si el dinero entra o sale, así
 * que el signo se dibuja siempre y el lector de pantalla recibe la palabra completa.
 *
 * El símbolo sigue la misma idea: un número sin moneda no dice cuánto es, así que quien
 * pinta un importe de una transacción pasa la suya. El valor por defecto es la base, que es
 * lo que son todas las cantidades que no pertenecen a un movimiento —un presupuesto, un
 * fijo— y lo que eran todas antes de que existieran las monedas.
 */
@Component({
  selector: 'fs-amount',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="fs-num text-nowrap"
      [class.fs-income]="tone() === 'income'"
      [class.fs-expense]="tone() === 'expense'"
      [attr.aria-label]="label()"
    >
      <span aria-hidden="true">
        @if (tone() !== 'neutral') {
          {{ tone() === 'income' ? '+' : '−' }}
        }
        @if (symbol()) {
          {{ sign() }}
        }
        {{ formatted() }}
      </span>
    </span>
  `,
})
export class AmountComponent {
  /** Importe en positivo, tal y como lo devuelve la API. */
  readonly amount = input.required<number>();

  /** Moneda del importe. Por defecto la base, que es la de todo lo que no es un movimiento. */
  readonly currency = input<Currency>(BASE_CURRENCY);

  /** Tipo de la transacción, si el importe pertenece a una. */
  readonly code = input<TransactionTypeCode | null>(null);

  /**
   * Balance con signo propio, para los totales.
   * Un neto negativo se muestra como egreso sin que exista un tipo detrás.
   */
  readonly signed = input(false);

  /** Si se antepone el símbolo de la moneda. */
  readonly symbol = input(true);

  protected readonly sign = computed(() => currencySymbol(this.currency()));

  protected readonly tone = computed<'income' | 'expense' | 'neutral'>(() => {
    const code = this.code();
    if (code) {
      return code === 'INCOME' ? 'income' : 'expense';
    }
    if (!this.signed()) {
      return 'neutral';
    }
    return this.amount() < 0 ? 'expense' : 'income';
  });

  protected readonly formatted = computed(() => formatAmount(this.amount()));

  protected readonly label = computed(() => {
    const money = `${this.sign()} ${this.formatted()}`;
    switch (this.tone()) {
      case 'income':
        return `Ingreso de ${money}`;
      case 'expense':
        return `Egreso de ${money}`;
      default:
        return money;
    }
  });
}
