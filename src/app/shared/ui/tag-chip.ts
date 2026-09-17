import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { chipLook } from './chip-look';

/**
 * Tag como etiqueta con color e icono.
 *
 * El tag dice en qué contexto ocurrió un movimiento —con quién, para qué, en qué viaje— y
 * puede haber varios, así que nunca reparte importes: para eso está la categoría. Aquí es
 * una ficha secundaria, más pequeña y discreta que la categoría a la que acompaña.
 *
 * El color y el icono pueden elegirse en la pantalla de tags; lo que no se elija se deduce del
 * nombre en {@link ../../core/format/icons}. Sea como sea, el mismo tag se ve igual en toda la
 * aplicación. El nombre se muestra completo, así que color e icono decoran pero no informan.
 */
@Component({
  selector: 'fs-tag-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="fs-chip fs-chip--{{ look().variant }}"
      [class.fs-chip--edged]="look().edge"
      [style.--fs-chip-bg]="look().bg"
      [style.--fs-chip-ink]="look().ink"
    >
      <i class="bi {{ look().icon }}" aria-hidden="true"></i>
      <span class="text-truncate">{{ name() }}</span>
      @if (count() !== null) {
        <span class="fs-chip__count fs-num">{{ count() }}</span>
      }
    </span>
  `,
})
export class TagChipComponent {
  readonly name = input.required<string>();

  /** Número de transacciones que lo llevan, cuando el chip lo tiene que enseñar. */
  readonly count = input<number | null>(null);

  /**
   * Color a pintar en lugar del guardado: nulo fuerza el automático. Lo usa la vista previa
   * del selector; el resto de la aplicación no lo pasa y la ficha busca el suyo.
   */
  readonly color = input<string | null | undefined>(undefined);

  /** Icono a pintar en lugar del guardado, sin `bi-`. Mismas reglas que {@link color}. */
  readonly icon = input<string | null | undefined>(undefined);

  protected readonly look = chipLook('tag', this.name, this.color, this.icon);
}
