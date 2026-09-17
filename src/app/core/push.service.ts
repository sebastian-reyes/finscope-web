import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { SwPush } from '@angular/service-worker';
import {
  Observable,
  catchError,
  finalize,
  firstValueFrom,
  from,
  of,
  switchMap,
  timeout,
} from 'rxjs';
import { AuthService } from './auth.service';
import { FinscopeService } from './finscope.service';
import { PushConfigResponse, PushTestResponse, SavePushSubscriptionRequest } from './models';

/**
 * En qué punto están los avisos en este dispositivo, visto desde lo que hay que enseñar.
 *
 * - `install-required`: iPhone o iPad desde una pestaña de Safari. Allí los avisos solo existen
 *   con la aplicación instalada en la pantalla de inicio, así que lo primero es instalarla.
 * - `unsupported`: el navegador no sabe recibir avisos, o la aplicación corre sin trabajador de
 *   servicio (en desarrollo nunca lo hay).
 * - `loading`: todavía no se sabe si el servidor los tiene configurados.
 * - `unavailable`: el servidor no tiene claves; no hay nada que activar.
 * - `denied`: el usuario los bloqueó. Desde la página ya no se pueden volver a pedir.
 * - `off` / `on`: este dispositivo no está suscrito, o sí.
 */
export type PushStatus =
  'install-required' | 'unsupported' | 'loading' | 'unavailable' | 'denied' | 'off' | 'on';

/**
 * Los avisos al teléfono desde el lado del navegador.
 *
 * El aviso no lo decide la aplicación sino la API: aquí solo se pide el permiso, se entrega la
 * suscripción del navegador y se da de baja. A partir de ahí la API manda cada aviso al servicio
 * de push del navegador y el trabajador de servicio de Angular lo enseña, aunque la aplicación
 * esté cerrada, y al tocarlo abre la pantalla que diga el propio aviso.
 *
 * **La suscripción es del dispositivo, no de la cuenta.** El permiso lo concede el teléfono, y
 * si en el mismo navegador entra otra persona, lo que tiene sentido es que los avisos pasen a
 * ser suyos y no que siga recibiendo los de la anterior. Por eso, cada vez que cambia el usuario
 * y el navegador ya tenía una suscripción, se vuelve a registrar a nombre del que ha entrado; y
 * al cerrar sesión se da de baja.
 *
 * `SwPush` se inyecta como opcional: sin trabajador de servicio —en desarrollo y en las pruebas—
 * no existe, y los avisos simplemente constan como no admitidos.
 */
@Injectable({ providedIn: 'root' })
export class PushService {
  private readonly swPush = inject(SwPush, { optional: true });
  private readonly api = inject(FinscopeService);
  private readonly auth = inject(AuthService);

  /** Si este navegador puede recibir avisos con la aplicación tal y como está abierta. */
  readonly supported =
    !!this.swPush?.isEnabled && typeof Notification !== 'undefined' && hasPushManager();

  /** iPhone o iPad fuera de la aplicación instalada: allí no hay avisos hasta instalarla. */
  readonly installRequired = isAppleMobile() && !isStandalone();

  private readonly config = signal<PushConfigResponse | null>(null);
  private readonly permission = signal<NotificationPermission>(currentPermission());

  /** La suscripción del navegador, que cambia al activar o desactivar desde cualquier pestaña. */
  private readonly subscription = this.swPush
    ? toSignal(this.swPush.subscription, { initialValue: null })
    : signal<PushSubscription | null>(null);

  /** Si se está activando o desactivando, para no dejar pulsar dos veces. */
  readonly busy = signal(false);

  readonly status = computed<PushStatus>(() => {
    if (this.installRequired) {
      return 'install-required';
    }
    if (!this.supported) {
      return 'unsupported';
    }
    const config = this.config();
    if (!config) {
      return 'loading';
    }
    if (!config.enabled) {
      return 'unavailable';
    }
    if (this.permission() === 'denied') {
      return 'denied';
    }
    return this.subscription() ? 'on' : 'off';
  });

  /** Última combinación de usuario y dispositivo registrada, para no repetirla. */
  private synced: string | null = null;

