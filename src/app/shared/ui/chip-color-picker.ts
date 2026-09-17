import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  model,
} from '@angular/core';
import { CatalogueKind } from '../../core/catalogue-styles.service';
import { PaletteService } from '../../core/palette.service';
import { normalizeHex } from '../../core/format/color';
import { freeChipColors, freeHex, presetColor, presetIndex } from '../../core/format/chip-color';
import { PALETTE_SIZE, paletteVariant } from '../../core/format/icons';
import { CategoryChipComponent } from './category-chip';
import { TagChipComponent } from './tag-chip';

/** El color libre que se propone la primera vez: cálido, lejos del azul de fábrica. */
const FIRST_FREE = '#e8a33d';

/**
 * Elige el color de la ficha de una categoría o un tag.
 *
 * Tres caminos, de menos a más decisión:
 * - **Automático**: el color sale del nombre, como hasta ahora. Es lo que tiene todo lo que ya
 *   existía y lo que se recupera al volver aquí.
 * - **Las ocho fichas de la paleta**: no son colores fijos, son sitios en la rueda. Giran con
 *   el color principal y cambian con el tema, así que siempre combinan con la aplicación.
 * - **Libre**: cualquier color, con el selector del sistema o escrito en hexadecimal. Se pinta
 *   tal cual, y la tinta de encima se calcula por contraste: un negro lleva letra clara y un
 *   blanco oscura. Si el color se funde con el papel, la ficha gana un filo.
 *
 * Debajo va la ficha tal y como se verá, con el nombre que se está escribiendo: elegir un color
 * sin verlo puesto es adivinar.
 *
 * Como `fs-select-field`, no es un control de formulario: se comunica con `value` en los dos
 * sentidos y el valor vive en una señal de quien lo usa. Nulo es automático.
 */
