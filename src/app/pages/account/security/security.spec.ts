import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AccountSecurityPage } from './security';
import { UserResponse } from '../../../core/models';

const USER: UserResponse = {
  id: 7,
  email: 'sebastian@example.com',
  emailVerified: true,
  displayName: 'Sebastian',
};

describe('AccountSecurityPage', () => {
  let fixture: ComponentFixture<AccountSecurityPage>;
  let http: HttpTestingController;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** El botón de la pantalla cuyo texto empieza por lo indicado. */
  function button(text: string): HTMLButtonElement {
    return Array.from(host().querySelectorAll<HTMLButtonElement>('button')).find((candidate) =>
      candidate.textContent!.trim().startsWith(text),
    )!;
  }

  /** Escribe en un campo del formulario del correo. */
  function fill(selector: string, value: string): void {
    const field = host().querySelector<HTMLInputElement>(selector)!;
    field.value = value;
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  /** Monta la pantalla partiendo del usuario indicado. */
  async function build(user: UserResponse): Promise<void> {
    localStorage.setItem('finscope.user', JSON.stringify(user));
    await TestBed.configureTestingModule({
      imports: [AccountSecurityPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AccountSecurityPage);
    fixture.detectChanges();
  }

  /** Rehace la pantalla con otro usuario. */
  async function rebuild(user: UserResponse): Promise<void> {
    http.verify();
    TestBed.resetTestingModule();
    await build(user);
  }

  beforeEach(async () => {
    await build(USER);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('no manda nada al correo: se enseña, pero no se toca', () => {
    expect(host().textContent).toContain(USER.email);
    expect(host().querySelector('input[type="email"]')).toBeNull();
  });

  it('marca el correo como verificado y no ofrece mandarlo otra vez', () => {
    expect(host().textContent).toContain('Verificado');
    expect(button('Mandarme el enlace')).toBeUndefined();
  });

  it('pide el enlace de verificación cuando el correo no está comprobado', async () => {
    await rebuild({ ...USER, emailVerified: false });

    expect(host().textContent).toContain('Sin verificar');

    button('Mandarme el enlace').click();
    fixture.detectChanges();

    const request = http.expectOne({ method: 'POST', url: '/auth/verify-email' });
    request.flush(null, { status: 202, statusText: 'Accepted' });
    fixture.detectChanges();
  });

  it('no ofrece mandar el enlace con la dirección que la cuenta ya tiene', () => {
    button('Cambiar mi correo').click();
    fixture.detectChanges();

    fill('#newEmail', USER.email);
    fill('#currentPassword', 'una-contrasena');

    expect(button('Mandar el enlace').disabled).toBe(true);
  });

  it('pide el cambio con la contraseña y deja el correo de la cuenta como estaba', () => {
    button('Cambiar mi correo').click();
    fixture.detectChanges();

    fill('#newEmail', '  nuevo@example.com  ');
    fill('#currentPassword', 'una-contrasena');
    host().querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    const request = http.expectOne({ method: 'POST', url: '/auth/change-email' });
    expect(request.request.body).toEqual({
      email: 'nuevo@example.com',
      password: 'una-contrasena',
    });
    request.flush(null, { status: 202, statusText: 'Accepted' });
    fixture.detectChanges();

    // Lo que se enseña arriba sigue siendo el correo de siempre: el cambio no ha ocurrido
    // todavía, y decir lo contrario haría creer que ya se entra con el nuevo.
    expect(host().textContent).toContain(USER.email);
    expect(host().textContent).toContain('Confirma tu correo nuevo');
    expect(host().textContent).toContain('nuevo@example.com');
  });

  it('manda a su propio correo el enlace con el que cambiar la contraseña', () => {
    button('Cambiar mi contraseña').click();
    fixture.detectChanges();

    const request = http.expectOne({ method: 'POST', url: '/auth/forgot-password' });
    expect(request.request.body).toEqual({ email: USER.email });
    request.flush(null, { status: 202, statusText: 'Accepted' });
    fixture.detectChanges();

    expect(host().textContent).toContain('Mira tu correo');
    // El botón pasa a ofrecer repetirlo, que es lo único que queda por hacer desde aquí.
    expect(button('Volver a mandarlo')).toBeDefined();
  });

  it('no pide la contraseña actual para cambiarla: el permiso es recibir el enlace', () => {
    expect(host().textContent).toContain('Contraseña');
    expect(host().querySelector('input[type="password"]')).toBeNull();
  });
});
