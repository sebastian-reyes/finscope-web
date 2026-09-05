import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs';

/**
 * Cada cuánto se vuelve a preguntar si hay una versión nueva.
 *
 * El trabajador de servicio solo mira el manifiesto al arrancar, y una aplicación instalada
 * en la pantalla de inicio puede pasar días sin cerrarse: sin esta ronda, un despliegue no
 * llegaría hasta que el sistema decidiera matar la pestaña.
 */
const CHECK_EVERY_MS = 15 * 60 * 1000;

/**
 * Vigilante de despliegues.
 *
 * El trabajador de servicio sirve lo que tiene cacheado y descarga la versión nueva por
 * detrás, pero no la pone en marcha él solo: la pestaña abierta se queda en la versión con
 * la que arrancó hasta que alguien recarga —y recargar tampoco basta si la descarga aún no
 * ha terminado—. Ese es el motivo de que, tras desplegar, la web siga enseñando lo anterior.
 *
 * Aquí se cierra ese hueco: se pregunta por versiones nuevas al abrir, cada cuarto de hora
 * y cada vez que se vuelve a la aplicación, y cuando hay una lista se avisa. La recarga no
 * se hace sola a propósito: puede haber una hoja de registro a medio rellenar, y perderla
 * por un despliegue sería peor que ver la versión de antes un minuto más.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdateService {
  private readonly updates = inject(SwUpdate);

  /** Si hay una versión nueva ya descargada, esperando solo a que se recargue. */
  readonly ready = signal(false);

  /** Mientras se aplica, para que el botón no se pueda pulsar dos veces. */
  readonly applying = signal(false);

  constructor() {
    // En desarrollo no hay trabajador de servicio registrado, así que no hay nada que
    // vigilar y `checkForUpdate()` lanzaría en cada ronda.
    if (!this.updates.isEnabled) {
      return;
    }

    this.updates.versionUpdates
      .pipe(
        filter((event): event is VersionReadyEvent => event.type === 'VERSION_READY'),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.ready.set(true));

    // La caché puede quedar en un estado del que el trabajador no sabe salir —ficheros que
    // ya no existen en el servidor tras varios despliegues seguidos—. Ahí no hay nada que
    // preguntar al usuario: sin recargar, la aplicación no vuelve a funcionar.
    this.updates.unrecoverable.pipe(takeUntilDestroyed()).subscribe(() => this.reload());

    void this.check();
    const timer = setInterval(() => void this.check(), CHECK_EVERY_MS);
    // Volver a la aplicación es el momento en que más se nota un despliegue: es cuando se
    // ha dejado el teléfono un rato y se retoma.
    const onVisible = () => void this.check();
    document.addEventListener('visibilitychange', onVisible);

    inject(DestroyRef).onDestroy(() => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    });
  }

  /**
   * Pone en marcha la versión descargada y recarga con ella.
   * La recarga va en `finally` porque, si activar falla, la página cargada de cero acaba
   * igualmente en la versión buena: lo que no puede es quedarse a medias.
   */
  async apply(): Promise<void> {
    if (this.applying()) {
      return;
    }
    this.applying.set(true);
    try {
      await this.updates.activateUpdate();
    } finally {
      this.reload();
    }
  }

  /**
   * Recarga la página.
   * Sale aparte porque `location` no se puede sustituir en una prueba —el navegador no deja
   * tocarlo—, y así se puede comprobar que se recarga sin navegar de verdad.
   */
  private reload(): void {
    location.reload();
  }

  /** Pregunta por una versión nueva, salvo que ya haya una esperando o no se esté mirando. */
  private async check(): Promise<void> {
    if (this.ready() || document.visibilityState !== 'visible') {
      return;
    }
    try {
      await this.updates.checkForUpdate();
    } catch {
      // Sin red no hay nada que comprobar; en la siguiente ronda se vuelve a intentar.
    }
  }
}