  constructor() {
    if (!this.supported) {
      return;
    }

    // La configuración se pide al entrar y no antes: el endpoint exige sesión.
    effect(() => {
      if (this.auth.user() && !untracked(this.config)) {
        untracked(() => this.loadConfig());
      }
    });

    // Registra la suscripción que ya tuviera el navegador a nombre de quien ha entrado.
    effect(() => {
      const userId = this.auth.user()?.id;
      const subscription = this.subscription();
      const config = this.config();
      if (!userId || !subscription || !config?.enabled || !config.publicKey) {
        return;
      }
      const key = `${userId}|${subscription.endpoint}`;
      if (this.synced === key) {
        return;
      }
      this.synced = key;
      untracked(() => this.sync(subscription, config.publicKey!));
    });
  }

  /**
   * Pide el permiso y suscribe este dispositivo.
   * Tiene que llamarse desde un toque del usuario: Safari rechaza pedir el permiso de otro modo.
   */
  async enable(): Promise<void> {
    const publicKey = this.config()?.publicKey;
    if (!this.swPush || !publicKey || this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      const subscription = await this.swPush.requestSubscription({ serverPublicKey: publicKey });
      await firstValueFrom(this.api.savePushSubscription(toRequest(subscription)));
      this.synced = `${this.auth.user()?.id}|${subscription.endpoint}`;
    } finally {
      this.permission.set(currentPermission());
      this.busy.set(false);
    }
  }

  /**
   * Da de baja este dispositivo, en la API y en el navegador.
   * Si la API no contesta se da de baja igualmente en el navegador: el siguiente aviso que le
   * mande a esa dirección recibirá un 410, y la API la borrará por su cuenta.
   */
  async disable(): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      await firstValueFrom(this.release());
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Da de baja este dispositivo antes de cerrar sesión.
   * Nunca falla ni tarda más de unos segundos: salir no puede quedarse colgado de un aviso.
   */
  release(): Observable<void> {
    const subscription = this.subscription();
    if (!this.swPush || !subscription) {
      return of(undefined);
    }
    this.synced = null;
    return this.api.deletePushSubscription(subscription.endpoint).pipe(
      timeout(4000),
      catchError(() => of(undefined)),
      switchMap(() => from(this.swPush!.unsubscribe()).pipe(catchError(() => of(undefined)))),
      switchMap(() => of(undefined)),
      finalize(() => this.permission.set(currentPermission())),
    );
  }

  /** Manda un aviso de prueba a todos los dispositivos de la cuenta. */
  sendTest(): Observable<PushTestResponse> {
    return this.api.sendTestNotification();
  }

  private loadConfig(): void {
    this.api.getPushConfig().subscribe({
      next: (config) => this.config.set(config),
      error: () => this.config.set({ enabled: false }),
    });
  }

  /**
   * Vuelve a registrar una suscripción existente.
   * Si se creó con otra clave pública —el servidor cambió sus claves— ya no sirve: los envíos
   * firmados con la nueva serían rechazados. Entonces se da de baja y el dispositivo queda
   * apagado, para que el usuario vea que tiene que volver a activarlos.
   */
  private sync(subscription: PushSubscription, publicKey: string): void {
    const serverKey = subscription.options?.applicationServerKey;
    if (serverKey && base64Url(serverKey) !== publicKey) {
      void this.swPush?.unsubscribe().catch(() => undefined);
      return;
    }
    this.api.savePushSubscription(toRequest(subscription)).subscribe({
      error: () => (this.synced = null),
    });
  }
}

function toRequest(subscription: PushSubscription): SavePushSubscriptionRequest {
  const json = subscription.toJSON();
  return {
    endpoint: subscription.endpoint,
    keys: { p256dh: json.keys?.['p256dh'] ?? '', auth: json.keys?.['auth'] ?? '' },
  };
}

function base64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((byte) => (binary += String.fromCharCode(byte)));
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function currentPermission(): NotificationPermission {
  return typeof Notification === 'undefined' ? 'default' : Notification.permission;
}

function hasPushManager(): boolean {
  return typeof window !== 'undefined' && 'PushManager' in window;
}

/** iPhone, iPad o un iPad que se presenta como Mac, que es lo que hacen desde iPadOS 13. */
function isAppleMobile(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/** Si la aplicación está abierta como instalada, sin la interfaz del navegador. */
function isStandalone(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia?.('(display-mode: standalone)').matches === true;
}
