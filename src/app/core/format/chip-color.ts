import { contrast, normalizeHex, toHexFromOklch, toOklch } from './color';
import { PALETTE_SIZE, paletteVariant } from './icons';

/**
 * El color elegido para la ficha de una categoría o un tag.
 *
 * La API guarda tres cosas posibles y aquí se interpretan:
 * - nada (nulo): el color se deduce del nombre, como siempre;
 * - `preset-0` … `preset-7`: una de las ocho fichas de la paleta. No es un color sino un
 *   sitio en la rueda, así que sigue girando con el color principal y cambiando con el tema;
 * - `#rrggbb`: un color libre, que se pinta tal cual. La tinta de encima no la elige nadie:
 *   se calcula por contraste, de modo que un negro lleva letra clara y un blanco letra oscura.
 *
 * Para quitar un color elegido hay que mandar `auto`: en un `PATCH` un nulo significa «no lo
 * toques», así que no sirve para borrar.
 */

/** Lo que se manda a la API para devolver la ficha al color deducido del nombre. */
export const CHIP_COLOR_AUTO = 'auto';

/** Contraste mínimo de AA para texto normal, que es lo que lleva una ficha. */
const AA = 4.5;

/**
 * Por debajo de este contraste con el papel, una ficha maciza se funde con la tarjeta: un
 * blanco sobre blanco o un negro sobre el fondo oscuro. Entonces se le pone un filo.
 */
const EDGE_CONTRAST = 1.3;

/** Fondo, tinta y si hace falta filo: una ficha de color libre ya resuelta. */
export interface FreeChipColors {
  bg: string;
  ink: string;
  /** Si el fondo se confunde con el papel y la ficha necesita un borde para verse. */
  edge: boolean;
}

/**
 * Lo que hay que mandar en un `PATCH` para pasar de un color o un icono a otro.
 * Vale para los dos porque siguen la misma regla: nulo es automático y se quita con `auto`.
 *
 * @param saved valor guardado, nulo o ausente si es el automático
 * @param chosen valor elegido en el formulario, nulo para el automático
 * @return el valor a mandar, o `undefined` si no ha cambiado y no hay que mandar nada
 */
export function styleChange(
  saved: string | null | undefined,
  chosen: string | null,
): string | undefined {
  if ((saved ?? null) === chosen) {
    return undefined;
  }
  return chosen ?? CHIP_COLOR_AUTO;
}

/**
 * Lee la posición de una ficha de la paleta.
 *
 * @param color valor guardado
 * @return el índice de 0 a 7, o nulo si no es una ficha de la paleta
 */
export function presetIndex(color: string | null | undefined): number | null {
  const match = /^preset-([0-7])$/.exec(color ?? '');
  return match ? Number(match[1]) : null;
}

/** El valor que se guarda para la ficha de la paleta en esa posición. */
export function presetColor(index: number): string {
  return `preset-${index}`;
}

/**
 * Lee un color libre.
 *
 * @param color valor guardado
 * @return el hexadecimal en minúsculas, o nulo si no es un color libre
 */
export function freeHex(color: string | null | undefined): string | null {
  return color && color.startsWith('#') ? normalizeHex(color) : null;
}

/**
 * Qué ficha de la paleta toca pintar.
 * Si se eligió una, esa; si no, la que reparte el nombre. Un color libre también la
 * necesita: es la que queda debajo mientras el JavaScript todavía no ha puesto la suya.
 *
 * @param name nombre de la categoría o del tag
 * @param color valor guardado
 * @return el índice de la variante
 */
export function chipVariant(name: string, color: string | null | undefined): number {
  return presetIndex(color) ?? paletteVariant(name) % PALETTE_SIZE;
}

/**
 * Resuelve una ficha de color libre.
 *
 * La tinta no es negro ni blanco puros sino el mismo tono del fondo llevado casi al extremo:
 * sobre un amarillo, un ocre muy oscuro; sobre un azul marino, un azul casi blanco. Se lee
 * igual y no parece una pegatina. Solo si ninguna de las dos teñidas llega a AA —pasa con
 * los tonos medios— se recurre a negro o blanco, que siempre llegan.
 *
 * El filo se decide contra los dos papeles sobre los que aparece una ficha, el de la página y
 * el de la tarjeta: basta con que se funda con uno.
 *
 * @param hex color elegido
 * @param papers fondos sobre los que se va a ver
 * @return fondo, tinta y si necesita filo; nulo si el valor no era un color
 */
export function freeChipColors(hex: string, papers: readonly string[]): FreeChipColors | null {
  const bg = normalizeHex(hex);
  if (!bg) {
    return null;
  }
  const { c, h } = toOklch(bg);
  const tinted = [
    toHexFromOklch({ l: 0.25, c: Math.min(c, 0.07), h }),
    toHexFromOklch({ l: 0.985, c: Math.min(c, 0.02), h }),
  ];
  const best = (candidates: string[]) =>
    candidates.reduce((a, b) => (contrast(bg, b) > contrast(bg, a) ? b : a));

  let ink = best(tinted);
  if (contrast(bg, ink) < AA) {
    ink = best(['#000000', '#ffffff']);
  }

  return {
    bg,
    ink,
    edge: papers.some((paper) => contrast(bg, paper) < EDGE_CONTRAST),
  };
}
