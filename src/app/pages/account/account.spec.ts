import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AccountPage } from './account';
import { UserResponse } from '../../core/models';

const USER: UserResponse = {
  id: 7,
  email: 'sebastian@example.com',
  displayName: 'Sebastian',
};

describe('AccountPage', () => {
  let fixture: ComponentFixture<AccountPage>;
  let http: HttpTestingController;

  /** El elemento de la pantalla, ya tipado: `nativeElement` llega como `any`. */
  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  /** El campo del nombre, que es lo único editable de la pantalla. */
  function nameField(): HTMLInputElement {
    return host().querySelector<HTMLInputElement>('#accountName')!;
  }

  /** Escribe en el campo como lo haría el usuario. */
  function type(value: string): void {
    const field = nameField();
    field.value = value;
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  /** Los botones que solo aparecen cuando hay algo que guardar. */
  function actions(): string[] {
    return buttons().map((button) => button.textContent!.trim());
  }

  /** Esos mismos botones, para poder pulsarlos. */
  function buttons(): HTMLButtonElement[] {
    return Array.from(host().querySelectorAll<HTMLButtonElement>('.fs-form__actions button'));
  }

  /** Envía el formulario como lo haría el botón de guardar. */
  function submit(): void {
    host().querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    localStorage.setItem('finscope.user', JSON.stringify(USER));
    await TestBed.configureTestingModule({
      imports: [AccountPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AccountPage);
    fixture.detectChanges();
    // La pantalla vuelve a preguntar quién es el usuario al abrirse.
    http.expectOne({ method: 'GET', url: '/auth/me' }).flush(USER);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
  });

  it('no enseña el token de acceso ni las rutas de la API', () => {
    localStorage.setItem('finscope.accessToken', 'un-token-de-acceso');
    fixture.detectChanges();

    const text = host().textContent ?? '';
    expect(text).not.toContain('un-token-de-acceso');
    expect(text).not.toContain('/auth/me');
    // El identificador interno tampoco le dice nada a quien usa la aplicación.
    expect(text).not.toContain(String(USER.id));
  });

  it('parte del nombre guardado y no ofrece guardar hasta que cambia', () => {
    expect(nameField().value).toBe('Sebastian');
    expect(actions()).toEqual([]);

    type('Sebas');

    expect(actions()).toEqual(['Descartar', 'Guardar nombre']);
  });

  it('manda el nombre recortado y deja de ofrecer guardar', () => {
    type('  Sebastián R.  ');

    submit();

    const request = http.expectOne({ method: 'PATCH', url: '/auth/me' });
    expect(request.request.body).toEqual({ displayName: 'Sebastián R.' });
    request.flush({ ...USER, displayName: 'Sebastián R.' });
    fixture.detectChanges();

    expect(nameField().value).toBe('Sebastián R.');
    expect(actions()).toEqual([]);
  });

  it('deja la cuenta sin nombre cuando se envía en blanco', () => {
    type('   ');

    submit();

    const request = http.expectOne({ method: 'PATCH', url: '/auth/me' });
    expect(request.request.body).toEqual({ displayName: '' });
    request.flush({ id: USER.id, email: USER.email });
    fixture.detectChanges();

    expect(nameField().value).toBe('');
  });

  it('descarta lo escrito y vuelve a lo guardado', () => {
    type('Otro nombre');

    buttons()
      .find((button) => button.textContent!.trim() === 'Descartar')!
      .click();
    fixture.detectChanges();

    expect(nameField().value).toBe('Sebastian');
    expect(actions()).toEqual([]);
  });

  it('no manda nada al correo: se enseña, pero no se toca', () => {
    expect(host().textContent).toContain(USER.email);
    expect(host().querySelector('input[type="email"]')).toBeNull();
  });
});
