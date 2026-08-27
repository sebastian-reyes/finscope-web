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

`proxy.conf.json` reenvía `/auth`, `/categories`, `/tags`, `/shops`, `/transactions` y
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
