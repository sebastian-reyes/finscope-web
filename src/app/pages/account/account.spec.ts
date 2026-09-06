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

  /** Las muestras de color de uno de los dos huecos, en el orden en que se ven. */
  function swatches(role: 'primary' | 'secondary'): HTMLButtonElement[] {
    const group = host().querySelector(`[aria-labelledby="${role}Label"]`)!;
    return Array.from(group.querySelectorAll<HTMLButtonElement>('button.fs-swatch'));
  }

  /** La muestra marcada como puesta, que es la que lleva el anillo. */
  function chosen(role: 'primary' | 'secondary'): HTMLButtonElement | undefined {
    return swatches(role).find((swatch) => swatch.getAttribute('aria-pressed') === 'true');
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

  it('arranca con los colores guardados a nombre de quien entra', async () => {
    // Se rehace la pantalla con algo ya guardado bajo la clave de este usuario: es el camino
    // de lectura, el que hace que al volver a entrar te encuentres tu color y no el de otro.
    http.verify();
    localStorage.setItem(
      `finscope.colors.${USER.id}`,
      JSON.stringify({ primary: '#7c3aed', secondary: '#d9930b' }),
    );
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [AccountPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AccountPage);
    fixture.detectChanges();
    http.expectOne({ method: 'GET', url: '/auth/me' }).flush(USER);
    fixture.detectChanges();

    expect(chosen('primary')!.getAttribute('aria-label')).toBe('Violeta');
    expect(chosen('secondary')!.getAttribute('aria-label')).toBe('Ámbar');
  });

  it('parte de los colores de fábrica y no ofrece restablecerlos', () => {
    expect(chosen('primary')!.getAttribute('aria-label')).toBe('Azul');
    expect(chosen('secondary')!.getAttribute('aria-label')).toBe('Verde');
    expect(host().querySelector('.fs-reset')).toBeNull();
  });

  it('aplica el color elegido al documento y lo recuerda', () => {
    const violeta = swatches('primary').find(
      (swatch) => swatch.getAttribute('aria-label') === 'Violeta',
    )!;

    violeta.click();
    fixture.detectChanges();

    expect(chosen('primary')).toBe(violeta);
    // Lo que importa no es el hexadecimal exacto —la escala se deriva— sino que la variable
    // deje de valer lo que valía: es lo único que hace que la aplicación cambie de color.
    expect(document.documentElement.style.getPropertyValue('--fs-brand')).not.toBe('');
    // La clave lleva el identificador: lo elegido es de esta cuenta, no de este navegador.
    expect(JSON.parse(localStorage.getItem(`finscope.colors.${USER.id}`)!).primary).toBe('#7c3aed');
  });

  it('ofrece restablecer en cuanto la pareja deja de ser la de fábrica, y la devuelve', () => {
    swatches('secondary')
      .find((swatch) => swatch.getAttribute('aria-label') === 'Ámbar')!
      .click();
    fixture.detectChanges();

    host().querySelector<HTMLButtonElement>('.fs-reset')!.click();
    fixture.detectChanges();

    expect(chosen('secondary')!.getAttribute('aria-label')).toBe('Verde');
    expect(localStorage.getItem(`finscope.colors.${USER.id}`)).toBeNull();
    expect(host().querySelector('.fs-reset')).toBeNull();
  });

  it('deja elegir un color que no está en la lista corta', () => {
    const field = host().querySelector<HTMLInputElement>('.fs-swatch--custom input')!;

    field.value = '#123456';
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(chosen('primary')).toBeUndefined();
    expect(JSON.parse(localStorage.getItem(`finscope.colors.${USER.id}`)!).primary).toBe('#123456');
  });

  it('no manda nada al correo: se enseña, pero no se toca', () => {
    expect(host().textContent).toContain(USER.email);
    expect(host().querySelector('input[type="email"]')).toBeNull();
  });
});
