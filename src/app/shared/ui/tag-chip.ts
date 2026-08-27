import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { iconFor, paletteVariant } from '../../core/format/icons';

/**
 * Tag como etiqueta con color e icono.
 *
 * El tag dice en qué contexto ocurrió un movimiento —con quién, para qué, en qué viaje— y
 * puede haber varios, así que nunca reparte importes: para eso está la categoría. Aquí es
 * una ficha secundaria, más pequeña y discreta que la categoría a la que acompaña.
 *
 * Ni el color ni el icono existen en la API: se derivan del nombre en
 * {@link ../../core/format/icons}, de forma que el mismo tag siempre se ve igual en toda la
 * aplicación. El nombre se muestra completo, así que el color decora pero no informa.
 */
@Component({
  selector: 'fs-tag-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="fs-chip fs-chip--{{ variant() }}">
      <i class="bi {{ icon() }}" aria-hidden="true"></i>
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

  protected readonly icon = computed(() => iconFor(this.name()));
  protected readonly variant = computed(() => paletteVariant(this.name()));
}
