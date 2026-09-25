import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { switchMap } from 'rxjs';
import { AuthService } from './auth.service';
import { PushService } from './push.service';

/**
 * Cierre de sesión completo: baja de avisos, fin de la sesión y vuelta al acceso.
 *
 * Vive aparte porque se sale desde dos sitios —la barra de arriba en escritorio y la fila de
 * la configuración, que es la única salida en el teléfono— y los dos tienen que hacer lo
 * mismo y en el mismo orden.
 */
@Injectable({ providedIn: 'root' })
export class SignOutService {
  private readonly auth = inject(AuthService);
  private readonly push = inject(PushService);
  private readonly router = inject(Router);

  /** Si ya se está saliendo, para que un segundo toque no lance otra baja. */
  readonly busy = signal(false);

  /**
   * Cierra la sesión dando de baja antes este dispositivo de los avisos.
   * Va primero porque la baja necesita la sesión que se está cerrando; si no, la siguiente
   * persona que usara este navegador recibiría los avisos de la cuenta anterior.
   */
  signOut(): void {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    this.push
      .release()
      .pipe(switchMap(() => this.auth.logout()))
      .subscribe(() => {
        this.busy.set(false);
        this.router.navigate(['/login']);
      });
  }
}
