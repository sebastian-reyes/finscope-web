import { Injectable, computed, inject, linkedSignal } from '@angular/core';
import { AuthService } from './auth.service';
import { PreferenceOwner, readPreference, writePreference } from './preferences';

const MONEY_VIEW_KEY = 'finscope.moneyView';

/**
 * Cómo se enseñan los totales del inicio: todo en soles, todo en dólares, o cada moneda por
 * separado, que es como se veía antes de poder juntarlas.
 */
export type MoneyView = 'PEN' | 'USD' | 'split';

/**
 * La forma de ver el dinero que ha elegido el usuario en este dispositivo.
 *
 * Es una preferencia de cómo se mira, no de quién se es, así que vive en el navegador como
 * el tema y no en el perfil. Va a nombre de quien la elige por lo mismo que el tema: cerrar
 * sesión no vacía el `localStorage`, y la siguiente persona no tiene por qué heredarla.
 *
 * Abre en soles: es como piensa sus cuentas casi todo el mundo aquí, y juntar las monedas es
 * justo lo que hace que el balance ocupe una tarjeta y no dos.
 */
@Injectable({ providedIn: 'root' })
export class MoneyViewService {
  private readonly auth = inject(AuthService);

  private readonly owner = computed<PreferenceOwner>(() => this.auth.user()?.id ?? null);

  private readonly viewSignal = linkedSignal({
    source: this.owner,
    computation: (owner: PreferenceOwner) => readStoredView(owner),
  });

  readonly view = this.viewSignal.asReadonly();

  set(view: MoneyView): void {
    this.viewSignal.set(view);
    writePreference(MONEY_VIEW_KEY, this.owner(), view);
  }
}

function readStoredView(owner: PreferenceOwner): MoneyView {
  const stored = readPreference(MONEY_VIEW_KEY, owner);
  return stored === 'USD' || stored === 'split' ? stored : 'PEN';
}
