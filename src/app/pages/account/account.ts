import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth.service';
import { COLOR_PRESETS, PaletteService } from '../../core/palette.service';
import { ThemePreference, ThemeService } from '../../core/theme.service';
import { ToastService } from '../../core/toast.service';
import { describeError } from '../../core/api-error';
import { LogoComponent } from '../../shared/ui/logo';
import { SegmentedDirective } from '../../shared/ui/segmented';

/** Una de las tres formas de elegir el aspecto, con el icono que la representa. */
interface ThemeOption {
  value: ThemePreference;
  label: string;
  icon: string;
}

/** Uno de los dos colores que se pueden elegir, con lo que hay que contar de él. */
interface ColorSlot {
  role: 'primary' | 'secondary';
  label: string;
  /** Qué pinta ese color, para que la elección no sea a ciegas. */
  hint: string;
  /** Lo que se le lee a quien navega con teclado al llegar al selector libre. */
  custom: string;
}

/**
 * Los datos del usuario y el aspecto de la aplicación.
 *
 * Antes esta pantalla era el panel de pruebas de la sesión: enseñaba el token de acceso, el
 * identificador interno, las rutas de la API que consultaba y el catálogo global de tipos de
 * transacción. Nada de eso le sirve a quien usa la aplicación, y el token además no debería
 * estar en pantalla. Queda lo que es del usuario y lo que puede cambiar.
 *
 * La contraseña vive aquí como un botón y no como un campo: se cambia con el mismo enlace
 * que la recupera quien la ha olvidado, que es lo único que ofrece el contrato y, además, lo
 * que impide que una sesión abierta y sin dueño delante valga para quedarse con la cuenta.
 *
 * El correo ya no es un dato de solo lectura, pero sigue sin cambiarse de un tirón: es la
 * credencial con la que se entra, así que se pide la contraseña y la dirección nueva no
 * sustituye a la vieja hasta que se confirma el enlace que llega a ella. Una letra de más al
 * teclear se queda en un enlace que caduca y no en una cuenta a la que ya no se puede entrar.
 */
@Component({
  selector: 'app-account',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LogoComponent, SegmentedDirective],
  templateUrl: './account.html',
  styleUrl: './account.scss',
})
export class AccountPage {
  private readonly auth = inject(AuthService);
  private readonly theme = inject(ThemeService);
  private readonly palette = inject(PaletteService);
  private readonly toasts = inject(ToastService);

  protected readonly user = this.auth.user;
  protected readonly preference = this.theme.preference;
  protected readonly saving = signal(false);

  /** Nombre tal y como se está escribiendo, que solo se guarda al confirmarlo. */
  protected readonly name = signal(this.auth.user()?.displayName ?? '');

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

  /** Los colores en curso, para marcar cuál de los predefinidos está puesto. */
  protected readonly colors = this.palette.colors;

  /** Si sigue la pareja de fábrica: restablecerla solo se ofrece cuando hay algo que deshacer. */
  protected readonly isDefaultPalette = this.palette.isDefault;

  protected readonly presets = COLOR_PRESETS;

  protected readonly slots: ColorSlot[] = [
    {
      role: 'primary',
      label: 'Color principal',
      hint: 'Manda en los botones, en los enlaces y en la sección en la que estás.',
      custom: 'Elegir otro color principal',
    },
    {
      role: 'secondary',
      label: 'Color secundario',
      hint: 'Acompaña al principal en el icono, en el botón de registrar y en la pantalla de acceso.',
      custom: 'Elegir otro color secundario',
    },
  ];

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
    // La sesión guarda el usuario de cuando se entró, y el nombre --- o el estado del correo,
    // que puede haberse verificado desde el móvil --- pueden haber cambiado desde entonces: se
    // vuelve a preguntar y se deja al día la copia, pisando lo escrito solo si nadie escribía.
    this.auth.refreshUser().subscribe({
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

  /** El color puesto ahora en uno de los dos huecos. */
  protected current(role: ColorSlot['role']): string {
    return role === 'primary' ? this.colors().primary : this.colors().secondary;
  }

  /**
   * Cambia uno de los dos colores.
   * Se aplica al momento y sin botón de guardar: es una preferencia de este navegador, se ve
   * el efecto en la propia pantalla mientras se elige, y confirmar algo que ya está puesto
   * delante solo añadiría un paso.
   *
   * @param role cuál de los dos
   * @param hex el color elegido
   */
  protected setColor(role: ColorSlot['role'], hex: string): void {
    this.palette.set(role === 'primary' ? { primary: hex } : { secondary: hex });
  }

  /** Devuelve la aplicación al azul y al verde de siempre. */
  protected resetColors(): void {
    this.palette.reset();
    this.toasts.success('Colores restablecidos');
  }

  /** Devuelve el campo a lo que hay guardado. */
  protected discard(): void {
    this.name.set(this.user()?.displayName ?? '');
  }

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
