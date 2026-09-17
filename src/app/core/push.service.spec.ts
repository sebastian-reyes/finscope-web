import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SwPush } from '@angular/service-worker';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PushService } from './push.service';

const PUBLIC_KEY = 'BPublicaDelServidor';

/** Una suscripción como la que entrega el navegador, con lo justo para la aplicación. */
function browserSubscription(endpoint = 'https://fcm.googleapis.com/fcm/send/abc') {
  return {
    endpoint,
    options: { applicationServerKey: null },
    toJSON: () => ({ endpoint, keys: { p256dh: 'CLAVE', auth: 'SECRETO' } }),
  } as unknown as PushSubscription;
}

/** `SwPush` sin trabajador de servicio: la suscripción se controla desde la prueba. */
class FakeSwPush {
  readonly isEnabled = true;
  readonly subscription = new BehaviorSubject<PushSubscription | null>(null);
  readonly requestSubscription = vi.fn(async () => {
    const created = browserSubscription();
    this.subscription.next(created);
    return created;
  });
  readonly unsubscribe = vi.fn(async () => this.subscription.next(null));
}

describe('PushService', () => {
  let http: HttpTestingController;
  let swPush: FakeSwPush;
  let permission: NotificationPermission;

  function create(withSwPush = true): PushService {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ...(withSwPush ? [{ provide: SwPush, useValue: swPush }] : []),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    const service = TestBed.inject(PushService);
    TestBed.tick();
    return service;
  }

  beforeEach(() => {
    swPush = new FakeSwPush();
    permission = 'default';
    vi.stubGlobal('Notification', {
      get permission() {
        return permission;
      },
    });
    vi.stubGlobal('PushManager', function PushManager() {});
    localStorage.setItem('finscope.accessToken', 'token');
    localStorage.setItem(
      'finscope.user',
      JSON.stringify({ id: 7, email: 'ana@fin-scope.app', emailVerified: true }),
    );
  });

  afterEach(() => {
    http.verify();
    vi.unstubAllGlobals();
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('sin trabajador de servicio constan como no admitidos y no pregunta a la API', () => {
    const service = create(false);

    expect(service.status()).toBe('unsupported');
    http.expectNone('/push/config');
  });

  it('sin claves en el servidor quedan como no disponibles', () => {
    const service = create();

    http.expectOne('/push/config').flush({ enabled: false });
    TestBed.tick();

    expect(service.status()).toBe('unavailable');
  });

  it('al activarlos suscribe con la clave del servidor y registra el dispositivo', async () => {
    const service = create();
    http.expectOne('/push/config').flush({ enabled: true, publicKey: PUBLIC_KEY });
    TestBed.tick();
    expect(service.status()).toBe('off');

    const enabling = service.enable();
    await vi.waitFor(() => expect(swPush.requestSubscription).toHaveBeenCalled());
    permission = 'granted';
    const request = await vi.waitFor(() => http.expectOne('/push/subscriptions'));
    expect(swPush.requestSubscription).toHaveBeenCalledWith({ serverPublicKey: PUBLIC_KEY });
    expect(request.request.body).toEqual({
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      keys: { p256dh: 'CLAVE', auth: 'SECRETO' },
    });
    request.flush(null);
    await enabling;
    TestBed.tick();

    expect(service.status()).toBe('on');
    // El registro de al activar ya cuenta: no se repite al ver la suscripción nueva.
    http.expectNone('/push/subscriptions');
  });

  it('una suscripción que ya tenía el navegador se registra a nombre de quien entra', () => {
    swPush.subscription.next(browserSubscription());
    create();

    http.expectOne('/push/config').flush({ enabled: true, publicKey: PUBLIC_KEY });
    TestBed.tick();

    const request = http.expectOne('/push/subscriptions');
    expect(request.request.method).toBe('POST');
    request.flush(null);
  });

  it('con el permiso bloqueado no ofrece activarlos', () => {
    permission = 'denied';
    const service = create();

    http.expectOne('/push/config').flush({ enabled: true, publicKey: PUBLIC_KEY });
    TestBed.tick();

    expect(service.status()).toBe('denied');
  });

  it('al salir da de baja el dispositivo en la API y en el navegador', async () => {
    swPush.subscription.next(browserSubscription());
    const service = create();
    http.expectOne('/push/config').flush({ enabled: true, publicKey: PUBLIC_KEY });
    TestBed.tick();
    http.expectOne('/push/subscriptions').flush(null);

    const releasing = firstValueFrom(service.release());
    const request = http.expectOne((req) => req.url === '/push/subscriptions');
    expect(request.request.method).toBe('DELETE');
    expect(request.request.params.get('endpoint')).toBe('https://fcm.googleapis.com/fcm/send/abc');
    request.flush(null);
    await releasing;

    expect(swPush.unsubscribe).toHaveBeenCalled();
  });

  it('si la API no contesta al salir, se da de baja igual en el navegador', async () => {
    swPush.subscription.next(browserSubscription());
    const service = create();
    http.expectOne('/push/config').flush({ enabled: true, publicKey: PUBLIC_KEY });
    TestBed.tick();
    http.expectOne('/push/subscriptions').flush(null);

    const releasing = firstValueFrom(service.release());
    http
      .expectOne((req) => req.url === '/push/subscriptions')
      .flush(null, { status: 0, statusText: 'Unknown Error' });
    await releasing;

    expect(swPush.unsubscribe).toHaveBeenCalled();
  });
});
