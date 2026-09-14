import { API_ORIGIN } from './api-origin';

/**
 * Configuración de producción, la que usa `ng build` (su configuración por defecto).
 *
 * `apiUrl` es el origen del backend desplegado, sin barra final: los servicios lo anteponen
 * a rutas que ya empiezan por `/`. Aquí no hay proxy que valga —la aplicación la sirve un
 * estático y la API vive en otro dominio—, así que la URL tiene que ser absoluta y HTTPS.
 *
 * No es un secreto: se compila dentro del bundle y cualquiera puede leerla.
 *
 * Apunta al dominio propio y no al `.onrender.com` del servicio: así, mudar el backend de
 * sitio es cambiar un registro DNS y no volver a compilar la aplicación --- que, con un
 * trabajador de servicio instalado en los navegadores, tarda en llegar a todo el mundo.
 *
 * **Si cambias el origen, cambia también los `dataGroups` de `ngsw-config.json`.** Ahí van
 * repetidas porque el trabajador de servicio empareja por dirección completa —la API vive en
 * otro origen— y ese archivo es JSON estricto, sin forma de importar nada ni de dejar un
 * comentario. Si las dos se separan, la caché deja de emparejar y la aplicación se queda sin
 * datos sin conexión, en silencio. Eso ya no pasa desapercibido: el origen sale de
 * `api-origin.ts` y `data-cache.spec.ts` comprueba que el manifiesto dice lo mismo.
 */
export const environment = {
  production: true,
  apiUrl: API_ORIGIN,
  /**
   * Qué sugerir cuando la petición no llega a contestarse.
   * En Render el plan gratuito duerme el servicio, y la primera petición después de un rato
   * tarda lo que tarde en levantarse; esperar y repetir suele bastar.
   */
  offlineHint: 'Puede estar despertando; inténtalo de nuevo en unos segundos.',
};
