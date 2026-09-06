/**
 * La copia sin conexión de lo que contesta la API.
 *
 * El trabajador de servicio guarda las respuestas de la API declaradas en `ngsw-config.json`
 * y las devuelve cuando la red falla. Eso es lo que hace que la aplicación instalada sirva
 * de algo en el metro: antes abría y todas las pantallas daban error, porque solo estaba
 * cacheado el armazón.
 *
 * La estrategia es `freshness` en los dos grupos, nunca `performance`: primero se pregunta
 * a la red y solo se tira de la copia si no contesta. En una aplicación de dinero, enseñar
 * un saldo viejo como si fuera el de ahora es peor que no enseñar nada. Por eso el grupo de
 * cifras —movimientos, resúmenes, presupuestos, fijos— **no lleva `timeout`**: solo cae en
 * la copia cuando la red falla de verdad, que es exactamente cuando la aplicación puede
 * avisarlo. El de catálogos —categorías, tags, tipos— sí lo lleva, corto: son nombres e
 * iconos, y que lleguen viejos no engaña a nadie.
 *
 * Aquí no se escribe en la caché; de eso se encarga el trabajador. Lo que vive en este
 * archivo es lo contrario: cómo se vacía.
 */

/**
 * Las cachés del trabajador que guardan respuestas de la API.
 *
 * El nombre completo que arma Angular es `ngsw:<ámbito>:<versión>:data:<grupo>:cache`, y las
 * tablas de control del grupo van en `ngsw:<ámbito>:db:<versión>:data:<grupo>:lru` y `:age`.
 * Lo común a todas es el tramo `:data:`, y es lo que las separa del armazón —que va en
 * `:assets:`— y del control del propio trabajador. Buscar por ese tramo vacía los datos sin
 * tirar la aplicación cacheada, que no tiene nada de personal y volver a descargarla sería
 * gratuito solo con buena conexión.
 */
const API_CACHE = /^ngsw:.*:data:/;

/**
 * Borra lo que la API dejó cacheado.
 *
 * Se llama al cerrar sesión, y también cuando el servidor invalida la sesión por su cuenta.
 * No es limpieza: es lo que impide que la copia sin conexión de una cuenta se le enseñe a la
 * siguiente que entre en el mismo navegador. El trabajador empareja **por dirección**, no
 * por credenciales, así que sin este borrado un `GET /transactions?month=9` guardado por
 * alguien se le serviría a cualquier otro que abriera la aplicación sin red.
 *
 * Nunca lanza: cerrar sesión tiene que terminar aunque el navegador no dé acceso al almacén
 * —una ventana privada, un permiso denegado— o aunque no haya trabajador, como en las
 * pruebas y en desarrollo.
 *
 * @return una promesa que se resuelve cuando no queda copia, o cuando no se pudo borrar
 */
export async function clearCachedApiData(): Promise<void> {
  if (typeof caches === 'undefined') {
    return;
  }
  try {
    const names = await caches.keys();
    await Promise.all(
      names.filter((name) => API_CACHE.test(name)).map((name) => caches.delete(name)),
    );
  } catch {
    // Sin almacén no hay nada que borrar, y desde luego no es motivo para no dejar salir.
  }
}