@Component({
  selector: 'fs-chip-color-picker',
  imports: [TagChipComponent, CategoryChipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fs-ccp" role="group" [attr.aria-label]="'Color de ' + (name() || 'la ficha')">
      <div class="fs-ccp__swatches">
        <button
          type="button"
          class="fs-ccp__auto fs-chip--{{ autoVariant() }}"
          [class.is-active]="value() === null"
          [attr.aria-pressed]="value() === null"
          title="El color sale del nombre"
          (click)="value.set(null)"
        >
          <i class="bi bi-magic" aria-hidden="true"></i>Auto
        </button>

        @for (index of presets; track index) {
          <button
            type="button"
            class="fs-ccp__swatch fs-chip--{{ index }}"
            [class.is-active]="selectedPreset() === index"
            [attr.aria-pressed]="selectedPreset() === index"
            [attr.aria-label]="'Color ' + (index + 1) + ' de la paleta'"
            (click)="value.set(preset(index))"
          >
            @if (selectedPreset() === index) {
              <i class="bi bi-check-lg" aria-hidden="true"></i>
            }
          </button>
        }

        <label
          class="fs-ccp__swatch fs-ccp__free"
          [class.is-active]="free() !== null"
          [class.fs-chip--edged]="freeLook()?.edge"
          [style.--fs-ccp-free]="free()"
          [style.color]="freeLook()?.ink"
          title="Color libre"
        >
          @if (free() !== null) {
            <i class="bi bi-check-lg" aria-hidden="true"></i>
          } @else {
            <i class="bi bi-eyedropper" aria-hidden="true"></i>
          }
          <input
            type="color"
            class="fs-ccp__native"
            aria-label="Elegir un color libre"
            [value]="lastFree()"
            (click)="value.set(lastFree())"
            (input)="pickNative($event)"
          />
        </label>

        @if (free() !== null) {
          <input
            class="fs-field fs-field--sm fs-ccp__hex fs-num"
            maxlength="7"
            autocomplete="off"
            spellcheck="false"
            aria-label="Color en hexadecimal"
            [value]="hexDraft()"
            (input)="typeHex($event)"
            (blur)="hexDraft.set(free() ?? '')"
          />
        }
      </div>

      <div class="fs-ccp__preview">
        <span class="fs-ccp__caption">Así se verá</span>
        @if (kind() === 'category') {
          <fs-category-chip [name]="name() || 'Categoría'" [color]="value()" [icon]="icon()" />
        } @else {
          <fs-tag-chip [name]="name() || 'tag'" [color]="value()" [icon]="icon()" />
        }
      </div>
    </div>
  `,
  styles: `
    .fs-ccp {
      display: flex;
      flex-direction: column;
      gap: 0.6rem;
      width: 100%;
    }

    .fs-ccp__swatches {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.45rem;
    }

    /* Las muestras de la paleta enseñan la pareja entera: el anillo es el fondo de la ficha y
       el centro su tinta. Solo el fondo se confundiría entre tonos pálidos parecidos. */
    .fs-ccp__swatch {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.875rem;
      height: 1.875rem;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background-color: var(--fs-chip-ink);
      box-shadow: inset 0 0 0 0.3rem var(--fs-chip-bg);
      color: var(--fs-chip-bg);
      font-size: 0.95rem;
      cursor: pointer;
      transition: transform 0.12s ease;
    }

    .fs-ccp__swatch:hover {
      transform: scale(1.08);
    }

    /* Elegida: un aro del color de la marca separado por un hueco de papel, que se ve igual
       sobre una muestra clara que sobre una oscura. */
    .fs-ccp__swatch.is-active,
    .fs-ccp__auto.is-active {
      outline: 2px solid var(--fs-brand);
      outline-offset: 2px;
    }

    .fs-ccp__auto {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      height: 1.875rem;
      padding: 0 0.7rem;
      border: 0;
      border-radius: 999px;
      background-color: var(--fs-chip-bg);
      color: var(--fs-chip-ink);
      font-size: var(--fs-text-sm);
      cursor: pointer;
    }

    /* Sin color libre, la muestra es la rueda entera, que es lo que promete; con uno, es él. */
    .fs-ccp__free {
      background: conic-gradient(#f43f5e, #f59e0b, #84cc16, #06b6d4, #6366f1, #d946ef, #f43f5e);
      background: conic-gradient(in oklch longer hue, oklch(0.72 0.17 20), oklch(0.72 0.17 20));
      box-shadow: none;
      color: #fff;
      text-shadow: 0 1px 2px rgb(0 0 0 / 0.45);
    }

    .fs-ccp__free.is-active {
      background: var(--fs-ccp-free);
      text-shadow: none;
    }

    .fs-ccp__free.fs-chip--edged {
      box-shadow: inset 0 0 0 1px var(--fs-line-strong);
    }

    /* El selector del sistema cubre la muestra entera pero no se ve: así se abre tocando el
       círculo, que es mucho más bonito que el cuadro gris del navegador. */
    .fs-ccp__native {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      opacity: 0;
      cursor: pointer;
    }

    .fs-ccp__hex {
      width: 6.25rem;
      text-transform: lowercase;
    }

    .fs-ccp__preview {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      min-width: 0;
    }

    .fs-ccp__caption {
      flex: none;
      font-size: var(--fs-text-xs);
      color: var(--fs-ink-faint);
    }

    @media (pointer: coarse) {
      .fs-ccp__swatch,
      .fs-ccp__auto {
        width: 2.25rem;
        height: 2.25rem;
      }

      .fs-ccp__auto {
        width: auto;
      }
    }
  `,
})
export class ChipColorPickerComponent {
  private readonly palette = inject(PaletteService);

  /** Color elegido: `preset-N`, `#rrggbb` o nulo para el automático. */
  readonly value = model<string | null>(null);

  /** Nombre que se está escribiendo, para la vista previa y para la muestra automática. */
  readonly name = input('');

  /** Qué ficha enseña la vista previa. */
  readonly kind = input<CatalogueKind>('tag');

  /** Icono que se está eligiendo al lado, para que la vista previa lo enseñe ya puesto. */
  readonly icon = input<string | null | undefined>(undefined);

  protected readonly presets = Array.from({ length: PALETTE_SIZE }, (_, index) => index);

  protected readonly selectedPreset = computed(() => presetIndex(this.value()));
  protected readonly free = computed(() => freeHex(this.value()));

  /** La ficha que tocaría sin elegir nada, para que «Auto» enseñe lo que significa. */
  protected readonly autoVariant = computed(() => paletteVariant(this.name().trim()));

  protected readonly freeLook = computed(() => {
    const hex = this.free();
    if (!hex) {
      return null;
    }
    const { paper, surface, sunken } = this.palette.ramps().neutrals;
    return freeChipColors(hex, [paper, surface, sunken]);
  });

  /**
   * El último color libre que hubo, aunque ahora esté elegida otra cosa.
   * Probar una ficha de la paleta y volver al libre no debería perder el que se había afinado.
   */
  protected readonly lastFree = linkedSignal<string | null, string>({
    source: this.free,
    computation: (hex, previous) => hex ?? previous?.value ?? FIRST_FREE,
  });

  /** Lo que hay escrito en el campo hexadecimal, que puede estar a medias. */
  protected readonly hexDraft = linkedSignal(() => this.free() ?? '');

  protected preset(index: number): string {
    return presetColor(index);
  }

  protected pickNative(event: Event): void {
    const hex = normalizeHex((event.target as HTMLInputElement).value);
    if (hex) {
      this.value.set(hex);
    }
  }

  /**
   * Aplica lo escrito en cuanto es un color, sin esperar a salir del campo. Mientras está a
   * medias no toca nada: al salir, el campo vuelve a enseñar el último que valía.
   */
  protected typeHex(event: Event): void {
    const text = (event.target as HTMLInputElement).value.trim();
    this.hexDraft.set(text);
    const hex = /^#?[0-9a-f]{6}$/i.test(text) ? normalizeHex(text) : null;
    if (hex) {
      this.value.set(hex);
    }
  }
}
