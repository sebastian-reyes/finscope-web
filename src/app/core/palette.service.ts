import { Injectable, computed, effect, inject, linkedSignal } from '@angular/core';
import { AuthService } from './auth.service';
import { ThemeService } from './theme.service';
import { PreferenceOwner, clearPreference, readPreference, writePreference } from './preferences';
import { ColorRamp, NeutralRamp, buildNeutrals, buildRamp, normalizeHex } from './format/color';
import { ChipColors, chipPalette } from './format/chip-palette';
import { ChartPalette, chartPalette } from './format/chart-palette';
import { markDataUrl } from './format/logo-mark';

const COLORS_KEY = 'finscope.colors';

/** El azul de siempre: frío, deliberadamente ajeno al verde y al rojo del dinero. */
export const DEFAULT_PRIMARY = '#2a5cb8';

/** El verde de las barras del icono, que es lo que hasta ahora acompañaba al azul. */
export const DEFAULT_SECONDARY = '#1f9e6a';

/** La pareja de colores con la que se pinta la aplicación. */
export interface BrandColors {
  /** Lo que manda: botones, enlaces, lo que está activo. */
  primary: string;
  /** Lo que acompaña: las barras del icono y los degradados grandes. */
  secondary: string;
}

/** Un color de la lista corta, con el nombre por el que se le pide en voz alta. */
export interface ColorPreset {
  name: string;
  hex: string;
}

/**
 * La lista corta de colores.
 *
 * Están repartidos por la rueda a distancias parecidas para que dos seguidos no se
 * confundan, y todos con croma alto: el servicio ya se encarga de bajarles la claridad
 * hasta que se lean, pero la saturación que se pierda no la recupera nadie. Aun así el
 * selector de color de al lado admite cualquier otro; esto es un atajo, no una jaula.
 */
export const COLOR_PRESETS: readonly ColorPreset[] = [
  { name: 'Azul', hex: '#2a5cb8' },
  { name: 'Índigo', hex: '#4f46e5' },
  { name: 'Violeta', hex: '#7c3aed' },
  { name: 'Magenta', hex: '#c026a3' },
  { name: 'Frambuesa', hex: '#e11d5e' },
  { name: 'Teja', hex: '#e2542c' },
  { name: 'Ámbar', hex: '#d9930b' },
  { name: 'Verde', hex: '#1f9e6a' },
  { name: 'Turquesa', hex: '#0d9488' },
  { name: 'Cian', hex: '#0891b2' },
  { name: 'Pizarra', hex: '#546279' },
];

/**
 * Los colores de la aplicación, elegidos por quien la usa.
 *
 * Sobre el tema no manda: claro y oscuro siguen siendo cosa de `ThemeService`. Lo que hace
 * es tomar dos colores y derivar de cada uno la escala entera —el macizo, el hover, el
 * tinte, el fondo del degradado y lo que se escribe encima— y publicarla como variables en
 * el documento, por encima de las que trae la hoja de estilos. La derivación depende del
 * tema, así que se rehace cuando el tema cambia: el mismo azul necesita ser más claro sobre
 * papel oscuro para seguir leyéndose.
 *
 * La elección se guarda en el navegador y no en el perfil, igual que el tema: el contrato no
 * tiene dónde ponerla y es una decisión de cómo se ve la aplicación, no un dato de la cuenta.
 * Eso sí, **a nombre de quien la elige**: cerrar sesión no vacía el `localStorage`, y con una
 * clave suelta la siguiente persona que entrara en el mismo navegador heredaba sus colores.
 * Sin sesión no hay nada guardado que leer, así que la pantalla de acceso sale siempre con
 * los de fábrica, que es lo que le corresponde: no es de nadie todavía.
 *
 * Lo que no arregla esto es viajar entre dispositivos; para eso haría falta subirlo al perfil,
 * con su cambio de contrato y su migración.
 */
@Injectable({ providedIn: 'root' })
export class PaletteService {
  private readonly theme = inject(ThemeService);
  private readonly auth = inject(AuthService);

