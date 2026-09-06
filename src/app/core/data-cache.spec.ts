import { afterEach, describe, expect, it } from 'vitest';
import ngswConfig from '../../../ngsw-config.json';
import { clearCachedApiData } from './data-cache';

/** Los nombres que Angular le pone a sus cachés, tal y como los arma `ngsw-worker`. */
const NAMES = [
  'ngsw:/:1:data:datos:cache',
  'ngsw:/:1:data:catalogos:cache',
  'ngsw:/:db:1:data:datos:lru',
  'ngsw:/:db:1:data:datos:age',
  'ngsw:/:a1b2c3:assets:app:cache',
  'ngsw:/:a1b2c3:assets:assets:cache',
  'ngsw:/:db:control',
  'otra-cosa',
];

/** Sustituye el almacén del navegador por uno de mentira que apunta lo que se le borra. */
function fakeCaches(names: string[] = NAMES): { deleted: string[] } {
  const deleted: string[] = [];
  (globalThis as Record<string, unknown>)['caches'] = {
    keys: () => Promise.resolve(names),
    delete: (name: string) => {
      deleted.push(name);
      return Promise.resolve(true);
    },
  };
  return { deleted };
}

describe('clearCachedApiData', () => {
  afterEach(() => {
    delete (globalThis as Record<string, unknown>)['caches'];
  });

  it('se lleva las respuestas de la API y deja en pie la aplicación cacheada', async () => {
    // Es lo que impide que la copia sin conexión de una cuenta se le sirva a la siguiente que
    // entre en el mismo navegador: el trabajador empareja por dirección, no por credenciales.
    const store = fakeCaches();

    await clearCachedApiData();

    expect(store.deleted.sort()).toEqual([
      'ngsw:/:1:data:catalogos:cache',
      'ngsw:/:1:data:datos:cache',
      'ngsw:/:db:1:data:datos:age',
      'ngsw:/:db:1:data:datos:lru',
    ]);
  });

  it('no se queja cuando el navegador no da acceso al almacén', async () => {
    // Ventana privada, permiso denegado: cerrar sesión tiene que terminar igual.
    (globalThis as Record<string, unknown>)['caches'] = {
      keys: () => Promise.reject(new Error('denegado')),
    };

    await expect(clearCachedApiData()).resolves.toBeUndefined();
  });

  it('no hace nada donde no hay almacén, como en las pruebas o en desarrollo', async () => {
    await expect(clearCachedApiData()).resolves.toBeUndefined();
  });
});

describe('ngsw-config.json', () => {
  const config = ngswConfig as {
    dataGroups: { name: string; urls: string[]; cacheConfig: Record<string, unknown> }[];
  };

  /** Todas las direcciones declaradas, de todos los grupos. */
  const urls = config.dataGroups.flatMap((group) => group.urls);

  it('apunta entero a un mismo servidor', () => {
    // El trabajador empareja por dirección completa, así que el servidor va repetido en cada
    // línea y este archivo es JSON estricto: no puede importar `environment.ts` ni llevar un
    // comentario que lo avise. Lo que se caza aquí es la mitad de un cambio de servidor, que
    // no rompe nada visible: la caché deja de emparejar y desaparece en silencio.
    const origins = new Set(urls.map((url) => new URL(url).origin));

    expect(origins.size).toBe(1);
    expect([...origins][0]).toMatch(/^https:\/\//);
  });

  it('pregunta siempre a la red antes que a la copia', () => {
    // `performance` serviría la copia sin preguntar. En una aplicación de dinero, enseñar un
    // saldo viejo como si fuera el de ahora es peor que tardar.
    for (const group of config.dataGroups) {
      expect(group.cacheConfig['strategy']).toBe('freshness');
    }
  });

  it('no le pone plazo a la red en el grupo de las cifras', () => {
    // Con un plazo, una red lenta —el servicio de Render despertando— devolvería la copia sin
    // que la aplicación pudiera saberlo ni avisarlo. Así solo cae en la copia cuando la red
    // falla de verdad, que es cuando el aviso de «sin conexión» dice la verdad.
    const figures = config.dataGroups.find((group) => group.name === 'datos');
    expect(figures?.cacheConfig['timeout']).toBeUndefined();
  });
});
