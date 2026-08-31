/**
 * Configuración de producción, la que usa `ng build` (su configuración por defecto).
 *
 * `apiUrl` es el origen del backend desplegado, sin barra final: los servicios lo anteponen
 * a rutas que ya empiezan por `/`. Aquí no hay proxy que valga —la aplicación la sirve un
 * estático y la API vive en otro dominio—, así que la URL tiene que ser absoluta y HTTPS.
 *
 * No es un secreto: se compila dentro del bundle y cualquiera puede leerla. Lo único que
 * hay que hacer al desplegar es sustituirla por la URL real del servicio en Render.
 */
export const environment = {
  production: true,
  apiUrl: 'https://finscope-api-ok2a.onrender.com',
  /**
   * Qué sugerir cuando la petición no llega a contestarse.
   * En Render el plan gratuito duerme el servicio, y la primera petición después de un rato
   * tarda lo que tarde en levantarse; esperar y repetir suele bastar.
   */
  offlineHint: 'Puede estar despertando; inténtalo de nuevo en unos segundos.',
};
