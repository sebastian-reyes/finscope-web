import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AccountAppearancePage } from './appearance';
import { UserResponse } from '../../../core/models';

const USER: UserResponse = {
  id: 7,
  email: 'sebastian@example.com',
  emailVerified: true,
  displayName: 'Sebastian',
};

describe('AccountAppearancePage', () => {
  let fixture: ComponentFixture<AccountAppearancePage>;

  function host(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
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

  async function build(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [AccountAppearancePage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(AccountAppearancePage);
    fixture.detectChanges();
  }

  beforeEach(async () => {
    localStorage.setItem('finscope.user', JSON.stringify(USER));
    await build();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('arranca con los colores guardados a nombre de quien entra', async () => {
    // Se rehace la pantalla con algo ya guardado bajo la clave de este usuario: es el camino
    // de lectura, el que hace que al volver a entrar te encuentres tu color y no el de otro.
    localStorage.setItem(
      `finscope.colors.${USER.id}`,
      JSON.stringify({ primary: '#7c3aed', secondary: '#d9930b' }),
    );
    TestBed.resetTestingModule();
    await build();

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
});
