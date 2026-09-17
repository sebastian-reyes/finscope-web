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
 * Por debajo de este contraste la letra ya no se distingue del fondo. Es el mínimo de WCAG
 * para texto grande y controles; se acepta solo cuando el mismo tono no llega a AA, porque
 * pasar a negro o blanco quitaría justo lo que se eligió: el color.
 */
const READABLE = 3;

/**
 * Un negro, o un gris casi negro sin color. Es el único caso en que la letra va en blanco:
 * no hay un tono que oscurecer, y un gris más oscuro que el negro no existe.
 */
const NEAR_BLACK_LIGHTNESS = 0.3;
const ACHROMATIC_CHROMA = 0.03;

/** Cuánto más oscura empieza a buscarse la letra: lo justo para que se note la diferencia. */
const INK_STEP = 0.15;

/**
 * Claridades por debajo de las cuales una letra oscura ya parece negra. La de AA es algo más
 * exigente: si para llegar a AA hay que bajar tanto, se prefiere un contraste menor con color.
 */
const BLACKISH_AA = 0.3;
const BLACKISH = 0.25;

/**
 * Resuelve una ficha de color libre.
 *
 * Sigue la misma idea que las ocho fichas de la paleta: **la letra es el mismo color que la
 * ficha, más oscuro**. Se conserva el tono y la saturación y solo se baja la claridad, y de
 * todas las claridades que se leen se toma la más clara, que es la que más color conserva:
 * sobre un ámbar, un ámbar tostado; sobre un rosa, un granate.
 *
 * El orden de búsqueda es el de lo que más se parece a lo pedido:
 * 1. el mismo tono más oscuro que llegue a AA, si no queda casi negro;
 * 2. el mismo tono más oscuro que al menos se lea bien. Un rojo o un verde saturados solo
 *    llegan a AA con una versión de sí mismos que ya parece negra; con 3:1 se quedan en granate
 *    y en verde botella, que es lo que se eligió;
 * 3. si incluso eso sería casi negro —un azul o un violeta medios— o el fondo ya es oscuro, el
 *    mismo tono más claro: un celeste sobre azul se lee y sigue siendo azul;
 * 4. negro o blanco, solo si nada de lo anterior se lee.
 *
 * El negro —y los grises casi negros sin color— son la excepción: llevan letra blanca.
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
  const { l, c, h } = toOklch(bg);
  const edge = papers.some((paper) => contrast(bg, paper) < EDGE_CONTRAST);

  if (l < NEAR_BLACK_LIGHTNESS && c < ACHROMATIC_CHROMA) {
    return { bg, ink: '#ffffff', edge };
  }

  const shade = (lightness: number) => toHexFromOklch({ l: lightness, c, h });
  const darker = (minimum: number) => {
    for (let target = l - INK_STEP; target >= 0.1; target -= 0.01) {
      const candidate = shade(target);
      if (contrast(bg, candidate) >= minimum) {
        return candidate;
      }
    }
    return null;
  };
  const lighter = (minimum: number) => {
    for (let target = l + INK_STEP; target <= 0.99; target += 0.01) {
      const candidate = shade(target);
      if (contrast(bg, candidate) >= minimum) {
        return candidate;
      }
    }
    return null;
  };

  // Una letra oscura por debajo de esta claridad ya se lee como negra, que es justo lo que no
  // se quiere: se acepta solo si no hay nada mejor.
  const colored = (ink: string | null, floor: number) =>
    ink && toOklch(ink).l >= floor ? ink : null;
  const readableDark = darker(READABLE);

  const ink =
    colored(darker(AA), BLACKISH_AA) ??
    colored(readableDark, BLACKISH) ??
    lighter(AA) ??
    lighter(READABLE) ??
    readableDark ??
    (contrast(bg, '#000000') >= contrast(bg, '#ffffff') ? '#000000' : '#ffffff');

  return { bg, ink, edge };
}
