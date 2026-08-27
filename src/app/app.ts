import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { ThemeService } from './core/theme.service';
import { ToastService } from './core/toast.service';
import { TransactionEditorService } from './core/transaction-editor.service';
import { TransactionEditorComponent } from './shared/ui/transaction-editor';

/** Destino de la navegación principal, con el icono que lo representa en la barra. */
interface NavItem {
  path: string;
  label: string;
  icon: string;
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
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TransactionEditorComponent],
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

  // La barra inferior solo tiene cinco huecos y el catálogo son dos pantallas, así que
  // entra la principal —las categorías, que son las que reparten el gasto— y los tags se
  // alcanzan desde ella con el conmutador que llevan ambas arriba.
  protected readonly rightNav: NavItem[] = [
    { path: '/categories', label: 'Categorías', icon: 'bi-grid-1x2' },
    { path: '/account', label: 'Cuenta', icon: 'bi-person' },
  ];

  protected readonly allNav = [...this.leftNav, ...this.rightNav];

  protected dismissToast(id: number): void {
    this.toastService.dismiss(id);
  }

  protected toggleTheme(): void {
    this.theme.toggle();
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
