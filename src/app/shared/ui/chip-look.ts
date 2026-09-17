import { Signal, computed, inject } from '@angular/core';
import { CatalogueKind, CatalogueStylesService } from '../../core/catalogue-styles.service';
import { PaletteService } from '../../core/palette.service';
import { chipVariant, freeChipColors, freeHex } from '../../core/format/chip-color';
import { chipIcon } from '../../core/format/icon-choices';

/**
 * Cómo se pinta una ficha: la variante de la paleta, el color libre si lo hay y su icono.
 */
export interface ChipLook {
  variant: number;
  /** Fondo del color libre, o nulo si manda la variante. */
  bg: string | null;
  ink: string | null;
  /** Si el color libre se funde con el papel y necesita filo. */
  edge: boolean;
  /** Clase CSS del icono. */
  icon: string;
}

/**
 * Resuelve el aspecto de una ficha de categoría o de tag.
 *
 * Lo comparten las dos fichas y los selectores, que tienen que enseñar exactamente lo que se va
 * a ver. Se llama desde el inicializador de un campo, porque inyecta.
 *
 * Color e icono se resuelven por separado: una vista previa puede forzar el color que se está
 * eligiendo y dejar que el icono se busque, o al revés.
 *
 * @param kind catálogo de la ficha
 * @param name nombre que muestra
 * @param color color explícito; `undefined` para buscar el guardado, `null` para el automático
 * @param icon icono explícito, con las mismas reglas que el color
 * @return el aspecto, recalculado al cambiar cualquiera de ellos, la paleta o el tema
 */
export function chipLook(
  kind: CatalogueKind,
  name: Signal<string>,
  color: Signal<string | null | undefined>,
  icon: Signal<string | null | undefined>,
): Signal<ChipLook> {
  const styles = inject(CatalogueStylesService);
  const palette = inject(PaletteService);
  styles.watch();

  return computed(() => {
    const explicitColor = color();
    const explicitIcon = icon();
    const saved =
      explicitColor === undefined || explicitIcon === undefined
        ? styles.styleOf(kind, name())
        : null;
    const chosenColor = explicitColor === undefined ? saved!.color : explicitColor;
    const chosenIcon = explicitIcon === undefined ? saved!.icon : explicitIcon;

    const look: ChipLook = {
      variant: chipVariant(name(), chosenColor),
      bg: null,
      ink: null,
      edge: false,
      icon: chipIcon(name(), chosenIcon),
    };
    const hex = freeHex(chosenColor);
    if (!hex) {
      return look;
    }
    const { paper, surface, sunken } = palette.ramps().neutrals;
    const free = freeChipColors(hex, [paper, surface, sunken]);
    return free ? { ...look, bg: free.bg, ink: free.ink, edge: free.edge } : look;
  });
}
