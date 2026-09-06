import { Swatch, hueOf, swatchHex } from './color';

/**
 * Los colores de las fichas de categoría y de tag.
 *
 * Son ocho parejas de fondo y tinta que `paletteVariant()` reparte por el nombre, de forma
 * que la misma categoría se ve siempre igual sin guardar nada. Aquí no se eligen colores
 * nuevos: son **los mismos de siempre**, medidos y guardados por su distancia en grados al
 * azul de la marca. Elegir otro color principal gira la rueda entera, así que las ocho
 * fichas siguen tan separadas entre sí como estaban —que es lo único que las hace
 * distinguibles— pero la familia entera pasa a ser de la casa.
 *
 * Como el nombre de la ficha siempre se lee completo, esto decora pero no informa: dos
 * categorías que caigan en la misma variante no confunden a nadie.
 */

/** Cuántas variantes reparte {@link ./icons#paletteVariant}. */
export const CHIP_VARIANTS = 8;

/** Fondo y tinta de una ficha, ya resueltos. */
export interface ChipColors {
  bg: string;
  ink: string;
}

const LIGHT_BG: readonly Swatch[] = [
  { l: 0.948, c: 0.019, dh: 5 },
  { l: 0.95, c: 0.015, dh: 263 },
  { l: 0.958, c: 0.023, dh: 160 },
  { l: 0.944, c: 0.024, dh: 43 },
  { l: 0.95, c: 0.021, dh: 94 },
  { l: 0.95, c: 0.015, dh: 321 },
  { l: 0.953, c: 0.016, dh: 198 },
  { l: 0.948, c: 0.005, dh: 357 },
];

const LIGHT_INK: readonly Swatch[] = [
  { l: 0.429, c: 0.117, dh: 2 },
  { l: 0.475, c: 0.085, dh: 264 },
  { l: 0.501, c: 0.103, dh: 155 },
  { l: 0.443, c: 0.137, dh: 33 },
  { l: 0.473, c: 0.127, dh: 98 },
  { l: 0.457, c: 0.075, dh: 327 },
  { l: 0.495, c: 0.084, dh: 203 },
  { l: 0.424, c: 0.025, dh: 354 },
];

const DARK_BG: readonly Swatch[] = [
  { l: 0.276, c: 0.049, dh: 4 },
  { l: 0.27, c: 0.028, dh: 272 },
  { l: 0.271, c: 0.025, dh: 160 },
  { l: 0.263, c: 0.046, dh: 33 },
  { l: 0.266, c: 0.036, dh: 89 },
  { l: 0.267, c: 0.027, dh: 319 },
  { l: 0.274, c: 0.028, dh: 201 },
  { l: 0.282, c: 0.015, dh: 351 },
];

const DARK_INK: readonly Swatch[] = [
  { l: 0.787, c: 0.084, dh: 1 },
  { l: 0.771, c: 0.101, dh: 262 },
  { l: 0.77, c: 0.09, dh: 162 },
  { l: 0.743, c: 0.094, dh: 37 },
  { l: 0.746, c: 0.09, dh: 97 },
  { l: 0.75, c: 0.065, dh: 319 },
  { l: 0.788, c: 0.084, dh: 202 },
  { l: 0.747, c: 0.023, dh: 355 },
];

/**
 * Resuelve las ocho fichas contra el color elegido.
 *
 * @param primary color principal, que pone el tono de referencia
 * @param theme aspecto en el que van a verse
 * @return las ocho parejas de fondo y tinta, en el orden de la variante
 */
export function chipPalette(primary: string, theme: 'light' | 'dark'): ChipColors[] {
  const hue = hueOf(primary);
  const backgrounds = theme === 'dark' ? DARK_BG : LIGHT_BG;
  const inks = theme === 'dark' ? DARK_INK : LIGHT_INK;
  return backgrounds.map((background, index) => ({
    bg: swatchHex(background, hue),
    ink: swatchHex(inks[index], hue),
  }));
}
