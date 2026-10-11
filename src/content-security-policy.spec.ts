import { describe, expect, it } from 'vitest';
import { API_ORIGIN } from './environments/api-origin';
import indexHtml from './index.html' with { loader: 'text' };

/**
 * La política vive en una etiqueta `<meta>` de `index.html`, que ninguna prueba monta y que el
 * compilador copia tal cual. Si se rompe, no falla nada en el desarrollo: lo que deja de
 * funcionar es la aplicación publicada.
 */
function readPolicy(): Map<string, string[]> {
  const tag = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(indexHtml);
  if (!tag) {
    throw new Error('index.html no declara la política de seguridad de contenido');
  }
  return new Map(
    tag[1]
      .split(';')
      .map((directive) => directive.trim().split(/\s+/))
      .filter(([name]) => name)
      .map(([name, ...sources]) => [name, sources]),
  );
}

describe('política de seguridad de contenido', () => {
  it('deja hablar con la API que usa la aplicación', () => {
    // En producción la API vive en otro origen. Si `api-origin.ts` cambia y la política no,
    // el navegador bloquea todas las peticiones y la aplicación no pasa de la pantalla de
    // acceso.
    expect(readPolicy().get('connect-src')).toContain(API_ORIGIN);
  });

  it('no admite scripts que no vengan del propio origen', () => {
    // Es lo que impide que un script inyectado se lleve la sesión de `localStorage`. Si un
    // día hace falta relajarlo, la razón tiene que quedar escrita en `index.html`.
    expect(readPolicy().get('script-src')).toEqual(["'self'"]);
  });

  it('no deja incrustar objetos ni cambiar la base de las direcciones', () => {
    const policy = readPolicy();
    expect(policy.get('object-src')).toEqual(["'none'"]);
    expect(policy.get('base-uri')).toEqual(["'self'"]);
  });
});
