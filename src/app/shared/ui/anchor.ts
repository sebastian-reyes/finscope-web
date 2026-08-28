/** Aire entre el panel y lo que lo abre, y con el borde de la ventana. */
export const GAP = 6;

/** Lados por los que un panel se alinea con lo que lo abre. */
export type AnchorAlign = 'start' | 'end';

/** Lo mínimo que hace falta saber de una caja para colocar algo respecto a ella. */
export interface Box {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** Esquina en la que se dibuja el panel, en coordenadas de la ventana. */
export interface Spot {
  top: number;
  left: number;
}

/**
 * Dónde poner un panel que cuelga de un control.
 *
 * Va debajo, y encima solo si abajo no cabe; y nunca se sale por los lados. Se calcula en
 * coordenadas de ventana porque los paneles de la aplicación van fijos: dentro de la hoja
 * del editor, que recorta lo que se sale y tiene su propio desplazamiento, uno absoluto se
 * cortaría por abajo o se iría con el scroll.
 *
 * Es una función pura —recibe medidas y devuelve medidas— para poder comprobar el volteo y
 * los topes sin montar un navegador.
 *
 * @param anchor   caja del control que abre el panel
 * @param size     lo que mide el panel
 * @param viewport lo que mide la ventana
 * @param align    lado por el que el panel se alinea con el control
 * @return la esquina superior izquierda donde colocarlo
 */
export function anchorSpot(
  anchor: Box,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
  align: AnchorAlign = 'start',
): Spot {
  const below = anchor.bottom + GAP;
  const flips = below + size.height > viewport.height - GAP;
  const top = flips ? anchor.top - size.height - GAP : below;
  const left = align === 'end' ? anchor.right - size.width : anchor.left;
  // El tope derecho nunca puede quedar por detrás del izquierdo: en una ventana más
  // estrecha que el propio panel, mandan el borde izquierdo y el recorte del navegador.
  const rightmost = Math.max(GAP, viewport.width - size.width - GAP);
  return {
    top: Math.max(GAP, top),
    left: Math.min(Math.max(GAP, left), rightmost),
  };
}
