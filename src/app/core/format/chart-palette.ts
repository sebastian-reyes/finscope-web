/**
 * Colores de los gráficos.
 *
 * No se leen de las variables CSS porque Chart.js pinta sobre un canvas y necesita valores
 * resueltos. Cada paleta se comprobó contra su propio fondo para daltonismo y contraste, y
 * la oscura no es la clara aclarada: sobre fondo oscuro las mismas parejas dejan de
 * distinguirse, así que se re-escalonaron hasta pasar la comprobación.
 *
 * Aun así, ningún gráfico se apoya solo en el color: la serie de evolución lleva leyenda y
 * el desglose por tag rotula cada porción con su nombre.
 *
 * El ingreso y el egreso son los mismos valores que `$fs-income` y `$fs-expense`, copiados a
 * mano por lo dicho arriba. Si allí cambian, aquí también: la línea de ingresos de la serie y
 * la cifra del balance son el mismo dato y no pueden salir de dos verdes distintos.
 */

/**
 * Colores de las porciones del desglose por tag, en orden fijo.
 *
 * El primero es el azul de marca, que bajó de tono con ella. El tercero se queda en el verde
 * de antes y no sigue al ingreso hasta el verde azulado del icono, aunque sea el mismo hueco
 * de la lista: aquí el trabajo del color no es significar «entra dinero» sino distinguirse de
 * los otros cinco, y simulado en deuteranopía ese verde azulado se junta con el magenta —3,4
 * de distancia, contra los 10,9 que deja el verde actual—. Es decir, lo que conviene a la
 * cifra del balance perjudica a una porción de tarta, y no son la misma decisión.
 *
 * Con el azul hondo la paleta mejora por los dos lados: la peor pareja pasa de 17,6 a 24,4 en
 * visión normal, y de 7,2 a 10,9 en deuteranopía, porque el azul claro y el morado eran los
 * que se confundían.
 */
const CATEGORICAL_LIGHT = [
  '#1c4894',
  '#c9741a',
  '#0f7b54',
  '#6d5bc4',
  '#8a7100',
  '#b0356f',
] as const;

const CATEGORICAL_DARK = [
  '#5f8fdd',
  '#c47e30',
  '#2f9e73',
  '#9080e0',
  '#ab9430',
  '#d46a94',
] as const;

/** Cuántas porciones se dibujan antes de agrupar el resto. */
export const MAX_SLICES = CATEGORICAL_LIGHT.length - 1;

/** Gris del grupo «Otros», que no es una categoría más sino la suma de las pequeñas. */
const OTHER_LIGHT = '#98a1ae';
const OTHER_DARK = '#5c6675';

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

const LIGHT: ChartPalette = {
  income: '#0d7760',
  expense: '#c0392e',
  categorical: CATEGORICAL_LIGHT,
  other: OTHER_LIGHT,
  grid: '#e4e8ee',
  ink: '#131a24',
  inkMuted: '#5b6675',
  surface: '#ffffff',
};

const DARK: ChartPalette = {
  income: '#29997f',
  expense: '#e06055',
  categorical: CATEGORICAL_DARK,
  other: OTHER_DARK,
  grid: '#232c42',
  ink: '#e9edf2',
  inkMuted: '#a3acb9',
  surface: '#141b2c',
};

/**
 * Devuelve la paleta del tema en curso.
 *
 * @param theme aspecto resuelto de la aplicación
 * @return los colores con los que dibujar
 */
export function chartPalette(theme: 'light' | 'dark'): ChartPalette {
  return theme === 'dark' ? DARK : LIGHT;
}
