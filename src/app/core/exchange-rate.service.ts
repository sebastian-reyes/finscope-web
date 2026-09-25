import { Injectable, inject, signal } from '@angular/core';
import { FinscopeService } from './finscope.service';
import { Currency } from './models';

/** El tipo de cambio que se usó la última vez, y cuándo fue. */
export interface LastExchangeRate {
  rate: number;
  /** Fecha del movimiento del que sale, para poder decir de cuándo es. */
  date: string;
}

/**
 * El último tipo de cambio que el usuario apuntó en cada moneda.
 *
 * Existe para que registrar en dólares no cueste un campo más que registrar en soles. La
 * tasa hay que guardarla —sin ella el importe no se puede volver a leer en soles nunca—,
 * pero teclearla en cada movimiento es justo el paso de sobra que hace que se deje de
 * registrar. Así que se propone la última que se usó y basta con confirmarla; corregirla
 * sigue siendo un campo editable.
 *
 * **Sale del propio historial, no de ninguna fuente externa.** Es la tasa que el banco le
 * aplicó de verdad la última vez, que es la única que cuadra con su cuenta, y no un número
 * inventado que parece exacto. Por eso se acompaña de su fecha: una tasa de hace dos semanas
 * es una propuesta razonable, pero quien registra tiene que poder ver que es de hace dos
 * semanas.
 *
 * Se pide una sola vez por moneda y por sesión, y se actualiza sola al guardar: quien acaba
 * de registrar a 3.55 tendrá 3.55 en el siguiente movimiento sin que haga falta preguntar
 * otra vez.
 */
@Injectable({ providedIn: 'root' })
export class ExchangeRateService {
  private readonly api = inject(FinscopeService);

  /** Lo último conocido de cada moneda. Sin entrada significa «todavía no se ha mirado». */
  private readonly known = signal<Partial<Record<Currency, LastExchangeRate | null>>>({});

  /** Monedas que ya se están pidiendo, para no lanzar la misma consulta dos veces. */
  private readonly loading = new Set<Currency>();

  /**
   * Devuelve el último tipo de cambio conocido de una moneda.
   *
   * @param currency moneda que se quiere proponer
   * @return lo último que se usó, o nulo si no hay ningún movimiento previo en ella
   */
  lastRate(currency: Currency): LastExchangeRate | null {
    return this.known()[currency] ?? null;
  }

  /**
   * Si ya se sabe cuál es el último tipo de cambio de una moneda, aunque la respuesta sea
   * que no hay ninguno. Distingue «todavía no se ha mirado» de «no hay movimientos en ella».
   *
   * @param currency moneda por la que se pregunta
   * @return si ya se ha consultado con éxito
   */
  isKnown(currency: Currency): boolean {
    return currency in this.known();
  }

  /**
   * Se asegura de conocer el último tipo de cambio de una moneda, pidiéndolo si hace falta.
   *
   * Es el movimiento más reciente en esa moneda, sin acotar por periodo: quien no registra
   * en dólares desde marzo sigue queriendo la tasa de marzo antes que un campo en blanco.
   * Un error no se cuenta ni se reintenta: esto es una comodidad, y si falla lo único que
   * pasa es que el campo se queda vacío, como estaba antes de existir.
   *
   * @param currency moneda de la que se quiere la última tasa
   */
  ensureLoaded(currency: Currency): void {
    if (currency in this.known() || this.loading.has(currency)) {
      return;
    }
    this.loading.add(currency);
    this.api.listTransactions({ currency, page: 0, size: 1, sort: 'date,desc' }).subscribe({
      next: (page) => {
        const last = page.content[0];
        this.known.update((current) => ({
          ...current,
          [currency]: last?.exchangeRate ? { rate: last.exchangeRate, date: last.date } : null,
        }));
        this.loading.delete(currency);
      },
      error: () => {
        // Sin entrada en el mapa: se volverá a intentar la próxima vez que se elija esta
        // moneda, en lugar de quedarse recordando que una vez falló.
        this.loading.delete(currency);
      },
    });
  }

  /**
   * Recuerda la tasa con la que se acaba de registrar un movimiento.
   * Evita volver a preguntársela a la API: lo que se guardó es, por definición, lo último.
   *
   * @param currency moneda del movimiento
   * @param rate     tipo de cambio con el que se guardó
   * @param date     fecha del movimiento
   */
  remember(currency: Currency, rate: number, date: string): void {
    this.known.update((current) => ({ ...current, [currency]: { rate, date } }));
  }
}
