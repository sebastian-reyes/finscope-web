import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { iconFor, paletteVariant } from '../../core/format/icons';

/**
 * Categoría como ficha con su icono.
 *
 * La categoría es la clasificación principal de un movimiento, así que pesa más que un
 * tag: fuente algo mayor, icono siempre presente y, cuando se usa como marca de una fila,
 * el icono va suelto dentro de un cuadro con el color de la categoría.
 *
 * Como en los tags, el color y el icono se deducen del nombre y no se guardan en ningún
 * sitio, de modo que una categoría creada por el usuario se ve igual de bien que las del
 * catálogo inicial.
 */
@Component({
  selector: 'fs-category-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (iconOnly()) {
      <span
        class="fs-cat-icon fs-chip--{{ variant() }}"
        [attr.aria-label]="name()"
        [attr.title]="name()"
      >
        <i class="bi {{ icon() }}" aria-hidden="true"></i>
      </span>
    } @else {
      <span class="fs-chip fs-cat-chip fs-chip--{{ variant() }}">
        <i class="bi {{ icon() }}" aria-hidden="true"></i>
        <span class="text-truncate">{{ name() }}</span>
        @if (count() !== null) {
          <span class="fs-chip__count fs-num">{{ count() }}</span>
        }
      </span>
    }
  `,
  styles: `
    .fs-cat-chip {
      padding: 0.25rem 0.7rem;
      font-size: 0.875rem;
      font-weight: 500;
    }

    /* Marca de fila: solo el icono, en un cuadro del color de la categoría. Ocupa el sitio
       que en un extracto ocuparía el logo del comercio y hace la fila reconocible de un
       vistazo sin leerla. */
    .fs-cat-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2.25rem;
      height: 2.25rem;
      border-radius: 0.7rem;
      font-size: 0.95rem;
      background-color: var(--fs-chip-bg);
      color: var(--fs-chip-ink);
    }
  `,
})
export class CategoryChipComponent {
  readonly name = input.required<string>();

  /** Número de transacciones que clasifica, cuando la ficha lo tiene que enseñar. */
  readonly count = input<number | null>(null);

  /** Dibuja solo el icono, para encabezar una fila sin repetir el nombre a su lado. */
  readonly iconOnly = input(false);

  protected readonly icon = computed(() => iconFor(this.name()));
  protected readonly variant = computed(() => paletteVariant(this.name()));
}
