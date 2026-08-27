import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { ThemePreference, ThemeService } from '../../core/theme.service';
import { ToastService } from '../../core/toast.service';
import { describeError } from '../../core/api-error';
import { SegmentedDirective } from '../../shared/ui/segmented';

/** Una de las tres formas de elegir el aspecto, con el icono que la representa. */
interface ThemeOption {
  value: ThemePreference;
  label: string;
  icon: string;
}

/**
 * Los datos del usuario y el aspecto de la aplicación.
 *
 * Antes esta pantalla era el panel de pruebas de la sesión: enseñaba el token de acceso, el
 * identificador interno, las rutas de la API que consultaba y el catálogo global de tipos de
 * transacción. Nada de eso le sirve a quien usa la aplicación, y el token además no debería
 * estar en pantalla. Queda lo que es del usuario y lo que puede cambiar.
 *
 * El correo se enseña pero no se toca: es la credencial con la que se entra, y cambiarlo
 * obligaría a rehacer la identidad local y a reemitir las credenciales.
 */
@Component({
  selector: 'app-account',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SegmentedDirective],
  templateUrl: './account.html',
  styleUrl: './account.scss',
})
export class AccountPage {
  private readonly auth = inject(AuthService);
  private readonly theme = inject(ThemeService);
  private readonly toasts = inject(ToastService);

  protected readonly user = this.auth.user;
  protected readonly preference = this.theme.preference;
  protected readonly saving = signal(false);

  /** Nombre tal y como se está escribiendo, que solo se guarda al confirmarlo. */
  protected readonly name = signal(this.auth.user()?.displayName ?? '');

  protected readonly themes: ThemeOption[] = [
    { value: 'light', label: 'Claro', icon: 'bi-sun' },
    { value: 'dark', label: 'Oscuro', icon: 'bi-moon-stars' },
    // «Sistema» y no «El del sistema»: las tres opciones con su icono tienen que caber en
    // una línea, porque la pastilla que se desliza por el control se coloca suponiendo una.
    { value: 'system', label: 'Sistema', icon: 'bi-circle-half' },
  ];

  /** Si lo escrito difiere de lo guardado: es lo único que merece ofrecer guardar. */
  protected readonly changed = computed(
    () => this.name().trim() !== (this.user()?.displayName ?? ''),
  );

  constructor() {
    // La sesión guarda el usuario de cuando se entró, y el nombre puede haber cambiado
    // desde otro dispositivo: se vuelve a preguntar, y solo se pisa lo escrito si nadie
    // estaba escribiendo.
    this.auth.me().subscribe({
      next: (user) => {
        if (!this.changed()) {
          this.name.set(user.displayName ?? '');
        }
      },
      error: (error) => this.toasts.error(describeError(error)),
    });
  }

  /**
   * Recoge el envío del formulario nativo.
   * Se usa el suceso del navegador y no `ngSubmit` para no arrastrar el módulo de
   * formularios por un solo campo, así que frenar la navegación toca aquí.
   *
   * @param event envío del formulario
   */
  protected onSubmit(event: Event): void {
    event.preventDefault();
    this.save();
  }

  protected setTheme(preference: ThemePreference): void {
    this.theme.set(preference);
  }

  /** Devuelve el campo a lo que hay guardado. */
  protected discard(): void {
    this.name.set(this.user()?.displayName ?? '');
  }

  protected save(): void {
    if (this.saving() || !this.changed()) {
      return;
    }
    this.saving.set(true);
    // Se manda recortado, que es como va a quedar guardado: así lo que se ve en el campo
    // tras guardar es exactamente lo que hay en la base de datos.
    this.auth.updateProfile({ displayName: this.name().trim() }).subscribe({
      next: (user) => {
        this.name.set(user.displayName ?? '');
        this.saving.set(false);
        this.toasts.success(user.displayName ? 'Nombre actualizado' : 'Nombre quitado');
      },
      error: (error) => {
        this.toasts.error(describeError(error));
        this.saving.set(false);
      },
    });
  }
}
