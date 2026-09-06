import { describe, expect, it } from 'vitest';
import { buildRamp, contrast, normalizeHex, toOklch } from './color';

/** El papel sobre el que se mide cada tema, el mismo que publica la capa base. */
const PAPER = { light: '#ffffff', dark: '#171d25' } as const;

/** Colores incómodos a propósito: un amarillo y un cian no se ven sobre blanco, y un azul
 *  marino no se ve sobre negro. Son los que rompen una derivación hecha a ojo. */
const AWKWARD = ['#f2c94c', '#00e5ff', '#0b1f6b', '#ffffff', '#000000', '#808080'];

describe('normalizeHex', () => {
  it('acepta las dos formas que se pueden teclear y las deja iguales', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(normalizeHex('aabbcc')).toBe('#aabbcc');
    expect(normalizeHex('  #AABBCC  ')).toBe('#aabbcc');
  });

  it('devuelve nulo ante lo que no es un color, para que el llamante se quede con el suyo', () => {
    expect(normalizeHex('')).toBeNull();
    expect(normalizeHex('rojo')).toBeNull();
    expect(normalizeHex('#12345')).toBeNull();
  });
});

describe('toOklch', () => {
  it('no le inventa tono a un gris', () => {
    expect(toOklch('#808080').c).toBeLessThan(0.01);
  });

  it('coloca el blanco arriba y el negro abajo de la claridad', () => {
    expect(toOklch('#ffffff').l).toBeCloseTo(1, 2);
    expect(toOklch('#000000').l).toBeCloseTo(0, 2);
  });
});

describe('buildRamp', () => {
  it('deja el color elegido tal cual cuando ya se lee sobre el papel', () => {
    expect(buildRamp('#2a5cb8', 'light').base).toBe('#2a5cb8');
  });

  it.each(AWKWARD)('garantiza que se lea lo que se escribe encima de %s', (hex) => {
    for (const theme of ['light', 'dark'] as const) {
      const ramp = buildRamp(hex, theme);
      expect(contrast(ramp.base, ramp.on)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(AWKWARD)('garantiza que %s se lea como texto sobre el papel de su tema', (hex) => {
    for (const theme of ['light', 'dark'] as const) {
      const ramp = buildRamp(hex, theme);
      expect(contrast(ramp.base, PAPER[theme])).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('respeta el tono elegido aunque tenga que mover la claridad', () => {
    // Un amarillo sobre blanco hay que oscurecerlo mucho para que se lea, y ahí es donde una
    // mezcla en HSL lo convertiría en un marrón de otro tono.
    const chosen = toOklch('#f2c94c');
    const derived = toOklch(buildRamp('#f2c94c', 'light').base);
    expect(Math.abs(derived.h - chosen.h)).toBeLessThan(3);
  });

  it('sube el color en oscuro en vez de bajarlo, que es lo contrario que en claro', () => {
    expect(toOklch(buildRamp('#2a5cb8', 'dark').base).l).toBeGreaterThan(
      toOklch(buildRamp('#2a5cb8', 'light').base).l,
    );
  });

  it('da un tinte casi papel en claro y casi fondo en oscuro', () => {
    expect(toOklch(buildRamp('#2a5cb8', 'light').tint).l).toBeGreaterThan(0.9);
    expect(toOklch(buildRamp('#2a5cb8', 'dark').tint).l).toBeLessThan(0.4);
  });

  it('publica los canales del color base, que es lo que piden las sombras', () => {
    expect(buildRamp('#2a5cb8', 'light').rgb).toBe('42, 92, 184');
  });

  it('no se rompe con lo que no es un color: cae en negro y sigue cumpliendo el contraste', () => {
    const ramp = buildRamp('no es un color', 'light');
    expect(contrast(ramp.base, ramp.on)).toBeGreaterThanOrEqual(4.5);
  });
});
