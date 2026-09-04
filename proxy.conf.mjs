/**
 * Proxy del servidor de desarrollo.
 *
 * La aplicación y la API comparten origen mientras se desarrolla, y ahí hay un choque: hay
 * direcciones que son a la vez una pantalla y un recurso. `/transactions` es la pantalla del
 * historial y también el listado de la API; lo mismo `/categories` y `/tags`.
 *
 * Navegando dentro de la aplicación no se nota, porque el router cambia la dirección sin
 * pedirle nada al servidor. Pero al recargar con F5 —o al abrir un enlace directo— el
 * navegador sí pide ese documento, el proxy se lo lleva a la API, y esta contesta lo único
 * que puede contestar a una petición sin credenciales: un 401. En la pantalla aparecía el
 * JSON del error en crudo, que parecía una sesión caducada y no lo era.
 *
 * De ahí el desvío: lo que el navegador pide como página se queda en el servidor de
 * desarrollo, que devuelve la aplicación y deja que el router resuelva la dirección. Todo lo
 * demás —que es lo que pide `HttpClient`, y nunca pide `text/html`— sigue yendo a la API.
 *
 * En producción esto no existe: la aplicación la sirve un estático con su reserva a
 * `index.html` y la API vive en otro sitio.
 */

const target = 'http://localhost:9090';

/**
 * Prefijos que atiende la API.
 *
 * Esta lista hay que ampliarla con cada recurso nuevo. Si falta uno, el servidor de
 * desarrollo se queda la petición y contesta `index.html`, de modo que `HttpClient` recibe
 * un documento donde esperaba JSON y falla con «Unexpected token '<'». Es un fallo que solo
 * aparece con `ng serve` —en producción la API vive en otro origen y no hay proxy— y que no
 * lo ve ninguna prueba, porque en ellas la API está simulada.
 */
const paths = [
  '/auth',
  '/budgets',
  '/categories',
  '/recurring-transactions',
  '/tags',
  '/shops',
  '/transactions',
  '/transaction-types',
];

/**
 * Decide si una petición se queda en el servidor de desarrollo en lugar de ir a la API.
 *
 * @param {{ headers: Record<string, string | undefined> }} request petición entrante
 * @return {string | undefined} la página a servir, o nada para que siga a la API
 */
function bypass(request) {
  const accept = request.headers.accept ?? '';
  return accept.includes('text/html') ? '/index.html' : undefined;
}

export default Object.fromEntries(
  paths.map((path) => [path, { target, secure: false, changeOrigin: true, bypass }]),
);
