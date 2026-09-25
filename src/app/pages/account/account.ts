import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../../core/auth.service';
import { OnboardingService } from '../../core/onboarding.service';
import { PushService } from '../../core/push.service';
import { RefreshService } from '../../core/refresh.service';
import { SignOutService } from '../../core/sign-out.service';
import { ThemeService } from '../../core/theme.service';
import { ToastService } from '../../core/toast.service';
import { describeError } from '../../core/api-error';
import { mediaQuery } from '../../core/viewport';
import { CatalogueTabsComponent } from '../../shared/ui/catalogue-tabs';
import { SlideOutletDirective } from '../../shared/ui/slide-outlet';
import { ACCOUNT_SECTIONS, AccountSection, SECTIONS, sectionOf } from './sections';
import { THEME_OPTIONS } from './theme-options';

/**
 * La configuración: quién eres arriba y, debajo, un menú con lo que se puede cambiar.
 *
 * Antes esta pantalla lo tenía todo a la vista —nombre, correo, contraseña, avisos, tema,
 * colores y recorrido—, y en el teléfono era una columna de cinco pantallas de alto. Ahora
 * cada cosa es una pantalla hija, y el menú solo dice qué hay y cómo está: el tema elegido,
 * si los avisos están activos, si falta confirmar el correo.
 *
 * En el teléfono el menú y la pantalla hija se turnan, como en los ajustes del sistema. En
 * escritorio sobra el ancho para los dos, así que el menú se queda a la izquierda y la hija
 * se abre a su lado; ahí el menú sin nada abierto sería media pantalla vacía, de modo que
 * entrar a `/account` abre directamente los datos.
 *
 * Esta pantalla es también la que vuelve a preguntar quién es el usuario: el nombre, el correo
 * y su estado se enseñan en la tarjeta de arriba y los usan dos de las hijas.
 */
@Component({
  selector: 'app-account',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CatalogueTabsComponent,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    SlideOutletDirective,
  ],
  templateUrl: './account.html',
  styleUrl: './account.scss',
})
export class AccountPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  private readonly theme = inject(ThemeService);
  private readonly push = inject(PushService);
  private readonly onboarding = inject(OnboardingService);
  private readonly session = inject(SignOutService);

  protected readonly user = this.auth.user;
  protected readonly signingOut = this.session.busy;

  /** Si se está volviendo a preguntar quién es el usuario, que es lo que se recarga aquí. */
  protected readonly refreshing = signal(false);

  /** Los datos se abren desde la tarjeta de arriba; el resto, desde el menú. */
  protected readonly menu = SECTIONS.filter((section) => section.slug !== 'profile');

  /** El orden de las pantallas hijas, para que la nueva entre por el lado que le toca. */
  protected readonly destinations = ['/account', ...ACCOUNT_SECTIONS];

  /** Si hay sitio para el menú y la pantalla hija a la vez. */
  private readonly wide = mediaQuery('(min-width: 992px)');

  /** Dirección en curso, que es la que dice qué pantalla hija está abierta. */
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /** La pantalla hija abierta, o nula si solo se ve el menú. */
  protected readonly section = computed<AccountSection | null>(() => sectionOf(this.url()));

  /**
   * Si el menú acaba de volver a verse al cerrar una hija en el teléfono.
   * Entra deslizándose desde la izquierda, como hace cualquier pantalla al volver atrás.
   */
  protected readonly returned = signal(false);

  /** Iniciales del avatar: las del nombre, o la primera letra del correo si no lo hay. */
  protected readonly initials = computed(() => {
    const user = this.user();
    const name = user?.displayName?.trim();
    if (name) {
      return name
        .split(/\s+/)
        .slice(0, 2)
        .map((word) => word[0])
        .join('')
        .toUpperCase();
    }
    return (user?.email?.[0] ?? '?').toUpperCase();
  });

  /** Lo que se lee al lado de cada fila del menú: cómo está eso ahora. */
  protected readonly status = computed<Record<string, string>>(() => ({
    notifications: this.pushLabel(),
    security: this.user()?.emailVerified === true ? '' : 'Sin verificar',
    appearance:
      THEME_OPTIONS.find((option) => option.value === this.theme.preference())?.label ?? '',
  }));

  /** Filas cuyo estado pide atención y no solo informa. */
  protected readonly warns = computed<Record<string, boolean>>(() => ({
    security: this.user()?.emailVerified !== true,
    notifications: this.push.status() === 'denied',
  }));

  constructor() {
    this.reload();

    let previous = this.section();
    effect(() => {
      const current = this.section();
      if (previous && !current && !this.wide()) {
        this.returned.set(true);
      }
      previous = current;

      // En escritorio el menú solo no se queda: se abren los datos a su lado. Solo desde
      // `/account` exacto, porque este mismo efecto ve la dirección de salida cuando se va a
      // otra sección y no debe traer de vuelta.
      if (this.wide() && !current && this.url().split('?')[0] === '/account') {
        this.router.navigate(['/account', 'profile'], { replaceUrl: true });
      }
    });

    // Arrastrar hacia abajo vuelve a preguntar quién es el usuario, que es lo único que esta
    // pantalla enseña de la API. Es justo lo que hace falta tras confirmar el correo desde el
    // buzón: el distintivo de «sin verificar» se cae solo en cuanto se recarga.
    inject(DestroyRef).onDestroy(
      inject(RefreshService).register(() => this.reload(), this.refreshing),
    );
  }

  /** Vuelve a abrir el recorrido de bienvenida, que solo se abre solo al crear la cuenta. */
  protected replayOnboarding(): void {
    this.onboarding.replay();
  }

  protected signOut(): void {
    this.session.signOut();
  }

  /**
   * Quita la marca de la entrada al terminar, para que la próxima vuelta la vuelva a poner.
   * Solo la del propio menú: las animaciones de dentro también suben hasta aquí.
   *
   * @param event final de una animación del menú o de algo suyo
   */
  protected onMenuAnimationEnd(event: AnimationEvent): void {
    if (event.target === event.currentTarget) {
      this.returned.set(false);
    }
  }

  /** El estado de los avisos en este dispositivo, dicho en una palabra. */
  private pushLabel(): string {
    switch (this.push.status()) {
      case 'on':
        return 'Activadas';
      case 'off':
        return 'Desactivadas';
      case 'denied':
        return 'Bloqueadas';
      case 'install-required':
        return 'Instala la app';
      default:
        return '';
    }
  }

  /**
   * Vuelve a preguntar quién es el usuario y deja al día la copia de la sesión.
   *
   * La sesión guarda el usuario de cuando se entró, y el nombre --- o el estado del correo,
   * que puede haberse confirmado desde otro sitio --- pueden haber cambiado desde entonces.
   */
  private reload(): void {
    this.refreshing.set(true);
    this.auth.refreshUser().subscribe({
      next: () => this.refreshing.set(false),
      error: (error) => {
        this.refreshing.set(false);
        this.toasts.error(describeError(error));
      },
    });
  }
}
