import { Swatch, buildNeutrals, buildRamp, hueOf, swatchHex } from './color';

/**
 * Colores de los gráficos.
 *
 * No se leen de las variables CSS porque Chart.js pinta sobre un canvas y necesita valores
 * resueltos. Antes eran doce hexadecimales escritos a mano, uno por tema; ahora salen de la
 * pareja que haya elegido el usuario, porque un panel donde todo sigue a la marca menos el
 * gráfico —que es lo que más color tiene de la pantalla— se ve a la legua.
 *
 * Lo que no se recalcula es el **reparto**: las seis porciones se guardaron midiendo la
 * paleta que ya estaba comprobada para daltonismo y contraste, cada una por su distancia en
 * grados al azul de la marca. Elegir otro color gira la rueda entera y las distancias se
 * conservan, que es lo que hacía distinguibles a las porciones. La oscura no es la clara
 * aclarada: sobre fondo oscuro las mismas parejas dejan de verse, así que lleva su propio
 * escalonado, también medido del original.
 *
 * Aun así, ningún gráfico se apoya solo en el color: la serie de evolución lleva leyenda y
 * el desglose por tag rotula cada porción con su nombre.
 *
 * El ingreso y el egreso **no** se tocan: son los únicos colores del gráfico que informan en
 * vez de decorar, y un verde y un rojo que cambiaran con el gusto de cada uno dejarían de
 * querer decir lo que dicen en el resto de la aplicación.
 */

/** Las seis porciones, medidas de la paleta original y guardadas por su tono relativo. */
const CATEGORICAL_LIGHT: readonly Swatch[] = [
  { l: 0.493, c: 0.156, dh: 0 },
  { l: 0.64, c: 0.142, dh: 159 },
  { l: 0.517, c: 0.11, dh: 261 },
  { l: 0.542, c: 0.158, dh: 27 },
  { l: 0.556, c: 0.114, dh: 192 },
  { l: 0.528, c: 0.167, dh: 94 },
];

const CATEGORICAL_DARK: readonly Swatch[] = [
  { l: 0.651, c: 0.128, dh: 358 },
  { l: 0.653, c: 0.125, dh: 163 },
  { l: 0.626, c: 0.119, dh: 262 },
  { l: 0.655, c: 0.14, dh: 28 },
  { l: 0.669, c: 0.119, dh: 195 },
  { l: 0.66, c: 0.141, dh: 95 },
];

/** Cuántas porciones se dibujan antes de agrupar el resto. */
export const MAX_SLICES = CATEGORICAL_LIGHT.length - 1;

/** Gris del grupo «Otros», que no es una categoría más sino la suma de las pequeñas. */
const OTHER: Record<'light' | 'dark', Swatch> = {
  light: { l: 0.7, c: 0.017, dh: 0 },
  dark: { l: 0.485, c: 0.019, dh: 0 },
};

/** Semántica del dinero, la misma en el gráfico que en cualquier importe de la aplicación. */
const INCOME = { light: '#0f7b54', dark: '#2f9e73' } as const;
const EXPENSE = { light: '#c0392e', dark: '#e06055' } as const;

/** Paleta completa de un tema, tal y como la consumen los gráficos. */
export interface ChartPalette {
  income: string;
  expense: string;
  categorical: readonly string[];
  other: string;
  grid: string;
  ink: string;
  inkMuted: string;
  surface: string;
}

/**
 * Devuelve la paleta con la que dibujar.
 *
 * @param theme aspecto resuelto de la aplicación
 * @param primary color principal elegido, que pone el tono de la rueda
 * @param secondary color secundario, que ocupa su sitio entre las porciones
 * @return los colores con los que dibujar
 */
export function chartPalette(
  theme: 'light' | 'dark',
  primary: string,
  secondary: string,
): ChartPalette {
  const hue = hueOf(primary);
  const neutrals = buildNeutrals(primary, theme);
  const categorical = (theme === 'dark' ? CATEGORICAL_DARK : CATEGORICAL_LIGHT).map((slice) =>
    swatchHex(slice, hue),
  );

  // Las dos elecciones del usuario entran en el reparto en persona y no como una porción
  // parecida: la primera se queda con el sitio de cabeza —que ya estaba a cero grados de la
  // marca— y la segunda desplaza a la porción de la que menos se distinguiría, que es la
  // única a la que puede quitarle el hueco sin estrechar el reparto.
  categorical[0] = buildRamp(primary, theme).base;
  categorical[nearestSlice(categorical, secondary)] = buildRamp(secondary, theme).base;

  return {
    income: INCOME[theme],
    expense: EXPENSE[theme],
    categorical,
    other: swatchHex(OTHER[theme], hue),
    grid: neutrals.line,
    ink: neutrals.ink,
    inkMuted: neutrals.inkMuted,
    surface: neutrals.surface,
  };
}

/**
 * Cuál de las porciones —salvo la de cabeza— tiene el tono más parecido a un color.
 *
 * @param slices las porciones ya resueltas
 * @param hex el color que busca sitio
 * @return el índice de la porción a la que se parece más
 */
function nearestSlice(slices: readonly string[], hex: string): number {
  const target = hueOf(hex);
  let best = 1;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 1; index < slices.length; index++) {
    // Distancia sobre la rueda: dos tonos a 350 y a 10 grados están a 20, no a 340.
    const distance = Math.abs(((hueOf(slices[index]) - target + 540) % 360) - 180);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}
