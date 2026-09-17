import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { chipLook } from './chip-look';

/**
 * Categoría como ficha con su icono.
 *
 * La categoría es la clasificación principal de un movimiento, así que pesa más que un
 * tag: fuente algo mayor, icono siempre presente y, cuando se usa como marca de una fila,
 * el icono va suelto dentro de un cuadro con el color de la categoría.
 *
 * Como en los tags, el color y el icono pueden elegirse en la pantalla de categorías, y mientras
 * no se elijan se deducen del nombre, de modo que una categoría creada por el usuario se ve
 * igual de bien que las del catálogo inicial.
 */
@Component({
  selector: 'fs-category-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (iconOnly()) {
      <span
        class="fs-cat-icon fs-chip--{{ look().variant }}"
        [class.fs-chip--edged]="look().edge"
        [style.--fs-chip-bg]="look().bg"
        [style.--fs-chip-ink]="look().ink"
        [attr.aria-label]="name()"
        [attr.title]="name()"
      >
        <i class="bi {{ look().icon }}" aria-hidden="true"></i>
      </span>
    } @else {
      <span
        class="fs-chip fs-cat-chip fs-chip--{{ look().variant }}"
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

  /** Color a pintar en lugar del guardado: nulo fuerza el automático. Ver la ficha de tag. */
  readonly color = input<string | null | undefined>(undefined);

  /** Icono a pintar en lugar del guardado, sin `bi-`. Ver la ficha de tag. */
  readonly icon = input<string | null | undefined>(undefined);

  protected readonly look = chipLook('category', this.name, this.color, this.icon);
}
