# FinScope Web

Panel de pruebas de la API de FinScope. Angular 22 (standalone, señales, sin zone.js) con
Bootstrap 5. No pretende ser la app final: sirve para ver funcionando cada endpoint del
contrato OpenAPI.

## Arrancar

La API debe estar levantada en `http://localhost:9090` (con `JWT_SECRET` en el entorno).

```bash
npm install
npm start          # http://localhost:4200
```

`proxy.conf.mjs` reenvía `/auth`, `/categories`, `/tags`, `/shops`, `/transactions` y
`/transaction-types` al backend, de modo que no hace falta configurar CORS.

## Qué cubre cada pantalla

| Pantalla | Endpoints |
| --- | --- |
| Acceso | `POST /auth/register`, `POST /auth/login` |
| Transacciones | `GET /transactions` con todos los filtros, `POST /transactions`, `DELETE /transactions/{id}` |
| Categorías | `GET /categories`, `GET /categories/tree`, `POST`, `PATCH`, `DELETE` |
| Tags | `GET /tags`, `POST`, `PATCH`, `DELETE` |
| Tiendas | `GET /shops`, `POST`, `PATCH`, `DELETE` |
| Mi cuenta | `GET /auth/me`, `POST /auth/refresh`, `GET /transaction-types` |
| Barra superior | `POST /auth/logout` |

## Cómo está organizado

```
src/app/
  core/          servicios, modelos, interceptor de token y guard de rutas
  shared/        pantalla de CRUD reutilizada por tags y tiendas
  pages/         una carpeta por pantalla, todas cargadas con lazy loading
```

- El token de acceso viaja en la cabecera `Authorization` que pone `auth.interceptor.ts`.
- Un 401 limpia la sesión y devuelve al acceso. **No hay renovación automática**: el token de
  refresco es de un solo uso, y varias peticiones renovando a la vez invalidarían el par bueno.
  La renovación es manual desde *Mi cuenta*.
- Los mensajes de error salen del cuerpo `ErrorResponse` de la API, con su código de negocio.

## Instalable en el móvil

Es una PWA: se instala desde el navegador, sin pasar por ninguna tienda. En el iPhone,
*Compartir → Añadir a pantalla de inicio*; en Android, Chrome lo propone solo.

Son dos piezas. `public/manifest.webmanifest` declara el nombre, los iconos y que se abra
sin barra de direcciones. El trabajador de servicio, configurado en `ngsw-config.json`,
cachea el armazón —index, estilos y todos los bundles—, de modo que la aplicación abre al
instante y sin conexión. Lo que no se cachea son las respuestas de la API: sin red se ve la
interfaz con sus avisos de error, y no un saldo de ayer haciéndose pasar por el de hoy.

Tres cosas que no son evidentes:

- **El trabajador de servicio solo existe en compilaciones de producción**
  (`enabled: !isDevMode()`). Para probarlo hay que compilar y servir el `dist`; con
  `ng serve` no se registra, y es a propósito: una caché que devuelve los bundles de antes
  mientras recompilas es la peor forma posible de perder una tarde.
- **`viewport-fit=cover` en `index.html` sostiene todas las zonas seguras.** Sin él,
  `env(safe-area-inset-*)` vale cero en iOS y la barra inferior acaba bajo la barra de
  gestos. No se toca.
- **Tras desplegar, quien ya la tenga abierta sigue viendo la versión anterior.** El
  trabajador sirve lo cacheado y descarga la nueva por detrás; entra al reabrir la
  aplicación. No es un fallo del despliegue.

Los iconos se generan con `tools/make-icons.py` a partir de los colores de marca. Los PNG
están versionados, así que el script solo hace falta si la marca cambia o aparece un tamaño
nuevo.
