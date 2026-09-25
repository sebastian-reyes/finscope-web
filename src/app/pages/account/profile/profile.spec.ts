import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AccountProfilePage } from './profile';
import { AuthService } from '../../../core/auth.service';
import { ToastService } from '../../../core/toast.service';
import { UserResponse } from '../../../core/models';

const USER: UserResponse = {
  id: 7,
  email: 'sebastian@example.com',
  emailVerified: true,
  displayName: 'Sebastian',
};

describe('AccountProfilePage', () => {
  let fixture: ComponentFixture<AccountProfilePage>;
  let http: HttpTestingController;

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
  function buttons(): HTMLButtonElement[] {
    return Array.from(host().querySelectorAll<HTMLButtonElement>('.fs-form__actions button'));
  }

  function actions(): string[] {
    return buttons().map((button) => button.textContent!.trim());
  }

  /** Envía el formulario como lo haría el botón de guardar. */
  function submit(): void {
    host().querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  }

  beforeEach(async () => {
    localStorage.setItem('finscope.user', JSON.stringify(USER));
    await TestBed.configureTestingModule({
      imports: [AccountProfilePage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AccountProfilePage);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    localStorage.clear();
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

  /** La imagen de la cuadrícula con el nombre indicado. */
  function avatarButton(label: string): HTMLButtonElement {
    return host().querySelector<HTMLButtonElement>(`.fs-avatars__item[aria-label="${label}"]`)!;
  }

  /** La que está marcada como elegida. */
  function chosenAvatar(): string | null {
    return host().querySelector('.fs-avatars__item.is-active')!.getAttribute('aria-label');
  }

  it('parte de las iniciales cuando la cuenta no ha elegido imagen', () => {
    expect(host().querySelectorAll('.fs-avatars__item')).toHaveLength(12);
    expect(chosenAvatar()).toBe('Tus iniciales');
  });

  it('guarda la imagen al tocarla y la marca sin esperar a la API', () => {
    avatarButton('Llama').click();
    fixture.detectChanges();

    expect(chosenAvatar()).toBe('Llama');
    const request = http.expectOne({ method: 'PATCH', url: '/auth/me' });
    expect(request.request.body).toEqual({ avatar: 'llama' });
    request.flush({ ...USER, avatar: 'llama' });
    fixture.detectChanges();

    expect(TestBed.inject(AuthService).user()?.avatar).toBe('llama');
  });

  it('vuelve a las iniciales pidiéndolo con su nombre, no mandando un vacío', async () => {
    localStorage.setItem('finscope.user', JSON.stringify({ ...USER, avatar: 'fox' }));
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [AccountProfilePage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AccountProfilePage);
    fixture.detectChanges();
    expect(chosenAvatar()).toBe('Zorro');

    avatarButton('Tus iniciales').click();
    fixture.detectChanges();

    const request = http.expectOne({ method: 'PATCH', url: '/auth/me' });
    expect(request.request.body).toEqual({ avatar: 'initials' });
    request.flush({ ...USER, avatar: null });
  });

  it('deja marcada la de antes si la API no la acepta', () => {
    avatarButton('Búho').click();
    fixture.detectChanges();

    http
      .expectOne({ method: 'PATCH', url: '/auth/me' })
      .flush({ message: 'No' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(chosenAvatar()).toBe('Tus iniciales');
    expect(TestBed.inject(ToastService).toasts()[0].tone).toBe('error');
  });

  it('sigue al nombre que llega al recargar, pero no pisa lo que se está escribiendo', () => {
    const auth = TestBed.inject(AuthService);

    auth.refreshUser().subscribe();
    http.expectOne({ method: 'GET', url: '/auth/me' }).flush({ ...USER, displayName: 'Seba' });
    fixture.detectChanges();
    expect(nameField().value).toBe('Seba');

    type('A medio escribir');
    auth.refreshUser().subscribe();
    http.expectOne({ method: 'GET', url: '/auth/me' }).flush({ ...USER, displayName: 'Otro' });
    fixture.detectChanges();

    expect(nameField().value).toBe('A medio escribir');
  });
});
