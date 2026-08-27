import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ThemeService } from '../../core/theme.service';
import { describeError } from '../../core/api-error';
import { SegmentedDirective } from '../../shared/ui/segmented';

/** Longitud mínima que exige el contrato para la contraseña. */
const MIN_PASSWORD = 8;

/** Máximo que impone BCrypt: a partir de ahí ignora los caracteres. */
const MAX_PASSWORD = 72;

/**
 * Punto de entrada de la aplicación: permite crear una cuenta o iniciar sesión.
 *
 * El alta y el acceso comparten pantalla porque la API devuelve credenciales en ambos
 * casos, de modo que registrarse deja al usuario dentro sin un segundo paso. Los dos
 * comparten también los campos, así que se alternan con un control segmentado en vez de
 * con dos rutas: cambiar de idea no debería costar una navegación.
 *
 * La validación se hace aquí y no solo en el servidor porque un correo mal escrito o una
 * contraseña corta no merecen un viaje de ida y vuelta para enterarse.
 */
@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, SegmentedDirective],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly theme = inject(ThemeService);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly mode = signal<'login' | 'register'>('login');
  protected readonly loading = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly showPassword = signal(false);
  protected readonly expired = signal(this.route.snapshot.queryParamMap.get('expired') === 'true');
  protected readonly resolvedTheme = this.theme.resolved;

  protected readonly minPassword = MIN_PASSWORD;

  protected readonly form = this.formBuilder.nonNullable.group({
    email: ['', [Validators.required, Validators.email, Validators.maxLength(255)]],
    password: [
      '',
      [Validators.required, Validators.minLength(MIN_PASSWORD), Validators.maxLength(MAX_PASSWORD)],
    ],
    displayName: ['', Validators.maxLength(70)],
  });

  protected readonly isRegister = computed(() => this.mode() === 'register');

  protected toggleTheme(): void {
    this.theme.toggle();
  }

  /**
   * Cambia entre entrar y registrarse conservando lo ya escrito.
   * Quien se equivoca de pestaña no debería tener que volver a teclear su correo.
   *
   * @param mode modo al que se cambia
   */
  protected switchTo(mode: 'login' | 'register'): void {
    this.mode.set(mode);
    this.error.set(null);
  }

  /**
   * Decide si un campo debe enseñar su error.
   *
   * @param field nombre del campo
   * @return si el campo está tocado y no es válido
   */
  protected invalid(field: 'email' | 'password' | 'displayName'): boolean {
    const control = this.form.controls[field];
    return control.touched && control.invalid;
  }

  protected submit(): void {
    if (this.loading()) {
      return;
    }
    // El nombre a mostrar solo cuenta al registrarse, así que su validez no bloquea el
    // acceso de quien solo quiere entrar.
    const invalid = this.form.controls.email.invalid || this.form.controls.password.invalid;
    if (invalid || (this.isRegister() && this.form.controls.displayName.invalid)) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.expired.set(false);

    const { email, password, displayName } = this.form.getRawValue();
    const request$ = this.isRegister()
      ? this.auth.register({
          email: email.trim(),
          password,
          displayName: displayName.trim() || undefined,
        })
      : this.auth.login({ email: email.trim(), password });

    request$.subscribe({
      next: () => this.router.navigate(['/dashboard']),
      error: (error) => {
        this.error.set(describeError(error));
        this.loading.set(false);
      },
    });
  }
}
