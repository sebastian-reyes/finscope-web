import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ForgotPasswordPage } from './forgot-password';

describe('ForgotPasswordPage', () => {
  let fixture: ComponentFixture<ForgotPasswordPage>;
  let http: HttpTestingController;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function fill(value: string): void {
    const field = host().querySelector<HTMLInputElement>('#forgotEmail')!;
    field.value = value;
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function submit(): void {
    host().querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ForgotPasswordPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: '**', children: [] }]),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ForgotPasswordPage);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
  });

  it('no llama a la API con un correo mal escrito', () => {
    fill('sin-arroba');

    submit();

    http.expectNone('/auth/forgot-password');
    expect(host().textContent).toContain('Escribe un correo');
  });

  it('manda el correo recortado y pasa a decir que mires el buzón', () => {
    fill('  sebastian@example.com  ');

    submit();

    const request = http.expectOne({ method: 'POST', url: '/auth/forgot-password' });
    expect(request.request.body).toEqual({ email: 'sebastian@example.com' });
    request.flush(null, { status: 202, statusText: 'Accepted' });
    fixture.detectChanges();

    expect(host().textContent).toContain('Mira tu correo');
    expect(host().textContent).toContain('sebastian@example.com');
    // El formulario ya no está: no hay nada más que pedir desde esta pantalla.
    expect(host().querySelector('form')).toBeNull();
  });

  it('dice lo mismo aunque el correo no tenga cuenta', () => {
    // La API responde 202 exista o no la cuenta, y la pantalla no puede distinguirlas: si lo
    // hiciera, este formulario diría quién está registrado a quien fuera probando correos.
    fill('nadie@example.com');

    submit();

    http
      .expectOne({ method: 'POST', url: '/auth/forgot-password' })
      .flush(null, { status: 202, statusText: 'Accepted' });
    fixture.detectChanges();

    expect(host().textContent).toContain('Si hay una cuenta a nombre de');
    expect(host().textContent).toContain('nadie@example.com');
  });
});
