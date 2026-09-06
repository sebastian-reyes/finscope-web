import { DestroyRef, Injectable, inject, signal } from '@angular/core';

/**
 * Si hay red o no.
 *
 * Existe por lo que trajo la caché sin conexión: desde que el trabajador de servicio sirve
 * la última copia de la API cuando la red falla, las pantallas siguen enseñando cifras que
 * pueden ser de hace días. Sin este aviso, un saldo viejo se leería como el de ahora, que en
 * una aplicación de dinero es la peor forma de equivocarse.
 *
 * `navigator.onLine` solo sabe si hay interfaz de red, no si el servidor contesta: puede
 * decir que sí estando conectado a un wifi sin salida. Vale igualmente, porque de los dos
 * errores posibles comete el inofensivo —callarse teniendo que avisar— y nunca el contrario:
 * cuando dice que no hay red, no la hay.
 */
@Injectable({ providedIn: 'root' })
export class ConnectionService {
  private readonly onlineSignal = signal(navigator.onLine);

  /** Si el navegador cree que hay salida a la red. */
  readonly online = this.onlineSignal.asReadonly();

  constructor() {
    const goOnline = () => this.onlineSignal.set(true);
    const goOffline = () => this.onlineSignal.set(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    });
  }
}
