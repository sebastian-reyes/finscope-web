import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import {
  MARK_BARS,
  MARK_BAR_RADIUS,
  MARK_HANDLE,
  MARK_HANDLE_STROKE,
  MARK_LENS,
  MARK_TREND,
  MARK_TREND_STROKE,
  MARK_VIEWBOX,
} from '../../core/format/logo-mark';

/**
 * El icono de la aplicación, dibujado y no cargado.
 *
 * Era un PNG con una variante por tema, y dejó de servir en cuanto el color pasó a elegirlo
 * el usuario: un mapa de bits no se reteñe. Como SVG en línea toma sus dos colores de las
 * variables del documento, así que sigue a la paleta y al tema sin que nadie lo repinte y
 * sin una segunda descarga.
 *
 * La geometría viene de {@link ../../core/format/logo-mark} y no está escrita aquí porque el
 * favicon dibuja exactamente la misma lupa con los colores ya resueltos: son dos salidas del
 * mismo trazo, y separarlas sería empezar a tener dos logotipos parecidos.
 */
@Component({
  selector: 'fs-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      [attr.viewBox]="viewBox"
      [attr.aria-hidden]="label() ? null : true"
      [attr.role]="label() ? 'img' : null"
    >
      @if (label(); as text) {
        <title>{{ text }}</title>
      }
      <!-- El mango va antes que el aro para que el círculo tape la junta. -->
      <path
        [attr.d]="handle"
        [attr.stroke-width]="handleStroke"
        fill="none"
        stroke="var(--fs-brand)"
        stroke-linecap="round"
      />
      <circle
        [attr.cx]="lens.cx"
        [attr.cy]="lens.cy"
        [attr.r]="lens.r"
        [attr.stroke-width]="lens.stroke"
        fill="none"
        stroke="var(--fs-brand)"
      />
      @for (bar of bars; track $index) {
        <rect
          [attr.x]="bar.x"
          [attr.y]="bar.y"
          [attr.width]="bar.width"
          [attr.height]="bar.height"
          [attr.rx]="barRadius"
          fill="var(--fs-accent)"
        />
      }
      <path
        [attr.d]="trend"
        [attr.stroke-width]="trendStroke"
        fill="none"
        stroke="var(--fs-brand)"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
    }

    svg {
      display: block;
      width: 100%;
      height: 100%;
    }
  `,
})
export class LogoComponent {
  /**
   * Nombre accesible del icono. Vacío —lo normal— lo deja decorativo: allá donde se usa va
   * pegado al rótulo «FinScope», y anunciarlo dos veces solo estorba a quien escucha.
   */
  readonly label = input('');

  protected readonly viewBox = MARK_VIEWBOX;
  protected readonly lens = MARK_LENS;
  protected readonly handle = MARK_HANDLE;
  protected readonly handleStroke = MARK_HANDLE_STROKE;
  protected readonly bars = MARK_BARS;
  protected readonly barRadius = MARK_BAR_RADIUS;
  protected readonly trend = MARK_TREND;
  protected readonly trendStroke = MARK_TREND_STROKE;
}
