import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/** Rutas de la API que no llevan token porque sirven justamente para obtenerlo. */
const PUBLIC_PATHS = ['/auth/register', '/auth/login', '/auth/refresh', '/auth/logout'];

/**
 * Añade el token de acceso a cada petición y cierra la sesión ante un 401.
 * No intenta renovar automáticamente: el token de refresco es de un solo uso y una
 * renovación en paralelo desde varias peticiones invalidaría el par bueno.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  const isPublic = PUBLIC_PATHS.some((path) => request.url.startsWith(path));
  const token = auth.accessToken;
  const authorized =
    isPublic || !token
      ? request
      : request.clone({ setHeaders: { Authorization: `Bearer ${token}` } });

  return next(authorized).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && !isPublic) {
        auth.clearSession();
        router.navigate(['/login'], { queryParams: { expired: true } });
      }
      return throwError(() => error);
    }),
  );
};