  /** De quién son los colores que se están leyendo. Cambia al entrar y al salir. */
  private readonly owner = computed<PreferenceOwner>(() => this.auth.user()?.id ?? null);

  private readonly colorsSignal = linkedSignal({
    source: this.owner,
    computation: (owner: PreferenceOwner) => readStoredColors(owner),
  });

  readonly colors = this.colorsSignal.asReadonly();
  readonly primary = computed(() => this.colorsSignal().primary);
  readonly secondary = computed(() => this.colorsSignal().secondary);

  /** Si sigue puesta la pareja de fábrica, que es lo único que hace ofrecer restablecerla. */
  readonly isDefault = computed(
    () =>
      this.colorsSignal().primary === DEFAULT_PRIMARY &&
      this.colorsSignal().secondary === DEFAULT_SECONDARY,
  );

  /**
   * Las dos escalas ya derivadas para el tema en curso.
   * Se exponen porque la pantalla de ajustes enseña una vista previa y necesita los mismos
   * tonos que acaban en las variables, no una aproximación.
   */
  readonly ramps = computed<Palette>(() => {
    const theme = this.theme.resolved();
    const { primary, secondary } = this.colorsSignal();
    return {
      brand: buildRamp(primary, theme),
      accent: buildRamp(secondary, theme),
      // Los grises también son del principal: llevar solo los botones al color elegido y
      // dejar el papel donde estaba deja la sensación de que no ha cambiado nada.
      neutrals: buildNeutrals(primary, theme),
      chips: chipPalette(primary, theme),
    };
  });

  /**
   * Los colores de los gráficos.
   * Van aparte de {@link ramps} y no como una variable más porque Chart.js pinta sobre un
   * lienzo: no resuelve `var(--fs-...)`, hay que darle hexadecimales.
   */
  readonly chart = computed<ChartPalette>(() => {
    const { primary, secondary } = this.colorsSignal();
    return chartPalette(this.theme.resolved(), primary, secondary);
  });

  constructor() {
    effect(() => this.apply(this.ramps(), this.theme.resolved()));
  }

  /**
   * Cambia uno de los dos colores o los dos.
   * Lo que no sea un hexadecimal de color se ignora en vez de romper la paleta: el campo de
   * color del navegador siempre manda uno válido, pero el valor guardado puede venir de una
   * versión anterior o de un `localStorage` editado a mano.
   *
   * @param colors los colores a cambiar
   */
  set(colors: Partial<BrandColors>): void {
    const next: BrandColors = {
      primary: normalizeHex(colors.primary ?? '') ?? this.colorsSignal().primary,
      secondary: normalizeHex(colors.secondary ?? '') ?? this.colorsSignal().secondary,
    };
    this.colorsSignal.set(next);
    writePreference(COLORS_KEY, this.owner(), JSON.stringify(next));
  }

  /** Devuelve la aplicación a sus colores de fábrica. */
  reset(): void {
    this.colorsSignal.set({ primary: DEFAULT_PRIMARY, secondary: DEFAULT_SECONDARY });
    clearPreference(COLORS_KEY, this.owner());
  }

  /**
   * Escribe las escalas en el documento y reteñe el icono de la pestaña.
   *
   * @param ramps las dos escalas derivadas
   * @param theme aspecto en curso, que decide el fondo de la baldosa del favicon
   */
  private apply(ramps: Palette, theme: 'light' | 'dark'): void {
    const style = document.documentElement.style;
    writeRamp(style, 'brand', ramps.brand);
    writeRamp(style, 'accent', ramps.accent);
    writeNeutrals(style, ramps.neutrals);
    writeChips(style, ramps.chips);
    // El anillo de foco es el único que no sale de la escala: lleva la opacidad dentro, así
    // que se compone aquí en vez de dejar tres variables sueltas para armarlo en CSS.
    style.setProperty(
      '--fs-focus-tint',
      `0 0 0 3px rgba(${ramps.brand.rgb}, ${theme === 'dark' ? 0.24 : 0.16})`,
    );

    updateFavicon(ramps.brand.base, ramps.accent.base, theme === 'dark' ? '#171d25' : '#ffffff');
  }
}

