import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { describeError, errorCode } from '../../core/api-error';
import { LogoComponent } from '../../shared/ui/logo';

/** Longitud mínima que exige el contrato para la contraseña. */
const MIN_PASSWORD = 8;

/** Máximo que impone BCrypt: a partir de ahí ignora los caracteres. */
const MAX_PASSWORD = 72;

/**
 * Elegir una contraseña nueva con el enlace recibido por correo.
 *
 * El enlace es toda la credencial que hay aquí —quien llega no sabe la contraseña, que es
 * justo el motivo de estar en esta pantalla—, así que la dirección trae el token y la
 * pantalla no pide nada más que la contraseña nueva.
 *
 * Al terminar, la API cierra todas las sesiones abiertas de la cuenta. Es a propósito: si se
 * restablece la contraseña es porque se sospecha que otro la tiene, y dejar vivos los tokens
 * de refresco ya emitidos dejaría dentro a ese otro durante un mes.
 */
@Component({
  selector: 'app-reset-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, LogoComponent],
  templateUrl: './reset-password.html',
})
export class ResetPasswordPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toasts = inject(ToastService);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly minPassword = MIN_PASSWORD;
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly showPassword = signal(false);

  /** Si el enlace ha dejado de valer, que es un final y no un error del formulario. */
  protected readonly expired = signal(false);

  /** El valor del enlace. Sin él no hay nada que hacer en esta pantalla. */
  protected readonly token = this.route.snapshot.queryParamMap.get('token');

  protected readonly form = this.formBuilder.nonNullable.group({
    password: [
      '',
      [Validators.required, Validators.minLength(MIN_PASSWORD), Validators.maxLength(MAX_PASSWORD)],
    ],
  });

  protected get invalidPassword(): boolean {
    const control = this.form.controls.password;
    return control.touched && control.invalid;
  }

  protected submit(): void {
    if (this.loading() || !this.token) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.auth.resetPassword(this.token, this.form.controls.password.value).subscribe({
      next: () => {
        this.toasts.success('Contraseña cambiada. Entra con la nueva.');
        // Se manda al acceso y no al inicio: la API acaba de revocar todas las sesiones, así
        // que aquí ya no hay ninguna con la que seguir.
        void this.router.navigate(['/login']);
      },
      error: (error) => {
        // El enlace caducado no es un fallo del formulario —volver a escribir la contraseña
        // no lo arregla—, así que se lleva la pantalla entera y ofrece pedir otro.
        if (errorCode(error) === 'INVALID_ACCOUNT_TOKEN') {
          this.expired.set(true);
        } else {
          this.error.set(describeError(error));
        }
        this.loading.set(false);
      },
    });
  }
}
