import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { describeError } from '../../core/api-error';
import { LogoComponent } from '../../shared/ui/logo';

/**
 * Pedir el enlace con el que elegir una contraseña nueva.
 *
 * La pantalla dice lo mismo tanto si el correo tiene cuenta como si no, y no porque la API
 * no lo sepa: lo sabe y calla a propósito. Contestar «ese correo no existe» convertiría este
 * formulario en una forma de averiguar quién está registrado, que es la mitad del trabajo de
 * quien luego prueba contraseñas.
 */
@Component({
  selector: 'app-forgot-password',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, LogoComponent],
  templateUrl: './forgot-password.html',
})
export class ForgotPasswordPage {
  private readonly auth = inject(AuthService);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);

  /** La dirección a la que se ha mandado, que es lo que se enseña al terminar. */
  protected readonly sentTo = signal<string | null>(null);

  protected readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
  });

  protected get invalidEmail(): boolean {
    const control = this.form.controls.email;
    return control.touched && control.invalid;
  }

  protected submit(): void {
    if (this.loading()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    const email = this.form.controls.email.value.trim();
    this.auth.requestPasswordReset(email).subscribe({
      next: () => {
        this.sentTo.set(email);
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(describeError(error));
        this.loading.set(false);
      },
    });
  }
}
