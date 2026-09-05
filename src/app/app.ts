import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AppUpdateService } from './core/app-update.service';
import { AuthService } from './core/auth.service';
import { ThemeService } from './core/theme.service';
import { ToastService } from './core/toast.service';
import { TransactionEditorService } from './core/transaction-editor.service';
import { SegmentedDirective } from './shared/ui/segmented';
import { SlideOutletDirective } from './shared/ui/slide-outlet';
import { TransactionEditorComponent } from './shared/ui/transaction-editor';

/** Destino de la navegación principal, con el icono que lo representa en la barra. */
interface NavItem {
  path: string;
  label: string;
  icon: string;
  /** Otras direcciones que también lo dan por activo, si es que las tiene. */
  covers?: readonly string[];
}

/**
 * Carcasa de la aplicación.
 *
 * La navegación cambia de forma según el sitio: en móvil es una barra inferior al alcance
 * del pulgar y en escritorio una barra superior. El registro de un movimiento no es un
 * destino más, sino el botón central, porque es lo que se viene a hacer a la aplicación.
 * Nada de esto se dibuja sin sesión, para que el acceso quede limpio.
 */
@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet,
    RouterLink,
    SegmentedDirective,
    SlideOutletDirective,
    TransactionEditorComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly theme = inject(ThemeService);
  private readonly toastService = inject(ToastService);

  /** La hoja de registro, que se abre desde el botón central y se dibuja aquí. */
  protected readonly editor = inject(TransactionEditorService);

  /** El vigilante de despliegues, que es quien enciende el aviso de versión nueva. */
  protected readonly update = inject(AppUpdateService);

  protected readonly user = this.auth.user;
  protected readonly isLoggedIn = this.auth.isLoggedIn;
  protected readonly loggingOut = signal(false);
  protected readonly resolvedTheme = this.theme.resolved;
  protected readonly toasts = this.toastService.toasts;

  /** Destinos a la izquierda y a la derecha del botón de registrar. */
  protected readonly leftNav: NavItem[] = [
    { path: '/dashboard', label: 'Inicio', icon: 'bi-house' },
    { path: '/transactions', label: 'Movimientos', icon: 'bi-arrow-left-right' },
  ];

  // La barra inferior solo tiene cinco huecos y por ahí se llega a cuatro pantallas, así
  // que entra la principal —las categorías, que son las que reparten el gasto— y desde ella
  // se alcanzan los presupuestos, los fijos y los tags con el conmutador que llevan las
  // cuatro arriba. A los presupuestos y a los fijos se llega además desde el inicio, que es
  // donde se piensa en ellos.
  protected readonly rightNav: NavItem[] = [
    // Ni los presupuestos, ni los fijos, ni los tags tienen hueco propio, así que se cuentan
    // como parte de las categorías: sin esto, estando en ellos la barra no marcaba ninguna
    // sección y la pastilla se encogía a nada, como si la pantalla no estuviera en ningún
    // sitio.
    {
      path: '/categories',
      label: 'Categorías',
      icon: 'bi-grid-1x2',
      covers: ['/budgets', '/recurring', '/tags'],
    },
    { path: '/account', label: 'Cuenta', icon: 'bi-person' },
  ];

  protected readonly allNav = [...this.leftNav, ...this.rightNav];

  /**
   * Los destinos en el orden en que se leen, para que la pantalla nueva entre por el lado
   * del que viene. Es el orden de la barra, con los tags al lado de las categorías porque
   * comparten sitio en ella y se salta de una a otra con el conmutador.
   */
  protected readonly destinations = [
    '/dashboard',
    '/transactions',
    '/categories',
    '/budgets',
    '/recurring',
    '/tags',
    '/account',
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
   * dirección —las categorías cubren también los tags— y esa directiva solo sabe comparar
   * con la suya.
   *
   * @param item destino de la barra
   * @return si es el que está abierto
   */
  protected isActive(item: NavItem): boolean {
    const url = this.url().split('?')[0];
    return url === item.path || (item.covers?.includes(url) ?? false);
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

  protected logout(): void {
    this.loggingOut.set(true);
    this.auth.logout().subscribe(() => {
      this.loggingOut.set(false);
      this.router.navigate(['/login']);
    });
  }
}
