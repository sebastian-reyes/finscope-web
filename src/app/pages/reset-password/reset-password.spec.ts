import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ResetPasswordPage } from './reset-password';

const TOKEN = 'el-enlace-del-correo';

describe('ResetPasswordPage', () => {
  let fixture: ComponentFixture<ResetPasswordPage>;
  let http: HttpTestingController;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function fill(value: string): void {
    const field = host().querySelector<HTMLInputElement>('#newPassword')!;
    field.value = value;
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  function submit(): void {
    host().querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  /** Monta la pantalla como si se llegara con el enlace indicado en la dirección. */
  async function build(token: string | null): Promise<void> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ResetPasswordPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: '**', children: [] }]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              data: {},
              queryParamMap: convertToParamMap(token === null ? {} : { token }),
            },
          },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ResetPasswordPage);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    localStorage.setItem('finscope.accessToken', 'un-token-de-acceso');
    await build(TOKEN);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('no llama a la API con una contraseña demasiado corta', () => {
    fill('corta');

    submit();

    http.expectNone('/auth/reset-password');
    expect(host().textContent).toContain('al menos 8 caracteres');
  });

  it('manda el enlace junto con la contraseña y cierra la sesión de este navegador', () => {
    fill('una-contrasena-nueva');

    submit();

    const request = http.expectOne({ method: 'POST', url: '/auth/reset-password' });
    expect(request.request.body).toEqual({ token: TOKEN, password: 'una-contrasena-nueva' });
    request.flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();

    // La API revoca todas las sesiones de la cuenta, así que la de aquí ya no sirve: dejarla
    // puesta enseñaría una aplicación que responde 401 a todo.
    expect(localStorage.getItem('finscope.accessToken')).toBeNull();
  });

  it('ofrece pedir otro enlace cuando el que traía ya no vale', () => {
    fill('una-contrasena-nueva');

    submit();

    http
      .expectOne({ method: 'POST', url: '/auth/reset-password' })
      .flush(
        { code: 'INVALID_ACCOUNT_TOKEN', message: 'The link is invalid' },
        { status: 400, statusText: 'Bad Request' },
      );
    fixture.detectChanges();

    expect(host().textContent).toContain('Este enlace ya no vale');
    // Y no un mensaje de error sobre el formulario: volver a escribir la contraseña no lo
    // arreglaría, así que el formulario desaparece y queda el camino que sí lleva a algo.
    expect(host().querySelector('form')).toBeNull();
    expect(host().querySelector('a')!.textContent).toContain('Pedir otro enlace');
  });

  it('sin enlace en la dirección no enseña el formulario', async () => {
    await build(null);

    expect(host().querySelector('form')).toBeNull();
    expect(host().textContent).toContain('Este enlace ya no vale');
  });
});
