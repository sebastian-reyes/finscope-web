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
    user: { id: 1, email: 'test@finscope.dev', displayName: 'Test' },
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

  afterEach(() => {
    backend.verify();
    localStorage.clear();
  });
});
