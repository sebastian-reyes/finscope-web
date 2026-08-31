import { HttpErrorResponse } from '@angular/common/http';
import { ErrorResponse } from './models';
import { environment } from '../../environments/environment';

/**
 * Traduce un fallo HTTP al mensaje que se muestra en pantalla.
 * La API responde siempre con un cuerpo `ErrorResponse` que trae un código estable de
 * negocio, así que se aprovecha ese texto en lugar de inventar uno genérico.
 */
export function describeError(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) {
    return 'Ha ocurrido un error inesperado.';
  }
  // Un 0 es que la petición no llegó a contestarse: ni siquiera hay estado. Qué sugerir
  // depende de dónde corra la aplicación, así que la pista la pone el entorno; en local es
  // que falta arrancar el backend, y desplegada, que el servicio está durmiendo.
  if (error.status === 0) {
    return `No se pudo contactar con la API. ${environment.offlineHint}`;
  }
  const body = error.error as ErrorResponse | null;
  if (body?.message) {
    return body.code ? `${body.message} (${body.code})` : body.message;
  }
  return `Error ${error.status} al llamar a la API.`;
}
