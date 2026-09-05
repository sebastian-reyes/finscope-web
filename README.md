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
- **Tras desplegar, la versión nueva no entra sola: hay que activarla.** El trabajador
  sirve lo cacheado y descarga lo nuevo por detrás, pero la pestaña abierta se queda en la
  versión con la que arrancó —y en una aplicación instalada eso puede durar días—. De eso se
  ocupa `core/app-update.service.ts`: pregunta por versiones nuevas al abrir, cada cuarto de
  hora y cada vez que se vuelve a la aplicación, y cuando hay una lista enciende el aviso
  «Hay una versión nueva» con su botón. La recarga no se hace sola a propósito: puede haber
  una hoja de registro a medio rellenar.

El original de la marca es `tools/brand/icon-master.png`: el arte tal y como vino, con su
aire y su sombra alrededor. De ahí sale todo lo demás con `tools/make-icons.py`, que recorta
la baldosa —el cuadrado redondeado, sin sombra ni margen— y con ella genera el favicon, los
iconos normales, los enmascarables —con el fondo hasta el borde, que la forma la recorta el
sistema—, el de iOS y la marca suelta. Los binarios están versionados, así que el script
solo hace falta cuando cambie el icono.

La marca suelta (`icons/logo-light.png` y `logo-dark.png`) es el dibujo sin su baldosa, y es
lo que firma la aplicación por dentro: barra superior y acceso. Va en dos versiones porque el
trazo del original es blanco —en claro se pinta con el navy del propio icono y las barras
bajan de luz para leerse sobre papel—, y la elige la plantilla según el tema resuelto. La
baldosa entera se queda para lo que es de verdad: el icono del sistema. Dentro de una barra
blanca era el bloque más oscuro de la pantalla.

El margen del original no se conserva a propósito: puesto, en la pestaña el dibujo se
quedaba en nada. El master manda además en lo finos que salen los tamaños grandes; el que
hay mide 256 px y su baldosa 194, de modo que 384 y 512 se amplían. Sustituyéndolo por el
mismo dibujo a 1024 px y volviendo a ejecutar, salen nítidos sin tocar nada más.
