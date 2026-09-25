import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { describeError, errorCode } from '../../core/api-error';
import { LogoComponent } from '../../shared/ui/logo';

/** Cuál de los dos enlaces se está consumiendo. Lo pone la ruta. */
export type ConfirmKind = 'verify' | 'change';

/** Lo que se dice en cada caso cuando el enlace se consume bien. */
interface Wording {
  working: string;
  title: string;
  hint: string;
}

const WORDING: Record<ConfirmKind, Wording> = {
  verify: {
    working: 'Confirmando tu correo…',
    title: 'Correo confirmado',
    hint: 'Ya podemos escribirte si alguna vez necesitas recuperar tu contraseña.',
  },
  change: {
    working: 'Aplicando el cambio…',
    title: 'Correo cambiado',
    hint: 'Esta es ya la dirección de tu cuenta, y con ella entrarás a partir de ahora.',
  },
};

/**
 * Desenlace de un enlace recibido por correo: confirmar la dirección o aplicar su cambio.
 *
 * Las dos son la misma pantalla porque son el mismo momento: se llega desde el buzón, no hay
 * nada que rellenar y lo único que queda por saber es si ha salido bien. Lo que cambia entre
 * ellas son tres frases, así que se eligen por la ruta en lugar de duplicar el componente.
 *
 * Se confirma al entrar y sin pedir confirmación. Pulsar el enlace ya fue el acto de
 * voluntad; un segundo botón solo añadiría un paso a algo que se pidió hace un minuto.
 *
 * No lleva guardia: el correo se lee donde se lee, que rara vez es el navegador donde se
 * pidió el cambio. El token es la credencial.
 */
@Component({
  selector: 'app-confirm-link',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LogoComponent],
  templateUrl: './confirm-link.html',
})
export class ConfirmLinkPage {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  protected readonly kind: ConfirmKind = this.route.snapshot.data['kind'] ?? 'verify';
  protected readonly wording = WORDING[this.kind];

  protected readonly loading = signal(true);
  protected readonly done = signal(false);
  protected readonly error = signal<string | null>(null);

  /** Si lo que falló fue el enlace y no la petición: se ofrece rehacerlo, no reintentarlo. */
  protected readonly invalidLink = signal(false);

  protected readonly isLoggedIn = this.auth.isLoggedIn;

  /** A dónde lleva el botón del final, según haya sesión abierta o no. */
  protected readonly destination = computed(() =>
    this.isLoggedIn() ? '/account/security' : '/login',
  );

  constructor() {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.loading.set(false);
      this.invalidLink.set(true);
      return;
    }
    const request$ =
      this.kind === 'verify'
        ? this.auth.confirmEmailVerification(token)
        : this.auth.confirmEmailChange(token);
    request$.subscribe({
      next: () => {
        this.loading.set(false);
        this.done.set(true);
        // La sesión guarda una copia del usuario de cuando se entró, y acaba de quedarse
        // vieja: sin esto, la pantalla de cuenta seguiría enseñando el correo anterior o el
        // aviso de sin verificar hasta la próxima vez que se entrara.
        if (this.isLoggedIn()) {
          this.auth.refreshUser().subscribe({ error: () => undefined });
        }
      },
      error: (error) => {
        this.loading.set(false);
        if (errorCode(error) === 'INVALID_ACCOUNT_TOKEN') {
          this.invalidLink.set(true);
        } else {
          this.error.set(describeError(error));
        }
      },
    });
  }
}
