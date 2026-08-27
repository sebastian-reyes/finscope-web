import { HttpErrorResponse } from '@angular/common/http';
import { ErrorResponse } from './models';

/**
 * Traduce un fallo HTTP al mensaje que se muestra en pantalla.
 * La API responde siempre con un cuerpo `ErrorResponse` que trae un código estable de
 * negocio, así que se aprovecha ese texto en lugar de inventar uno genérico.
 */
export function describeError(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) {
    return 'Ha ocurrido un error inesperado.';
  }
  if (error.status === 0) {
    return 'No se pudo contactar con la API. ¿Está levantada en http://localhost:9090?';
  }
  const body = error.error as ErrorResponse | null;
  if (body?.message) {
    return body.code ? `${body.message} (${body.code})` : body.message;
  }
  return `Error ${error.status} al llamar a la API.`;
}
