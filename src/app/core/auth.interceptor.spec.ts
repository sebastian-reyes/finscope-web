import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';
import { AuthResponse } from './models';

describe('authInterceptor', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let auth: AuthService;
  let navigate: ReturnType<typeof vi.fn>;

  /** La respuesta de `/auth/refresh`, con el par nuevo que sustituye al consumido. */
  const renewed: AuthResponse = {
    accessToken: 'nuevo',
    refreshToken: 'refresco-2',
    user: { id: 1, email: 'test@finscope.dev', emailVerified: true, displayName: 'Test' },
  } as AuthResponse;

  beforeEach(() => {
    localStorage.setItem('finscope.accessToken', 'viejo');
    localStorage.setItem('finscope.refreshToken', 'refresco-1');
    navigate = vi.fn();

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigate } },
      ],
    });

    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  it('firma la petición con el token en vigor', () => {
    http.get('/transactions').subscribe();

    const request = backend.expectOne('/transactions');
    expect(request.request.headers.get('Authorization')).toBe('Bearer viejo');
    request.flush([]);
  });

  it('renueva la sesión y repite la petición cuando el token ha caducado', async () => {
    const done = vi.fn();
    http.patch('/transactions/7', { amount: 10 }).subscribe(done);

    backend.expectOne('/transactions/7').flush(null, { status: 401, statusText: 'Unauthorized' });
    backend.expectOne('/auth/refresh').flush(renewed);

    // La misma petición otra vez, ya con el token recién traído.
    const retried = backend.expectOne('/transactions/7');
    expect(retried.request.method).toBe('PATCH');
    expect(retried.request.headers.get('Authorization')).toBe('Bearer nuevo');
    retried.flush({ id: 7 });

    expect(done).toHaveBeenCalledWith({ id: 7 });
    expect(navigate).not.toHaveBeenCalled();
    expect(auth.isLoggedIn()).toBe(true);
  });

  it('consume una sola renovación aunque caduquen varias peticiones a la vez', () => {
    http.get('/transactions').subscribe();
    http.get('/categories').subscribe();

    for (const url of ['/transactions', '/categories']) {
      backend.expectOne(url).flush(null, { status: 401, statusText: 'Unauthorized' });
    }

    // El token de refresco es de un solo uso: dos llamadas aquí invalidarían el par bueno.
    backend.expectOne('/auth/refresh').flush(renewed);

    backend.expectOne('/transactions').flush([]);
    backend.expectOne('/categories').flush([]);
  });

  it('usa el token que otra pestaña acaba de renovar sin gastar el de refresco', () => {
    const done = vi.fn();
    http.get('/transactions').subscribe(done);
    const fresh = jwt(600);
    localStorage.setItem('finscope.accessToken', fresh);
    localStorage.setItem('finscope.refreshToken', 'refresco-de-la-otra-pestana');

    backend.expectOne('/transactions').flush(null, { status: 401, statusText: 'Unauthorized' });

    backend.expectNone('/auth/refresh');
    const retried = backend.expectOne('/transactions');
    expect(retried.request.headers.get('Authorization')).toBe(`Bearer ${fresh}`);
    retried.flush([]);
    expect(done).toHaveBeenCalledWith([]);
    expect(auth.accessToken).toBe(fresh);
  });

  it('renueva igualmente si el token que dejó otra pestaña también ha caducado', () => {
    http.get('/transactions').subscribe();
    localStorage.setItem('finscope.accessToken', jwt(-60));

    backend.expectOne('/transactions').flush(null, { status: 401, statusText: 'Unauthorized' });

    backend.expectOne('/auth/refresh').flush(renewed);
    const retried = backend.expectOne('/transactions');
    expect(retried.request.headers.get('Authorization')).toBe('Bearer nuevo');
    retried.flush([]);
  });

  it('renueva bajo el candado compartido entre pestañas', async () => {
    const request = vi.fn((_name: string, task: () => Promise<unknown>) => task());
    Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true });
    try {
      const done = vi.fn();
      http.get('/transactions').subscribe(done);

      backend.expectOne('/transactions').flush(null, { status: 401, statusText: 'Unauthorized' });
      expect(request).toHaveBeenCalledWith('finscope.refresh', expect.any(Function));

      backend.expectOne('/auth/refresh').flush(renewed);
      await Promise.resolve();
      await Promise.resolve();
      backend.expectOne('/transactions').flush([]);
      expect(done).toHaveBeenCalledWith([]);
    } finally {
      delete (navigator as { locks?: unknown }).locks;
    }
  });

  it('cierra la sesión solo si la renovación también falla', () => {
    http.get('/transactions').subscribe({ error: () => undefined });

    backend.expectOne('/transactions').flush(null, { status: 401, statusText: 'Unauthorized' });
    backend.expectOne('/auth/refresh').flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(auth.isLoggedIn()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { expired: true } });
  });

  it('no intenta renovar lo que ya es una llamada de credenciales', () => {
    http.post('/auth/login', {}).subscribe({ error: () => undefined });

    const request = backend.expectOne('/auth/login');
    expect(request.request.headers.has('Authorization')).toBe(false);
    request.flush(null, { status: 401, statusText: 'Unauthorized' });

    // Un acceso rechazado es un error del formulario, no una sesión caducada.
    backend.expectNone('/auth/refresh');
    expect(navigate).not.toHaveBeenCalled();
  });

  /**
   * Un token de acceso con la forma de un JWT y la caducidad indicada. Solo importa `exp`: la
   * firma la comprueba la API, no el cliente.
   *
   * @param secondsFromNow segundos hasta que caduca; negativo si ya caducó
   */
  function jwt(secondsFromNow: number): string {
    const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + secondsFromNow }));
    return `cabecera.${payload.replace(/=+$/, '')}.firma`;
  }

  afterEach(() => {
    backend.verify();
    localStorage.clear();
  });
});
