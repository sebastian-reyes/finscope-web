import { describe, expect, it } from 'vitest';
import { GAP, anchorSpot } from './anchor';

const VIEWPORT = { width: 1000, height: 800 };
const SIZE = { width: 200, height: 300 };

function box(top: number, left: number, width = 120, height = 40) {
  return { top, left, bottom: top + height, right: left + width };
}

describe('anchorSpot', () => {
  it('cuelga el panel justo debajo cuando ahí cabe', () => {
    const spot = anchorSpot(box(100, 300), SIZE, VIEWPORT);

    expect(spot.top).toBe(140 + GAP);
    expect(spot.left).toBe(300);
  });

  it('lo voltea encima cuando por debajo se saldría de la ventana', () => {
    const spot = anchorSpot(box(700, 300), SIZE, VIEWPORT);

    // Encima del control, no pegado al borde inferior tapándolo.
    expect(spot.top).toBe(700 - SIZE.height - GAP);
  });

  it('lo alinea por el borde derecho del control cuando se le pide', () => {
    const spot = anchorSpot(box(100, 300), SIZE, VIEWPORT, 'end');

    expect(spot.left).toBe(420 - SIZE.width);
  });

  it('no lo deja salirse por ninguno de los dos lados', () => {
    expect(anchorSpot(box(100, -50), SIZE, VIEWPORT).left).toBe(GAP);
    expect(anchorSpot(box(100, 950), SIZE, VIEWPORT).left).toBe(VIEWPORT.width - SIZE.width - GAP);
  });

  it('manda el borde izquierdo si el panel no cabe ni a lo ancho de la ventana', () => {
    // El tope derecho quedaría por detrás del izquierdo y lo empujaría fuera de la pantalla.
    const spot = anchorSpot(box(100, 10), { width: 1200, height: 100 }, VIEWPORT);

    expect(spot.left).toBe(GAP);
  });
});
