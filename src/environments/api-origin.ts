/**
 * Origen del backend desplegado, sin barra final.
 *
 * Vive en su propio archivo y no dentro de `environment.ts` por una razón concreta: las
 * pruebas sustituyen `environment.ts` por el de desarrollo —que apunta a ningún sitio,
 * porque allí hay un proxy—, así que desde una prueba no hay forma de leer lo que dice el de
 * producción. Este archivo no se sustituye, de modo que `data-cache.spec.ts` puede comprobar
 * que `ngsw-config.json` habla del mismo servidor que la aplicación.
 *
 * Esa comprobación no es un lujo: el trabajador de servicio empareja por dirección completa,
 * y si los dos archivos se separan la caché sin conexión deja de emparejar **en silencio**,
 * sin que falle nada visible.
 */
export const API_ORIGIN = 'https://api.fin-scope.app';
