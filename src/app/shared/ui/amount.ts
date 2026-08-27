import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CURRENCY_SYMBOL, formatAmount } from '../../core/format/money';
import { TransactionTypeCode } from '../../core/models';

/**
 * Importe con su signo.
 *
 * La regla que hace falta respetar en toda la aplicación es que el color nunca viaja solo:
 * quien no distingue el verde del rojo tiene que poder leer si el dinero entra o sale, así
 * que el signo se dibuja siempre y el lector de pantalla recibe la palabra completa.
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
          {{ currency }}
        }
        {{ formatted() }}
      </span>
    </span>
  `,
})
export class AmountComponent {
  /** Importe en positivo, tal y como lo devuelve la API. */
  readonly amount = input.required<number>();

  /** Tipo de la transacción, si el importe pertenece a una. */
  readonly code = input<TransactionTypeCode | null>(null);

  /**
   * Balance con signo propio, para los totales.
   * Un neto negativo se muestra como egreso sin que exista un tipo detrás.
   */
  readonly signed = input(false);

  /** Si se antepone el símbolo de la moneda. */
  readonly symbol = input(true);

  protected readonly currency = CURRENCY_SYMBOL;

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
    const money = `${CURRENCY_SYMBOL} ${this.formatted()}`;
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
