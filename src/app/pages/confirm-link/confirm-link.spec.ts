import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfirmLinkPage, ConfirmKind } from './confirm-link';
import { UserResponse } from '../../core/models';

const TOKEN = 'el-enlace-del-correo';

const USER: UserResponse = {
  id: 7,
  email: 'sebastian@example.com',
  emailVerified: true,
  displayName: 'Sebastian',
};

describe('ConfirmLinkPage', () => {
  let fixture: ComponentFixture<ConfirmLinkPage>;
  let http: HttpTestingController;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** Monta la pantalla como si se llegara desde el correo con ese enlace. */
  async function build(kind: ConfirmKind, token: string | null): Promise<void> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [ConfirmLinkPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: '**', children: [] }]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              data: { kind },
              queryParamMap: convertToParamMap(token === null ? {} : { token }),
            },
          },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ConfirmLinkPage);
    fixture.detectChanges();
  }

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('confirma el correo nada más abrirse, sin pedir confirmación', async () => {
    await build('verify', TOKEN);

    const request = http.expectOne({ method: 'POST', url: '/auth/verify-email/confirm' });
    expect(request.request.body).toEqual({ token: TOKEN });
    request.flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();

    expect(host().textContent).toContain('Correo confirmado');
  });

  it('aplica el cambio de correo con el enlace de su propia ruta', async () => {
    await build('change', TOKEN);

    http
      .expectOne({ method: 'POST', url: '/auth/change-email/confirm' })
      .flush(null, { status: 204, statusText: 'No Content' });
    fixture.detectChanges();

    expect(host().textContent).toContain('Correo cambiado');
  });

  it('vuelve a preguntar quién es el usuario cuando hay sesión abierta', async () => {
    // La copia local se quedó vieja en el mismo momento en que la API aplicó el cambio: sin
    // esto, la pantalla de cuenta seguiría enseñando el correo anterior.
    localStorage.setItem('finscope.accessToken', 'un-token-de-acceso');
    await build('change', TOKEN);

    http
      .expectOne({ method: 'POST', url: '/auth/change-email/confirm' })
      .flush(null, { status: 204, statusText: 'No Content' });
    http.expectOne({ method: 'GET', url: '/auth/me' }).flush(USER);
    fixture.detectChanges();

    expect(localStorage.getItem('finscope.user')).toContain('sebastian@example.com');
  });

  it('explica que el enlace ya no vale en lugar de enseñar el error de la API', async () => {
    await build('verify', TOKEN);

    http
      .expectOne({ method: 'POST', url: '/auth/verify-email/confirm' })
      .flush(
        { code: 'INVALID_ACCOUNT_TOKEN', message: 'The link is invalid' },
        { status: 400, statusText: 'Bad Request' },
      );
    fixture.detectChanges();

    expect(host().textContent).toContain('Este enlace ya no vale');
    expect(host().textContent).not.toContain('INVALID_ACCOUNT_TOKEN');
  });

  it('sin enlace en la dirección no llama a la API', async () => {
    await build('verify', null);

    http.expectNone('/auth/verify-email/confirm');
    expect(host().textContent).toContain('Este enlace ya no vale');
  });
});
