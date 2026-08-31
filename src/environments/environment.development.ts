/**
 * Configuración de desarrollo, la que sustituye a `environment.ts` en `ng serve`, en
 * `ng build --configuration development` y en los tests.
 *
 * `apiUrl` va vacío a propósito: en desarrollo la aplicación y la API comparten origen
 * gracias al proxy del servidor de desarrollo (`proxy.conf.mjs`), que reenvía `/auth`,
 * `/categories`, `/tags`, `/shops`, `/transactions` y `/transaction-types` a
 * `http://localhost:9090`. Anteponer una cadena vacía deja las rutas relativas tal cual y
 * el flujo local sigue siendo el de siempre, sin CORS de por medio.
 */
export const environment = {
  production: false,
  apiUrl: '',
  /** Aquí la causa casi siempre es la de siempre: falta arrancar el backend. */
  offlineHint: '¿Está levantada en http://localhost:9090?',
};
