import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/** Rutas de la API que no llevan token porque sirven justamente para obtenerlo. */
const PUBLIC_PATHS = ['/auth/register', '/auth/login', '/auth/refresh', '/auth/logout'];

/**
 * Añade el token de acceso a cada petición y renueva la sesión cuando caduca.
 *
 * El token de acceso vive quince minutos y el de refresco treinta días, así que la sesión
 * larga es la normal: quedarse mirando el historial un rato y luego editar un movimiento
 * caía siempre en un 401, y hasta ahora eso mandaba al acceso aunque el refresco siguiera
 * siendo válido. Ante un 401 se renueva y se repite la petición una sola vez; solo si la
 * renovación falla —refresco caducado o ya consumido— se cierra la sesión de verdad.
 *
 * La renovación en sí la comparte {@link AuthService.refreshOnce}: el token de refresco es
 * de un solo uso y una pantalla lanza varias peticiones a la vez, que caducan todas juntas.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const isPublic = PUBLIC_PATHS.some((path) => request.url.startsWith(path));

  // Cerrar la sesión es idempotente a propósito: varias peticiones caducadas a la vez no
  // deben encadenar varias navegaciones al acceso.
  const expire = (): void => {
    if (!auth.isLoggedIn()) {
      return;
    }
    auth.clearSession();
    router.navigate(['/login'], { queryParams: { expired: true } });
  };

  return next(authorize(request, auth.accessToken, isPublic)).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status !== 401 || isPublic) {
        return throwError(() => error);
      }

      // Sin refresco no hay nada que renovar: la sesión se acabó aquí.
      if (!auth.refreshToken) {
        expire();
        return throwError(() => error);
      }

      return auth.refreshOnce().pipe(
        catchError((failure: unknown) => {
          expire();
          return throwError(() => failure);
        }),
        switchMap((session) =>
          next(authorize(request, session.accessToken, false)).pipe(
            catchError((retried: HttpErrorResponse) => {
              // Un 401 con el token recién estrenado ya no es cosa de la caducidad.
              if (retried.status === 401) {
                expire();
              }
              return throwError(() => retried);
            }),
          ),
        ),
      );
    }),
  );
};

/**
 * Firma la petición con el token, si es que le toca llevarlo.
 *
 * @param request petición tal y como sale de la aplicación
 * @param token   token de acceso en vigor, o nulo si no hay sesión
 * @param isPublic si la ruta es de las que sirven para obtener credenciales
 * @return la petición lista para enviar
 */
function authorize(
  request: HttpRequest<unknown>,
  token: string | null,
  isPublic: boolean,
): HttpRequest<unknown> {
  return isPublic || !token
    ? request
    : request.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}
