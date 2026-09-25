import { Injectable, computed, inject, linkedSignal } from '@angular/core';
import { AuthService } from './auth.service';
import { PreferenceOwner, preferenceKey } from './preferences';

const ONBOARDING_KEY = 'finscope.onboarding';

/** Recorrido que falta por ver. */
const PENDING = 'pending';

/** Recorrido visto u omitido, que para esto es lo mismo: no se vuelve a abrir solo. */
const DONE = 'done';

/**
 * El recorrido de bienvenida: cuándo se abre solo y cuándo deja de hacerlo.
 *
 * Solo lo recibe quien acaba de crear su cuenta. No basta con «quien no lo haya visto»: todas
 * las cuentas que ya existían tampoco lo han visto, y enseñarle a alguien con seis meses de
 * movimientos cómo se apunta un gasto es un estorbo, no una bienvenida. Por eso lo marca el
 * alta, y no la ausencia de marca.
 *
 * Queda pendiente hasta que se termina o se omite, de modo que cerrar la pestaña a mitad no
 * lo pierde. Se guarda a nombre de la cuenta por el mismo motivo que el tema —cerrar sesión no
 * vacía el `localStorage`— pero, a diferencia de él, **sin caer en la clave anónima**: no hay
 * recorrido que heredar de antes de entrar, y una clave suelta se lo abriría a la siguiente
 * persona que usara el navegador.
 *
 * No viaja en el perfil: quien se registra en el ordenador y abre luego el teléfono no lo ve
 * dos veces, pero tampoco lo ve en el teléfono. Para eso haría falta tocar el contrato, y el
 * recorrido se puede volver a abrir desde la configuración.
 */
@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private readonly auth = inject(AuthService);

  private readonly owner = computed<PreferenceOwner>(() => this.auth.user()?.id ?? null);

  private readonly openSignal = linkedSignal({
    source: this.owner,
    computation: (owner: PreferenceOwner) =>
      owner !== null && localStorage.getItem(preferenceKey(ONBOARDING_KEY, owner)) === PENDING,
  });

  /** Si el recorrido está en pantalla. Sin sesión no lo está nunca. */
  readonly isOpen = computed(() => this.auth.isLoggedIn() && this.openSignal());

  /**
   * Deja el recorrido pendiente para la cuenta recién creada y lo abre.
   * Se llama después de guardar la sesión del alta, que es la que dice de quién es.
   */
  markNewAccount(): void {
    const owner = this.owner();
    if (owner === null) {
      return;
    }
    localStorage.setItem(preferenceKey(ONBOARDING_KEY, owner), PENDING);
    this.openSignal.set(true);
  }

  /** Vuelve a abrirlo a petición de quien ya lo vio, sin cambiar lo guardado. */
  replay(): void {
    this.openSignal.set(true);
  }

  /** Lo cierra, se haya terminado u omitido, y no vuelve a abrirse solo. */
  finish(): void {
    const owner = this.owner();
    if (owner !== null) {
      localStorage.setItem(preferenceKey(ONBOARDING_KEY, owner), DONE);
    }
    this.openSignal.set(false);
  }
}