/** Todo lo que la elección del usuario decide, ya derivado para el tema en curso. */
export interface Palette {
  brand: ColorRamp;
  accent: ColorRamp;
  neutrals: NeutralRamp;
  chips: ChipColors[];
}

/** Publica una escala como las cinco variables que consume la hoja de estilos. */
function writeRamp(style: CSSStyleDeclaration, name: 'brand' | 'accent', ramp: ColorRamp): void {
  style.setProperty(`--fs-${name}`, ramp.base);
  style.setProperty(`--fs-${name}-strong`, ramp.strong);
  style.setProperty(`--fs-${name}-tint`, ramp.tint);
  style.setProperty(`--fs-${name}-deep`, ramp.deep);
  style.setProperty(`--fs-${name}-rgb`, ramp.rgb);
  style.setProperty(`--fs-on-${name}`, ramp.on);
}

/**
 * Publica los papeles, las líneas y las tintas.
 *
 * Es lo que hace que la página entera cambie de color y no solo lo que se pulsa: el fondo,
 * las tarjetas, los separadores y hasta el gris de un texto secundario llevan una pizca del
 * tono elegido. La diferencia entre teñir un botón y teñir la aplicación está aquí.
 */
function writeNeutrals(style: CSSStyleDeclaration, neutrals: NeutralRamp): void {
  style.setProperty('--fs-paper', neutrals.paper);
  style.setProperty('--fs-surface', neutrals.surface);
  style.setProperty('--fs-surface-sunken', neutrals.sunken);
  style.setProperty('--fs-surface-lift', neutrals.lift);
  style.setProperty('--fs-line', neutrals.line);
  style.setProperty('--fs-line-strong', neutrals.lineStrong);
  style.setProperty('--fs-ink', neutrals.ink);
  style.setProperty('--fs-ink-muted', neutrals.inkMuted);
  style.setProperty('--fs-ink-faint', neutrals.inkFaint);
}

/**
 * Publica las ocho fichas.
 *
 * Van numeradas y no con nombre porque {@link ./format/icons#paletteVariant} reparte por
 * índice: la hoja de estilos define `.fs-chip--3` y aquí se escribe `--fs-chip-3-bg`, que es
 * de donde esa clase lo lee.
 */
function writeChips(style: CSSStyleDeclaration, chips: ChipColors[]): void {
  chips.forEach((chip, index) => {
    style.setProperty(`--fs-chip-${index}-bg`, chip.bg);
    style.setProperty(`--fs-chip-${index}-ink`, chip.ink);
  });
}

/**
 * Repinta el icono de la pestaña con los colores en curso.
 *
 * El enlace se crea si no está y se reutiliza si ya está, porque añadir uno nuevo en cada
 * cambio dejaría la cabecera llena de iconos viejos y el navegador eligiendo el último por
 * su cuenta. El `favicon.ico` del `index` se queda como está: es el respaldo para quien no
 * sepa leer SVG, y ahí el color no puede seguir a nadie.
 */
function updateFavicon(primary: string, secondary: string, background: string): void {
  let link = document.querySelector<HTMLLinkElement>('link#fsFavicon');
  if (!link) {
    link = document.createElement('link');
    link.id = 'fsFavicon';
    link.rel = 'icon';
    link.type = 'image/svg+xml';
    document.head.appendChild(link);
  }
  link.href = markDataUrl(primary, secondary, background);
}

/** Lee la pareja de un usuario, cayendo a la de fábrica ante cualquier cosa rara. */
function readStoredColors(owner: PreferenceOwner): BrandColors {
  const fallback: BrandColors = { primary: DEFAULT_PRIMARY, secondary: DEFAULT_SECONDARY };
  const stored = readPreference(COLORS_KEY, owner);
  if (!stored) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(stored) as Partial<BrandColors>;
    return {
      primary: normalizeHex(parsed.primary ?? '') ?? fallback.primary,
      secondary: normalizeHex(parsed.secondary ?? '') ?? fallback.secondary,
    };
  } catch {
    return fallback;
  }
}
