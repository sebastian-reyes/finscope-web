/**
 * La marca de FinScope, en geometría y no en imagen.
 *
 * Antes el icono era un PNG con dos variantes, una por tema, y eso bastaba mientras el
 * color de la aplicación fuera uno solo. Desde que lo elige el usuario ya no: un mapa de
 * bits no se puede reteñir, y tener un archivo por color no es una opción. Así que la lupa
 * pasa a ser un puñado de trazos que se pintan con el color que toque, y de aquí salen sus
 * dos usos: el logotipo de la barra —que resuelve las variables CSS y por tanto sigue al
 * tema sin repintarse— y el favicon, que necesita colores ya resueltos porque acaba
 * empaquetado en un `data:` y fuera del documento.
 *
 * Las medidas están pensadas sobre un lienzo de 64 y no se pueden tocar sueltas: las barras
 * y la flecha están calculadas para caber dentro del aro de la lupa, contando su grosor.
 */

/** El lienzo sobre el que están medidas todas las coordenadas. */
export const MARK_VIEWBOX = '0 0 64 64';

/** El aro de la lupa. El radio es el de la línea media, así que el borde exterior llega a `r + stroke / 2`. */
export const MARK_LENS = { cx: 27, cy: 27, r: 21, stroke: 4.5 } as const;

/**
 * El mango, que arranca dentro del aro a propósito: dibujándolo antes que el círculo, la
 * junta queda tapada y el encuentro no enseña una esquina.
 */
export const MARK_HANDLE = 'M41 41 L55 55';
export const MARK_HANDLE_STROKE = 6.5;

/** Las tres barras del gráfico, apoyadas todas en la misma línea de base. */
export const MARK_BARS = [
  { x: 15, y: 29, width: 7, height: 9 },
  { x: 24.5, y: 25, width: 7, height: 13 },
  { x: 34, y: 20, width: 7, height: 18 },
] as const;

export const MARK_BAR_RADIUS = 1.6;

/** La flecha que sube por encima de las barras, con su punta al final del mismo trazo. */
export const MARK_TREND = 'M13 33 L21 26 L27 30 L39 17 M33 17 L39 17 L39 23';
export const MARK_TREND_STROKE = 3.5;

/** Radio de la baldosa del favicon, proporcional a las que dibuja el sistema operativo. */
const TILE_RADIUS = 14;

/**
 * Escribe la marca como un SVG completo.
 *
 * Lo usa el favicon, que no puede resolver variables CSS: llega hasta el navegador como una
 * cadena dentro de un `data:`, ya fuera del documento y por tanto sin acceso al tema.
 *
 * @param primary color del aro, el mango y la flecha
 * @param secondary color de las barras
 * @param background baldosa de fondo; sin ella el dibujo queda transparente
 * @return el documento SVG, listo para codificar
 */
export function markSvg(primary: string, secondary: string, background?: string): string {
  const tile = background
    ? `<rect width="64" height="64" rx="${TILE_RADIUS}" fill="${background}"/>`
    : '';
  const bars = MARK_BARS.map(
    (bar) =>
      `<rect x="${bar.x}" y="${bar.y}" width="${bar.width}" height="${bar.height}" rx="${MARK_BAR_RADIUS}" fill="${secondary}"/>`,
  ).join('');

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX}">` +
    tile +
    `<g fill="none" stroke="${primary}" stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="${MARK_HANDLE}" stroke-width="${MARK_HANDLE_STROKE}"/>` +
    `</g>` +
    `<circle cx="${MARK_LENS.cx}" cy="${MARK_LENS.cy}" r="${MARK_LENS.r}" fill="none" stroke="${primary}" stroke-width="${MARK_LENS.stroke}"/>` +
    bars +
    `<path d="${MARK_TREND}" fill="none" stroke="${primary}" stroke-width="${MARK_TREND_STROKE}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `</svg>`
  );
}

/**
 * La misma marca como URL lista para un `<link rel="icon">`.
 *
 * Va codificada carácter a carácter y no en base64: el SVG es texto corto y con almohadillas
 * dentro, que son justo lo que rompería el `data:` si se dejaran crudas.
 *
 * @param primary color del aro, el mango y la flecha
 * @param secondary color de las barras
 * @param background baldosa de fondo
 * @return una URL `data:` con el SVG
 */
export function markDataUrl(primary: string, secondary: string, background: string): string {
  return `data:image/svg+xml,${encodeURIComponent(markSvg(primary, secondary, background))}`;
}
