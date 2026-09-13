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

## Monedas

Un movimiento se guarda **en la moneda en la que ocurrió** y no se convierte nunca: cien
dólares son cien dólares el día que se registran y el día que se consultan. Hay dos
admitidas, `PEN` y `USD`, y **`PEN` es la base**: la que se asume cuando no se indica ninguna
y la única que no lleva tipo de cambio, porque no se convierte a sí misma.

Al registrar fuera de la base hace falta el **tipo de cambio de ese día**, que se guarda
junto al movimiento y no participa en ningún cálculo: es memoria de aquel día, de modo que
cuando el cambio suba, la compra de agosto seguirá valiendo lo que valió. Editar un
movimiento no lo recalcula.

**No hay que teclearlo en cada movimiento.** Al elegir la moneda se propone el último que se
usó en ella, sacado del propio historial —la tasa que el banco aplicó de verdad la última
vez, no la de ninguna fuente externa—, y el campo dice de cuándo es para que una de hace dos
semanas no se dé por buena sin mirarla. Registrar en dólares cuesta entonces lo mismo que en
soles: el campo viene puesto y basta con confirmarlo. De eso se ocupa
`core/exchange-rate.service.ts`, que pregunta una sola vez por moneda y se actualiza solo al
guardar.

**Ningún total suma monedas distintas.** El balance del inicio y los del historial enseñan
una cifra por moneda, y el reparto y la evolución llevan un selector, porque un anillo que
mezclara soles con dólares repartiría porcentajes de una cantidad que no existe. Con una
sola moneda —lo normal— no aparece ningún selector y todo se ve como siempre.

**El presupuesto también es de una moneda**, y por eso una categoría puede tener dos planes
en el mismo mes: S/ 100 y además $ 30. Cada uno cuenta solo lo gastado en su moneda, así que
**un gasto en dólares no consume el presupuesto en soles**, sino el que esa categoría tenga
en dólares. Convertirlo haría que el avance de la barra dependiera del día en que se mira.

**El movimiento fijo lleva moneda pero no tipo de cambio.** No es un olvido: un fijo se da de
alta hoy y se confirma dentro de meses, así que el cambio es el del día en que se pague y se
pide al confirmarlo —propuesto con el último que usaste, como en cualquier movimiento—. Eso
es además lo que permite calcular lo comprometido sin convertir nada: cada presupuesto suma
los fijos de su moneda.

Desde el inicio, un fijo en dólares se marca como pagado con la última tasa conocida. Si
todavía no hay ninguna, esa tarjeta manda a la pantalla de fijos, que es donde se puede
escribir: una tarjeta de un toque no tiene dónde pedirla.

Añadir una moneda —EUR, por ejemplo— es ampliar el enum `Currency` del contrato, la
restricción equivalente de la base y la tabla de símbolos de `core/format/money.ts`.

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
la baldosa —el cuadrado redondeado, sin sombra ni margen—, **la lleva a los colores de la
aplicación** y con ella genera el favicon, los iconos normales, los enmascarables —con el
fondo hasta el borde, que la forma la recorta el sistema—, el de iOS y la marca suelta. Los
binarios están versionados, así que el script solo hace falta cuando cambie el icono.

El recoloreado no es un capricho. El arte vino en azul marino y verde azulado, que se parecen
a los de la aplicación pero no son los mismos, y esa distancia corta es justo la que se nota:
dos azules casi iguales uno al lado del otro se leen como un error, no como una familia.

La baldosa pasa al degradado de `$fs-brand-strong` a `$fs-brand-deep`, los dos escalones
hondos de la marca. No lleva `$fs-brand`, el azul de los botones, y la razón es de contraste:
ese azul está al 44 % de luz y el verde de la aplicación al 27 %, así que una barra verde
encima se difumina —1,1 de contraste, prácticamente invisible—. El dibujo original funciona
porque su fondo es muy oscuro y deja sitio al verde; con el fondo hondo se conserva esa
holgura sin salirse de la paleta.

A las barras se les pone el tono de `$fs-income` y se les reasigna la luz a una banda del
36 % al 62 %, respetando el orden entre ellas para que conserven su degradado. La luz no se
conserva tal cual porque la del dibujo llegaba a la menta —78 %— y en la aplicación no hay
ningún verde por encima del 40 %: era eso, y no el tono, lo que hacía que el icono no
pareciera de la casa.

Un detalle que costó encontrar: solo cuenta como dibujo lo que tiene más luz que el fondo.
Las sombras que el dibujo lleva debajo son más oscuras, y sin esa condición entraban como
dibujo y se pintaban del color del trazo, lo que dejaba un halo pálido rodeando la lupa.

La marca suelta (`icons/logo-light.png` y `logo-dark.png`) es el dibujo sin su baldosa, y es
lo que firma la aplicación por dentro: barra superior y acceso. Va en dos versiones porque el
trazo del original es blanco —en claro se pinta con `$fs-brand-strong` y las barras bajan de
luz para leerse sobre papel—, y la elige la plantilla según el tema resuelto. La
baldosa entera se queda para lo que es de verdad: el icono del sistema. Dentro de una barra
blanca era el bloque más oscuro de la pantalla.

El margen del original no se conserva a propósito: puesto, en la pestaña el dibujo se
quedaba en nada. El master manda además en lo finos que salen los tamaños grandes; el que
hay mide 256 px y su baldosa 194, de modo que 384 y 512 se amplían. Sustituyéndolo por el
mismo dibujo a 1024 px y volviendo a ejecutar, salen nítidos sin tocar nada más.
