import { ApplicationConfig, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideServiceWorker } from '@angular/service-worker';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withInterceptors([authInterceptor])),
    // El trabajador de servicio es lo que convierte la aplicación en instalable: cachea el
    // armazón —index, estilos y bundles— para que abra al instante y sin conexión.
    //
    // Desactivado en desarrollo a propósito: una caché que sirve la versión anterior de los
    // bundles mientras se recompila es la peor forma posible de perder una tarde.
    //
    // Se registra cuando la aplicación queda estable, y no antes: descargar el armazón
    // entero compite con las primeras peticiones a la API, y esas son las que el usuario
    // está esperando. Los 30 segundos son el tope por si nunca llega a estabilizarse.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
