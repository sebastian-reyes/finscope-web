import { afterEach, describe, expect, it } from 'vitest';
import { clearPreference, preferenceKey, readPreference, writePreference } from './preferences';

const THEME = 'finscope.theme';

describe('preferencias por usuario', () => {
  afterEach(() => localStorage.clear());

  it('guarda a nombre de quien elige, y sin sesión en la ranura anónima', () => {
    expect(preferenceKey(THEME, 7)).toBe('finscope.theme.7');
    expect(preferenceKey(THEME, null)).toBe(THEME);
  });

  it('no deja que una cuenta herede lo que eligió otra en el mismo navegador', () => {
    // Es el fallo que arregla todo esto: cerrar sesión no vacía el `localStorage`, así que
    // con una clave suelta el segundo en entrar se encontraba el tema del primero.
    writePreference(THEME, 7, 'dark');

    expect(readPreference(THEME, 11)).toBeNull();
    expect(readPreference(THEME, 7)).toBe('dark');
  });

  it('cae en lo que hubiera guardado antes de que las claves llevaran usuario', () => {
    // Sin esta caída, actualizar la aplicación le habría quitado el tema oscuro a todo el
    // mundo de golpe.
    localStorage.setItem(THEME, 'dark');

    expect(readPreference(THEME, 7)).toBe('dark');
  });

  it('deja de caer en cuanto esa cuenta elige lo suyo', () => {
    localStorage.setItem(THEME, 'dark');

    writePreference(THEME, 7, 'light');

    expect(readPreference(THEME, 7)).toBe('light');
  });

  it('al olvidar se lleva también lo heredado, o reaparecería al recargar', () => {
    localStorage.setItem(THEME, 'dark');
    writePreference(THEME, 7, 'light');

    clearPreference(THEME, 7);

    expect(readPreference(THEME, 7)).toBeNull();
  });
});
