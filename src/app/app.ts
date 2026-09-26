import { Component, DestroyRef, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AppUpdateService } from './core/app-update.service';
import { AuthService } from './core/auth.service';
import { ConnectionService } from './core/connection.service';
import { OnboardingService } from './core/onboarding.service';
import { PaletteService } from './core/palette.service';
import { SignOutService } from './core/sign-out.service';
import { ThemeService } from './core/theme.service';
import { ToastService } from './core/toast.service';
import { TransactionEditorService } from './core/transaction-editor.service';
import { AvatarComponent } from './shared/ui/avatar';
import { LogoComponent } from './shared/ui/logo';
import { OnboardingComponent, OnboardingExit } from './shared/ui/onboarding';
import { PullRefreshComponent } from './shared/ui/pull-refresh';
import { SegmentedDirective } from './shared/ui/segmented';
import { SlideOutletDirective } from './shared/ui/slide-outlet';
import { TransactionEditorComponent } from './shared/ui/transaction-editor';
import { ACCOUNT_SECTIONS, SECTIONS } from './pages/account/sections';

/**
 * Lo que puede envejecer la copia del usuario antes de volver a preguntarla al recuperar el
 * foco. Medio minuto: lo justo para no repetir la petición al saltar entre aplicaciones, y
 * poco para quien vuelve de confirmar su correo.
 */
const USER_MAX_AGE = 30_000;

/** Destino de la navegación principal, con el icono que lo representa en la barra. */
interface NavItem {
  path: string;
  label: string;
  icon: string;
  /** Otras direcciones que también lo dan por activo, si es que las tiene. */
  covers?: readonly string[];
}

/** Grupo del menú lateral: una fila que despliega sus pantallas debajo. */
interface NavGroup {
  /** Adónde lleva la fila del grupo: su primera pantalla. */
  path: string;
  label: string;
  icon: string;
  children: readonly NavItem[];
}

/**
 * Carcasa de la aplicación.
 *
 * La navegación cambia de forma según el sitio: en móvil es una barra inferior al alcance
 * del pulgar y en escritorio un menú lateral. El registro de un movimiento no es un
 * destino más, sino el botón central, porque es lo que se viene a hacer a la aplicación.
 * Nada de esto se dibuja sin sesión, para que el acceso quede limpio.
 */
