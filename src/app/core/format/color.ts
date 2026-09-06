/**
 * Aritmética de color para la paleta que elige el usuario.
 *
 * Un color escogido a mano no sirve tal cual: hace falta su versión oscurecida para el
 * hover, su tinte para los fondos suaves y la garantía de que el texto que va encima se
 * lee. Todo eso se calcula aquí y no con `color-mix()` en la hoja de estilos por dos
 * razones: el resultado tiene que cumplir un contraste medido, y los mismos valores los
 * necesita el SVG del icono, que no puede resolver variables CSS al exportarse a favicon.
 *
 * Las mezclas van en OKLCH y no en HSL. En HSL, bajar la luminosidad un 10 % oscurece
 * mucho más un amarillo que un azul, y el mismo tinte queda lavado en un tono y chillón en
 * otro; en OKLCH un paso es un paso se mire el color que se mire. El contraste, en cambio,
 * se mide en sRGB con la fórmula de WCAG, porque es la que define si algo se lee.
 */

/** Color en el espacio cilíndrico OKLCH: claridad, croma y tono. */
export interface Oklch {
  /** Claridad perceptual, de 0 (negro) a 1 (blanco). */
  l: number;
  /** Saturación perceptual. Más allá de ~0.37 ya no hay sRGB que lo represente. */
  c: number;
  /** Tono en grados. */
  h: number;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Contraste mínimo que WCAG pide para texto normal. */
const AA_CONTRAST = 4.5;

/** Cuánto se mueve la claridad en cada tanteo al buscar el contraste. */
const STEP = 0.01;

/**
 * Lee un color escrito en hexadecimal.
 *
 * Acepta las dos formas que un usuario puede teclear —`#abc` y `#aabbcc`— y devuelve nulo
 * ante cualquier otra cosa, que es lo que permite al llamante quedarse con su valor por
 * defecto en vez de pintar la aplicación de negro.
 *
 * @param hex texto a interpretar, con o sin almohadilla
 * @return el color, o nulo si el texto no era un hexadecimal de color
 */
export function parseHex(hex: string): Rgb | null {
  const value = hex.trim().replace(/^#/, '');
  const full =
    value.length === 3
      ? value
          .split('')
          .map((digit) => digit + digit)
          .join('')
      : value;
  if (!/^[0-9a-f]{6}$/i.test(full)) {
    return null;
  }
  return {
    r: parseInt(full.slice(0, 2), 16) / 255,
    g: parseInt(full.slice(2, 4), 16) / 255,
    b: parseInt(full.slice(4, 6), 16) / 255,
  };
}

/**
 * Normaliza un color a `#rrggbb` en minúsculas.
 *
 * Existe porque el valor se guarda entre sesiones y se compara con los predefinidos para
 * marcar cuál está elegido: sin normalizar, `#2A5CB8` y `#2a5cb8` serían dos colores.
 *
 * @param hex texto a normalizar
 * @return el color en forma canónica, o nulo si no era un color
 */
export function normalizeHex(hex: string): string | null {
  const rgb = parseHex(hex);
  return rgb ? toHex(rgb) : null;
}

/** Escribe un color como `#rrggbb`, recortando lo que se salga del rango. */
function toHex({ r, g, b }: Rgb): string {
  const channel = (value: number) =>
    Math.round(Math.min(1, Math.max(0, value)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** Los tres canales en 0–255, que es como los pide `rgba()` en CSS. */
export function toRgbTriplet(hex: string): string {
  const rgb = parseHex(hex) ?? { r: 0, g: 0, b: 0 };
  const channel = (value: number) => Math.round(Math.min(1, Math.max(0, value)) * 255);
  return `${channel(rgb.r)}, ${channel(rgb.g)}, ${channel(rgb.b)}`;
}

/** Quita la corrección gamma de sRGB: de lo que se ve a lo que se puede sumar. */
function toLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
}

/** La vuelta a sRGB, ya con gamma. */
function toGamma(value: number): number {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
}

/**
 * Pasa un color de sRGB a OKLCH.
 *
 * @param hex color de partida
 * @return sus coordenadas en OKLCH, negro si el texto no era un color
 */
export function toOklch(hex: string): Oklch {
  const rgb = parseHex(hex) ?? { r: 0, g: 0, b: 0 };
  const r = toLinear(rgb.r);
  const g = toLinear(rgb.g);
  const b = toLinear(rgb.b);

  const lms = [
    Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b),
    Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b),
    Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b),
  ];

  const l = 0.2104542553 * lms[0] + 0.793617785 * lms[1] - 0.0040720468 * lms[2];
  const a = 1.9779984951 * lms[0] - 2.428592205 * lms[1] + 0.4505937099 * lms[2];
  const bb = 0.0259040371 * lms[0] + 0.7827717662 * lms[1] - 0.808675766 * lms[2];

  const c = Math.hypot(a, bb);
  // Un gris no tiene tono; devolver el ángulo del ruido numérico haría que dos grises
  // idénticos derivaran tintes distintos.
  const h = c < 1e-6 ? 0 : ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360;
  return { l, c, h };
}

/** OKLCH a sRGB, sin comprobar si el color cabe en la gama. */
function toRgbRaw({ l, c, h }: Oklch): Rgb {
  const radians = (h * Math.PI) / 180;
  const a = c * Math.cos(radians);
  const b = c * Math.sin(radians);

  const lms = [
    Math.pow(l + 0.3963377774 * a + 0.2158037573 * b, 3),
    Math.pow(l - 0.1055613458 * a - 0.0638541728 * b, 3),
    Math.pow(l - 0.0894841775 * a - 1.291485548 * b, 3),
  ];

  return {
    r: toGamma(4.0767416621 * lms[0] - 3.3077115913 * lms[1] + 0.2309699292 * lms[2]),
    g: toGamma(-1.2684380046 * lms[0] + 2.6097574011 * lms[1] - 0.3413193965 * lms[2]),
    b: toGamma(-0.0041960863 * lms[0] - 0.7034186147 * lms[1] + 1.707614701 * lms[2]),
  };
}

/** Si los tres canales caben en la pantalla sin recortarse. */
function inGamut({ r, g, b }: Rgb): boolean {
  const ok = (value: number) => value >= -0.001 && value <= 1.001;
  return ok(r) && ok(g) && ok(b);
}

/**
 * Pasa un color de OKLCH a hexadecimal, metiéndolo en la gama de la pantalla si hace falta.
 *
 * Cuando la combinación no existe en sRGB se le baja el croma en vez de recortar los
 * canales: recortar cambia el tono —un rojo saturado y muy claro se vuelve rosa anaranjado
 * al toparse con el techo del canal rojo—, mientras que desaturar solo lo apaga.
 *
 * @param color coordenadas OKLCH
 * @return el color más cercano que la pantalla sabe pintar
 */
export function toHexFromOklch(color: Oklch): string {
  let candidate = { ...color };
  while (candidate.c > 0 && !inGamut(toRgbRaw(candidate))) {
    candidate = { ...candidate, c: Math.max(0, candidate.c - 0.005) };
  }
  return toHex(toRgbRaw(candidate));
}

/** Luminancia relativa según WCAG, que es lo que mide el contraste. */
function luminance(hex: string): number {
  const rgb = parseHex(hex) ?? { r: 0, g: 0, b: 0 };
  return 0.2126 * toLinear(rgb.r) + 0.7152 * toLinear(rgb.g) + 0.0722 * toLinear(rgb.b);
}

/**
 * Contraste entre dos colores, de 1 (iguales) a 21 (negro contra blanco).
 *
 * @param a un color
 * @param b el otro
 * @return la razón de contraste de WCAG
 */
export function contrast(a: string, b: string): number {
  const first = luminance(a);
  const second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/**
 * Ajusta la claridad de un color hasta que se lea sobre un fondo dado.
 *
 * El usuario elige un tono, no un contraste, y hay tonos —un amarillo, un cian— que sobre
 * papel blanco no se ven. En vez de rechazarlos, se les baja la claridad (o se les sube,
 * sobre fondo oscuro) hasta que el texto blanco encima cumpla AA. El tono y el croma se
 * respetan: sigue siendo el color que se pidió, solo que legible.
 *
 * @param color color de partida
 * @param background fondo sobre el que tiene que verse
 * @param bounds hasta dónde se permite mover la claridad
 * @return el mismo color con la claridad justa
 */
function fitContrast(color: Oklch, background: string, bounds: [number, number]): Oklch {
  const darken = luminance(background) > 0.5;
  const [min, max] = bounds;
  let candidate: Oklch = { ...color, l: Math.min(max, Math.max(min, color.l)) };

  // Un tanteo lineal y no una búsqueda binaria: el croma se recorta al entrar en gama, así
  // que el contraste no es del todo monótono y aquí interesa el primer valor que cumple,
  // el más cercano al color elegido.
  for (let i = 0; i < 100; i++) {
    if (contrast(toHexFromOklch(candidate), background) >= AA_CONTRAST) {
      return candidate;
    }
    const next = darken ? candidate.l - STEP : candidate.l + STEP;
    if (next < min || next > max) {
      return { ...candidate, l: darken ? min : max };
    }
    candidate = { ...candidate, l: next };
  }
  return candidate;
}

/** Los tonos derivados de un color elegido, listos para publicarse como variables CSS. */
export interface ColorRamp {
  /** El color tal y como se usa: relleno de botones, iconos, texto de lo activo. */
  base: string;
  /** Un paso más oscuro en claro y más claro en oscuro, para el hover de lo macizo. */
  strong: string;
  /** Casi papel: fondos de pastillas, chips y estados activos suaves. */
  tint: string;
  /** El extremo profundo, solo para degradados grandes como el panel del acceso. */
  deep: string;
  /** Lo que se escribe encima del color macizo. */
  on: string;
  /** Los canales del `base`, para las sombras y anillos que necesitan opacidad. */
  rgb: string;
}

/**
 * Deriva la escala completa de un color elegido por el usuario.
 *
 * La escala del tema oscuro no es la del claro invertida: sobre papel oscuro un azul medio
 * se apaga hasta desaparecer, así que allí el color sube de claridad en vez de bajar, el
 * tinte pasa a ser un fondo oscuro teñido y lo que se escribe encima deja de ser blanco.
 *
 * @param hex color elegido, en hexadecimal
 * @param theme aspecto en el que va a verse
 * @return los tonos derivados
 */
export function buildRamp(hex: string, theme: 'light' | 'dark'): ColorRamp {
  const source = toOklch(hex);
  const dark = theme === 'dark';

  // Los fondos contra los que se mide. Son los mismos papeles que publica la capa base: si
  // allí cambian, aquí también, o el contraste calculado dejaría de ser el real.
  const paper = dark ? '#171d25' : '#ffffff';
  const ink = dark ? '#0f1319' : '#ffffff';

  // En claro el color tiene que leerse con texto blanco encima, así que se mide contra el
  // blanco; en oscuro tiene que leerse él mismo como texto, así que se mide contra el papel.
  const base = dark
    ? fitContrast(source, paper, [0.68, 0.93])
    : fitContrast(source, ink, [0.3, 0.62]);

  return {
    base: toHexFromOklch(base),
    strong: toHexFromOklch({ ...base, l: dark ? Math.min(0.96, base.l + 0.08) : base.l - 0.07 }),
    tint: toHexFromOklch(
      dark
        ? { ...base, l: 0.27, c: Math.min(base.c, 0.05) }
        : { ...base, l: 0.955, c: Math.min(base.c, 0.045) },
    ),
    deep: toHexFromOklch({ ...base, l: dark ? 0.2 : 0.24, c: base.c * 0.55 }),
    on: ink,
    rgb: toRgbTriplet(toHexFromOklch(base)),
  };
}

// --- Colores descritos por su sitio, no por su valor ---------------------------------------

/**
 * Un color definido en relación a un tono de referencia.
 *
 * Existe para que las paletas ya afinadas —las fichas, las porciones del gráfico— no haya
 * que reinventarlas cuando el usuario cambia de color. Cada una se guardó midiendo lo que
 * había: su claridad, su croma y **cuántos grados** se separaba del azul de la marca. Elegir
 * otro color principal no recalcula nada, solo gira la rueda entera, así que las distancias
 * entre las fichas —que es lo que las hace distinguibles— se conservan intactas.
 */
export interface Swatch {
  l: number;
  c: number;
  /** Grados de separación respecto al tono de referencia. */
  dh: number;
}

/**
 * Resuelve un color relativo contra un tono concreto.
 *
 * @param swatch el color, descrito por su sitio
 * @param hue tono de referencia en grados
 * @return el color en hexadecimal
 */
export function swatchHex(swatch: Swatch, hue: number): string {
  return toHexFromOklch({ l: swatch.l, c: swatch.c, h: (hue + swatch.dh + 360) % 360 });
}

/** El tono de un color en grados, que es lo único que se hereda al girar una paleta. */
export function hueOf(hex: string): number {
  return toOklch(hex).h;
}

// --- Neutros ------------------------------------------------------------------------------

/** Los papeles, las líneas y las tintas: todo lo que no es ni marca ni signo. */
export interface NeutralRamp {
  paper: string;
  surface: string;
  sunken: string;
  lift: string;
  line: string;
  lineStrong: string;
  ink: string;
  inkMuted: string;
  inkFaint: string;
}

/**
 * Los neutros medidos sobre el diseño que ya había, con el croma subido lo justo.
 *
 * Que los grises lleven una pizca del tono de la marca no es nuevo: los originales estaban
 * todos a 257 grados, a un paso del azul, y el propio archivo de tokens lo decía —«neutros
 * con una pizca de azul, para que convivan con la marca sin verse sucios»—. Lo único que
 * cambia es de dónde sale ese tono: antes estaba clavado y ahora lo pone el usuario.
 */
const NEUTRALS: Record<'light' | 'dark', Record<keyof NeutralRamp, [number, number]>> = {
  // Cada entrada es [claridad, croma].
  light: {
    paper: [0.966, 0.011],
    surface: [0.996, 0.004],
    sunken: [0.966, 0.011],
    lift: [1, 0],
    line: [0.925, 0.015],
    lineStrong: [0.885, 0.019],
    ink: [0.216, 0.024],
    inkMuted: [0.506, 0.03],
    inkFaint: [0.663, 0.024],
  },
  dark: {
    paper: [0.185, 0.018],
    surface: [0.228, 0.022],
    sunken: [0.185, 0.018],
    lift: [0.254, 0.026],
    line: [0.298, 0.028],
    lineStrong: [0.36, 0.03],
    ink: [0.944, 0.01],
    inkMuted: [0.741, 0.024],
    inkFaint: [0.6, 0.024],
  },
};

/** A partir de qué croma del color elegido los neutros llevan su tinte al completo. */
const FULL_TINT_CHROMA = 0.05;

/**
 * Tiñe los neutros con el tono del color elegido.
 *
 * El tinte se mide en centésimas de croma: lo justo para que un ámbar deje el papel cálido y
 * un violeta lo deje frío, sin que ninguno de los dos llegue a leerse como un color. Si lo
 * elegido es casi gris, el tinte se apaga con él en vez de inventarle un tono al azar: el
 * ángulo de un gris es ruido numérico, y aplicarlo dejaría la aplicación rosa sin motivo.
 *
 * @param hex color principal, del que se toma el tono
 * @param theme aspecto en el que va a verse
 * @return los papeles, las líneas y las tintas
 */
export function buildNeutrals(hex: string, theme: 'light' | 'dark'): NeutralRamp {
  const source = toOklch(hex);
  const strength = Math.min(1, source.c / FULL_TINT_CHROMA);
  const specs = NEUTRALS[theme];
  const resolve = ([l, c]: [number, number]) => toHexFromOklch({ l, c: c * strength, h: source.h });

  return {
    paper: resolve(specs.paper),
    surface: resolve(specs.surface),
    sunken: resolve(specs.sunken),
    lift: resolve(specs.lift),
    line: resolve(specs.line),
    lineStrong: resolve(specs.lineStrong),
    ink: resolve(specs.ink),
    inkMuted: resolve(specs.inkMuted),
    inkFaint: resolve(specs.inkFaint),
  };
}
