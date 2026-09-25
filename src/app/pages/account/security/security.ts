import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../../core/auth.service';
import { ToastService } from '../../../core/toast.service';
import { describeError } from '../../../core/api-error';

/**
 * El correo con el que se entra y la contraseña.
 *
 * La contraseña vive aquí como un botón y no como un campo: se cambia con el mismo enlace
 * que la recupera quien la ha olvidado, que es lo único que ofrece el contrato y, además, lo
 * que impide que una sesión abierta y sin dueño delante valga para quedarse con la cuenta.
 *
 * El correo tampoco se cambia de un tirón: es la credencial con la que se entra, así que se
 * pide la contraseña y la dirección nueva no sustituye a la vieja hasta que se confirma el
 * enlace que llega a ella. Una letra de más al teclear se queda en un enlace que caduca y no
 * en una cuenta a la que ya no se puede entrar.
 */
@Component({
  selector: 'app-account-security',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './security.html',
  styleUrls: ['../settings-shared.scss', './security.scss'],
})
export class AccountSecurityPage {
  private readonly auth = inject(AuthService);
  private readonly toasts = inject(ToastService);

  protected readonly user = this.auth.user;

  /** Si el formulario de cambio de correo está desplegado. */
  protected readonly changingEmail = signal(false);

  /** Dirección nueva y contraseña en curso, que es el permiso para cambiarla. */
  protected readonly newEmail = signal('');
  protected readonly password = signal('');
  protected readonly showPassword = signal(false);

  /** Envios en curso, cada uno con su botón. */
  protected readonly sendingVerification = signal(false);
  protected readonly sendingChange = signal(false);
  protected readonly sendingPassword = signal(false);

  /** Si el enlace para elegir contraseña nueva ya ha salido, mientras no se recargue. */
  protected readonly passwordLinkSent = signal(false);

  /** La dirección a la que se acaba de mandar el enlace, mientras no se recargue. */
  protected readonly pendingEmail = signal<string | null>(null);

  /** Si el correo de la cuenta está ya comprobado. */
  protected readonly verified = computed(() => this.user()?.emailVerified === true);

  /**
   * Si la dirección escrita sirve para pedir el cambio.
   * Se comprueba aquí lo mínimo --- que tenga forma de correo, que no sea la de ahora y que
   * haya contraseña --- para no gastar un viaje a la API en algo que se ve desde el campo.
   */
  protected readonly canSubmitEmail = computed(() => {
    const email = this.newEmail().trim();
    return (
      /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) &&
      email.toLowerCase() !== (this.user()?.email ?? '').toLowerCase() &&
      this.password().length > 0
    );
  });

  /** Vuelve a mandar el correo de verificación a la dirección de la cuenta. */
  protected resendVerification(): void {
    if (this.sendingVerification()) {
      return;
    }
    this.sendingVerification.set(true);
    this.auth.sendEmailVerification().subscribe({
      next: () => {
        this.sendingVerification.set(false);
        this.toasts.success('Te hemos mandado el enlace. Mira tu correo.');
      },
      error: (error) => {
        this.toasts.error(describeError(error));
        this.sendingVerification.set(false);
      },
    });
  }

  /**
   * Manda al correo de la cuenta el enlace con el que elegir una contraseña nueva.
   *
   * Es el mismo enlace de «¿olvidaste tu contraseña?», y no una pantalla aparte que pida la
   * actual. El contrato no tiene un cambio de contraseña con sesión, y tampoco hace falta:
   * tener la sesión abierta no es saber la contraseña, así que pasar por el buzón es lo que
   * impide que quien se encuentre esta pantalla delante se quede con la cuenta.
   */
  protected sendPasswordLink(): void {
    const email = this.user()?.email;
    if (this.sendingPassword() || !email) {
      return;
    }
    this.sendingPassword.set(true);
    this.auth.requestPasswordReset(email).subscribe({
      next: () => {
        this.sendingPassword.set(false);
        this.passwordLinkSent.set(true);
        this.toasts.success('Te hemos mandado el enlace. Mira tu correo.');
      },
      error: (error) => {
        this.toasts.error(describeError(error));
        this.sendingPassword.set(false);
      },
    });
  }

  /** Despliega o recoge el formulario del correo, dejándolo siempre en blanco. */
  protected toggleEmailForm(): void {
    this.changingEmail.set(!this.changingEmail());
    this.newEmail.set('');
    this.password.set('');
    this.showPassword.set(false);
  }

  /**
   * Recoge el envío del formulario del correo.
   *
   * @param event envío del formulario
   */
  protected onEmailSubmit(event: Event): void {
    event.preventDefault();
    this.requestEmailChange();
  }

  /**
   * Pide el cambio de correo. No cambia nada todavía: manda el enlace a la dirección nueva.
   */
  protected requestEmailChange(): void {
    if (this.sendingChange() || !this.canSubmitEmail()) {
      return;
    }
    this.sendingChange.set(true);
    const email = this.newEmail().trim();
    this.auth.requestEmailChange({ email, password: this.password() }).subscribe({
      next: () => {
        this.sendingChange.set(false);
        this.changingEmail.set(false);
        this.password.set('');
        this.pendingEmail.set(email);
      },
      error: (error) => {
        this.toasts.error(describeError(error));
        this.sendingChange.set(false);
      },
    });
  }
}