@Component({
  selector: 'app-root',
  imports: [
    AvatarComponent,
    RouterOutlet,
    RouterLink,
    LogoComponent,
    SegmentedDirective,
    SlideOutletDirective,
    TransactionEditorComponent,
    PullRefreshComponent,
    OnboardingComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly theme = inject(ThemeService);
  private readonly toastService = inject(ToastService);
  private readonly session = inject(SignOutService);

  // La paleta no se consulta desde aquí, pero es la carcasa quien tiene que despertarla: es
  // lo primero que se instancia, y hasta que no existe no hay colores escritos en el
  // documento ni icono de pestaña reteñido.
  private readonly palette = inject(PaletteService);

  /** La hoja de registro, que se abre desde el botón central y se dibuja aquí. */
  protected readonly editor = inject(TransactionEditorService);

  /** El recorrido de bienvenida, que se abre solo tras crear la cuenta. */
  protected readonly onboarding = inject(OnboardingService);

  /** El vigilante de despliegues, que es quien enciende el aviso de versión nueva. */
  protected readonly update = inject(AppUpdateService);

  /** Si hay red. Sin ella, lo que se ve puede venir de la copia del trabajador de servicio,
   *  y eso hay que decirlo antes de que alguien tome una decisión con una cifra vieja. */
  protected readonly online = inject(ConnectionService).online;

  protected readonly user = this.auth.user;
  protected readonly isLoggedIn = this.auth.isLoggedIn;
  protected readonly loggingOut = this.session.busy;

  /** Cuándo se preguntó por última vez quién es el usuario. */
  private lastUserCheck = Date.now();
  protected readonly resolvedTheme = this.theme.resolved;
  protected readonly toasts = this.toastService.toasts;

  /** Destinos a la izquierda y a la derecha del botón de registrar. */
  protected readonly leftNav: NavItem[] = [
    { path: '/dashboard', label: 'Inicio', icon: 'bi-house' },
    { path: '/transactions', label: 'Movimientos', icon: 'bi-arrow-left-right' },
  ];

  // A la derecha, el plan del mes y la cuenta. El plan son los presupuestos y los fijos, que
  // se miran cada mes; las categorías y los tags, que se configuran una vez, están dentro de
  // la configuración y no se llevan un hueco de la barra.
  protected readonly rightNav: NavItem[] = [
    // Los fijos no tienen hueco propio: comparten el del plan, y sin contarlos aquí la barra
    // no marcaba ninguna sección estando en ellos.
    {
      path: '/budgets',
      label: 'Plan',
      icon: 'bi-clipboard-check',
      covers: ['/recurring'],
    },
    // La configuración es un menú con sus pantallas debajo, y en todas ellas se sigue
    // estando en la cuenta.
    {
      path: '/account',
      label: 'Perfil',
      icon: 'bi-person',
      covers: ACCOUNT_SECTIONS,
    },
  ];

  /**
   * Los destinos del menú lateral de escritorio.
   *
   * Los mismos cuatro huecos que la barra inferior, para que la aplicación se ordene igual en
   * el teléfono y en el ordenador. La diferencia es que aquí hay sitio para enseñar lo que hay
   * dentro de cada grupo, así que el plan y la configuración despliegan sus pantallas debajo.
   */
  protected readonly sideNav: (NavItem | NavGroup)[] = [
    ...this.leftNav,
    {
      path: '/budgets',
      label: 'Plan',
      icon: 'bi-clipboard-check',
      children: [
        { path: '/budgets', label: 'Presupuestos', icon: 'bi-clipboard-check' },
        { path: '/recurring', label: 'Fijos', icon: 'bi-arrow-repeat' },
      ],
    },
    {
      path: '/account',
      label: 'Configuración',
      icon: 'bi-gear',
      children: SECTIONS.map((section) => ({
        path: section.tabs?.[0].path ?? `/account/${section.slug}`,
        label: section.title,
        icon: section.icon,
        covers: section.tabs?.map((tab) => tab.path),
      })),
    },
  ];

  /**
   * Si un grupo del menú lateral contiene la pantalla abierta, que es cuando se despliega.
   *
   * @param group grupo del menú
   * @return si alguna de sus pantallas está abierta, o su propia dirección
   */
  protected isGroupActive(group: NavGroup): boolean {
    return this.url().split('?')[0] === group.path || group.children.some((c) => this.isActive(c));
  }

  /** El destino como grupo, o nulo si es una fila suelta. Para distinguirlos en la plantilla. */
  protected asGroup(item: NavItem | NavGroup): NavGroup | null {
    return 'children' in item ? item : null;
  }

  /**
   * Los destinos en el orden en que se leen, para que la pantalla nueva entre por el lado
   * del que viene. Es el orden de la barra, con los fijos al lado de los presupuestos porque
   * comparten sitio en ella y se salta de uno a otro con el conmutador.
   */
  protected readonly destinations = [
    '/dashboard',
    '/transactions',
    '/budgets',
    '/recurring',
    '/account',
    ...ACCOUNT_SECTIONS,
  ];

  /** Dirección en curso, que es la que decide qué destino está marcado. */
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /**
   * Si un destino es el que se está mirando.
   *
   * Se decide aquí y no con `routerLinkActive` porque un destino puede cubrir más de una
   * dirección —el plan cubre también los fijos— y esa directiva solo sabe comparar
   * con la suya.
   *
   * @param item destino de la barra
   * @return si es el que está abierto
   */
  protected isActive(item: NavItem): boolean {
    const url = this.url().split('?')[0];
    return url === item.path || (item.covers?.includes(url) ?? false);
  }

  constructor() {
    // Volver a la aplicación después de haber estado fuera tiene que traer al día quién es el
    // usuario. El caso que lo pide es el correo: el enlace se pulsa en el buzón —otra
    // aplicación, casi siempre otra ventana—, y al volver aquí el aviso de «te falta confirmar
    // tu correo» seguía puesto hasta que algo preguntara de nuevo. Es una sola petición, y
    // solo si de verdad se estuvo fuera un rato.
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || !this.isLoggedIn()) {
        return;
      }
      if (Date.now() - this.lastUserCheck < USER_MAX_AGE) {
        return;
      }
      this.lastUserCheck = Date.now();
      this.auth.refreshUser().subscribe({ error: () => undefined });
    };
    document.addEventListener('visibilitychange', onVisible);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('visibilitychange', onVisible));
  }

  protected dismissToast(id: number): void {
    this.toastService.dismiss(id);
  }

  protected toggleTheme(): void {
    this.theme.toggle();
  }

  /** Recarga con la versión recién desplegada, que es lo que pide el aviso. */
  protected applyUpdate(): void {
    void this.update.apply();
  }

  /**
   * Abre la hoja de registro sobre la pantalla en la que se esté.
   *
   * Antes esto llevaba al dashboard y dejaba el foco en su formulario, que obligaba a
   * cambiar de pantalla para apuntar un gasto —y a volver luego a donde se estaba—. La
   * hoja es la misma que abre un movimiento del historial, así que registrar y corregir
   * se hacen en el mismo sitio y con el mismo formulario.
   */
  protected openEditor(): void {
    this.editor.openCreate();
  }

  /**
   * Cierra el recorrido de bienvenida y, si se pidió desde su último paso, abre la hoja de
   * registro: es la forma de que lo primero que se haga después de verlo sea apuntar algo.
   *
   * @param exit cómo se ha salido del recorrido
   */
  protected closeOnboarding(exit: OnboardingExit): void {
    this.onboarding.finish();
    if (exit === 'record') {
      this.editor.openCreate();
    }
  }

  protected logout(): void {
    this.session.signOut();
  }
}
