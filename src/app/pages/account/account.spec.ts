import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AccountPage } from './account';
import { OnboardingService } from '../../core/onboarding.service';
import { UserResponse } from '../../core/models';

const USER: UserResponse = {
  id: 7,
  email: 'sebastian@example.com',
  emailVerified: true,
  displayName: 'Sebastian Reyes',
};

describe('AccountPage', () => {
  let fixture: ComponentFixture<AccountPage>;
  let http: HttpTestingController;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** Las filas del menú de ajustes, por su rótulo. */
  function rows(): string[] {
    return Array.from(host().querySelectorAll('nav .fs-row__label')).map((label) =>
      label.textContent!.trim(),
    );
  }

  /** La fila del menú cuyo rótulo empieza por lo indicado. */
  function row(text: string): HTMLElement {
    return Array.from(host().querySelectorAll<HTMLElement>('.fs-row')).find((candidate) =>
      candidate.querySelector('.fs-row__label')!.textContent!.trim().startsWith(text),
    )!;
  }

  /** Monta la pantalla partiendo del usuario indicado. */
  async function build(user: UserResponse): Promise<void> {
    localStorage.setItem('finscope.user', JSON.stringify(user));
    localStorage.setItem('finscope.accessToken', 'un-acceso');
    localStorage.setItem('finscope.refreshToken', 'un-refresco');
    await TestBed.configureTestingModule({
      imports: [AccountPage],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([{ path: 'login', children: [] }]),
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AccountPage);
    fixture.detectChanges();
    // La pantalla vuelve a preguntar quién es el usuario al abrirse.
    http.expectOne({ method: 'GET', url: '/auth/me' }).flush(user);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await build(USER);
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('no enseña el token de acceso ni las rutas de la API', () => {
    const text = host().textContent ?? '';
    expect(text).not.toContain('un-acceso');
    expect(text).not.toContain('un-refresco');
    expect(text).not.toContain('/auth/me');
    // El identificador interno tampoco le dice nada a quien usa la aplicación.
    expect(text).not.toContain(String(USER.id));
  });

  it('abre con quién eres: iniciales, nombre y correo', () => {
    const card = host().querySelector('.fs-profile')!;

    expect(card.querySelector('.fs-profile__avatar')!.textContent!.trim()).toBe('SR');
    expect(card.textContent).toContain('Sebastian Reyes');
    expect(card.textContent).toContain(USER.email);
  });

  it('reparte los ajustes en un menú en lugar de enseñarlos todos a la vez', () => {
    expect(rows()).toEqual(['Categorías y tags', 'Notificaciones', 'Seguridad', 'Tema y colores']);
    // Ni un formulario ni una muestra de color en el menú: están en su pantalla.
    expect(host().querySelector('input')).toBeNull();
    expect(host().querySelector('.fs-swatch')).toBeNull();
  });

  it('dice al lado de cada fila cómo está ahora', () => {
    expect(row('Tema').querySelector('.fs-row__value')!.textContent!.trim()).toBe('Sistema');
    // Con el correo confirmado, Seguridad no tiene nada que reclamar.
    expect(row('Seguridad').querySelector('.fs-row__value')).toBeNull();
  });

  it('avisa desde el menú de que falta confirmar el correo', async () => {
    http.verify();
    TestBed.resetTestingModule();
    await build({ ...USER, emailVerified: false });

    const value = row('Seguridad').querySelector('.fs-row__value')!;
    expect(value.textContent!.trim()).toBe('Sin verificar');
    expect(value.classList).toContain('is-warn');
  });

  it('usa la inicial del correo cuando la cuenta no tiene nombre', async () => {
    http.verify();
    TestBed.resetTestingModule();
    await build({ id: USER.id, email: USER.email, emailVerified: true });

    expect(host().querySelector('.fs-profile__avatar')!.textContent!.trim()).toBe('S');
    expect(host().querySelector('.fs-profile')!.textContent).toContain('Ponte un nombre');
  });

  it('vuelve a abrir el recorrido de bienvenida', () => {
    const onboarding = TestBed.inject(OnboardingService);

    row('Ayuda').click();

    expect(onboarding.isOpen()).toBe(true);
  });

  it('cierra la sesión desde el menú, que en el teléfono es la única salida', () => {
    row('Cerrar sesión').click();
    fixture.detectChanges();

    http.expectOne({ method: 'POST', url: '/auth/logout' }).flush(null);

    expect(localStorage.getItem('finscope.user')).toBeNull();
  });
});
