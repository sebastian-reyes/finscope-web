import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LoginPage } from './login';

describe('LoginPage', () => {
  let fixture: ComponentFixture<LoginPage>;
  let http: HttpTestingController;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function fill(selector: string, value: string): void {
    const field = host().querySelector<HTMLInputElement>(selector)!;
    field.value = value;
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function submit(): void {
    host().querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  /** Pasa a la pestaña de alta. */
  function switchToRegister(): void {
    host().querySelectorAll<HTMLButtonElement>('.fs-seg__btn')[1].click();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoginPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        // Una ruta comodín: entrar navega al dashboard y sin ella el router protestaría.
        provideRouter([{ path: '**', children: [] }]),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
  });

  it('no llama a la API con un correo mal escrito', () => {
    fill('#email', 'sin-arroba');
    fill('#password', 'una-contrasena');

    submit();

    http.expectNone('/auth/login');
    expect(host().textContent).toContain('Escribe un correo');
  });

  it('no llama a la API con una contraseña demasiado corta', () => {
    fill('#email', 'yo@correo.com');
    fill('#password', 'corta');

    submit();

    http.expectNone('/auth/login');
    expect(host().textContent).toContain('al menos 8 caracteres');
  });

  it('entra con las credenciales escritas, sin espacios de más en el correo', () => {
    fill('#email', '  yo@correo.com ');
    fill('#password', 'una-contrasena');

    submit();

    const request = http.expectOne('/auth/login');
    expect(request.request.body).toEqual({
      email: 'yo@correo.com',
      password: 'una-contrasena',
    });
    request.flush({});
  });

  it('conserva lo escrito al cambiar de entrar a crear cuenta', () => {
    fill('#email', 'yo@correo.com');

    switchToRegister();

    expect(host().querySelector<HTMLInputElement>('#email')!.value).toBe('yo@correo.com');
  });

  it('omite el nombre a mostrar cuando se deja vacío al registrarse', () => {
    switchToRegister();
    fill('#email', 'yo@correo.com');
    fill('#password', 'una-contrasena');

    submit();

    const request = http.expectOne('/auth/register');
    expect(request.request.body.displayName).toBeUndefined();
    request.flush({});
  });

  it('manda el nombre a mostrar cuando se escribe', () => {
    switchToRegister();
    fill('#email', 'yo@correo.com');
    fill('#password', 'una-contrasena');
    fill('#displayName', 'Sebastián');

    submit();

    const request = http.expectOne('/auth/register');
    expect(request.request.body.displayName).toBe('Sebastián');
    request.flush({});
  });

  it('deja ver la contraseña escrita', () => {
    expect(host().querySelector<HTMLInputElement>('#password')!.type).toBe('password');

    host().querySelector<HTMLButtonElement>('.fs-auth__reveal')!.click();
    fixture.detectChanges();

    expect(host().querySelector<HTMLInputElement>('#password')!.type).toBe('text');
  });
});
