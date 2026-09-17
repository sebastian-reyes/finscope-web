import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import { chipIcon, searchIcons } from '../../core/format/icon-choices';
import { iconFor } from '../../core/format/icons';

/**
 * Elige el icono de la ficha de una categoría o un tag.
 *
 * Plegado enseña solo el icono en curso y un botón: la lista entera son unos setenta iconos y
 * abierta de entrada se comería la baldosa de un tag. Desplegado lleva un buscador en castellano
 * —«café», «viaje», «ahorro»— y los iconos por grupos, con «Automático» siempre primero: es lo
 * que tiene todo lo que ya existía y la forma de volver atrás.
 *
 * Como el selector de color, no es un control de formulario: se comunica con `value` en los dos
 * sentidos. Nulo es automático; lo demás es el nombre del icono sin `bi-`.
 */
@Component({
  selector: 'fs-chip-icon-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fs-cip">
      <button
        type="button"
        class="fs-cip__toggle"
        [attr.aria-expanded]="open()"
        (click)="open.set(!open())"
      >
        <span class="fs-cip__current" aria-hidden="true"><i class="bi {{ current() }}"></i></span>
        <span class="fs-cip__label">{{ value() === null ? 'Automático' : 'Elegido a mano' }}</span>
        <i
          class="bi fs-cip__chevron"
          [class.bi-chevron-down]="!open()"
          [class.bi-chevron-up]="open()"
          aria-hidden="true"
        ></i>
      </button>

      @if (open()) {
        <div class="fs-cip__panel" animate.enter="fs-anim-expand">
          <input
            class="fs-field fs-field--sm"
            type="search"
            autocomplete="off"
            placeholder="Buscar: café, viaje, ahorro…"
            aria-label="Buscar icono"
            [value]="query()"
            (input)="query.set($any($event.target).value)"
            (keydown.enter)="$event.preventDefault()"
          />

          <div class="fs-cip__scroll">
            @if (!query().trim()) {
              <button
                type="button"
                class="fs-cip__auto"
                [class.is-active]="value() === null"
                [attr.aria-pressed]="value() === null"
                (click)="choose(null)"
              >
                <i class="bi {{ auto() }}" aria-hidden="true"></i>
                Automático
                <span class="fs-cip__hint">según el nombre</span>
              </button>
            }

            @for (group of groups(); track group.label) {
              <p class="fs-cip__group">{{ group.label }}</p>
              <div class="fs-cip__grid">
                @for (choice of group.icons; track choice.icon) {
                  <button
                    type="button"
                    class="fs-cip__icon"
                    [class.is-active]="value() === choice.icon"
                    [attr.aria-pressed]="value() === choice.icon"
                    [attr.aria-label]="choice.words.split(' ')[0]"
                    [attr.title]="choice.words.split(' ')[0]"
                    (click)="choose(choice.icon)"
                  >
                    <i class="bi bi-{{ choice.icon }}" aria-hidden="true"></i>
                  </button>
                }
              </div>
            } @empty {
              <p class="fs-cip__empty">Ningún icono con «{{ query().trim() }}».</p>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: `
    .fs-cip {
      width: 100%;
      min-width: 0;
    }

    .fs-cip__toggle {
      display: inline-flex;
      align-items: center;
      gap: 0.55rem;
      padding: 0.2rem 0.6rem 0.2rem 0.2rem;
      border: 1px solid var(--fs-line);
      border-radius: var(--fs-radius-control);
      background-color: var(--fs-surface);
      color: var(--fs-ink);
      font-size: var(--fs-text-sm);
      cursor: pointer;
    }

    .fs-cip__toggle:hover {
      border-color: var(--fs-line-strong);
    }

    .fs-cip__current {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2rem;
      height: 2rem;
      border-radius: var(--fs-radius-control-sm);
      background-color: var(--fs-brand-tint);
      color: var(--fs-brand);
      font-size: 1rem;
    }

    .fs-cip__chevron {
      color: var(--fs-ink-faint);
      font-size: 0.75rem;
    }

    .fs-cip__panel {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-top: 0.5rem;
      padding: 0.6rem;
      border: 1px solid var(--fs-line);
      border-radius: var(--fs-radius);
      background-color: var(--fs-surface);
    }

    /* Con scroll propio y alto acotado: abierto dentro de una baldosa no puede empujar la
       pantalla entera hacia abajo. */
    .fs-cip__scroll {
      max-height: 16rem;
      overflow-y: auto;
      overscroll-behavior: contain;
    }

    .fs-cip__auto {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      width: 100%;
      padding: 0.45rem 0.6rem;
      border: 0;
      border-radius: var(--fs-radius-control-sm);
      background: none;
      color: var(--fs-ink);
      font-size: var(--fs-text-sm);
      text-align: left;
      cursor: pointer;
    }

    .fs-cip__hint {
      color: var(--fs-ink-faint);
      font-size: var(--fs-text-xs);
    }

    .fs-cip__group {
      margin: 0.55rem 0 0.3rem;
      font-size: var(--fs-text-xs);
      font-weight: 600;
      color: var(--fs-ink-muted);
    }

    .fs-cip__grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(2.25rem, 1fr));
      gap: 0.25rem;
    }

    .fs-cip__icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      aspect-ratio: 1;
      min-height: 2.25rem;
      border: 0;
      border-radius: var(--fs-radius-control-sm);
      background: none;
      color: var(--fs-ink-muted);
      font-size: 1.1rem;
      cursor: pointer;
    }

    .fs-cip__icon:hover,
    .fs-cip__auto:hover {
      background-color: var(--fs-hover);
      color: var(--fs-ink);
    }

    .fs-cip__icon.is-active,
    .fs-cip__auto.is-active {
      background-color: var(--fs-brand-tint);
      color: var(--fs-brand);
    }

    .fs-cip__empty {
      margin: 0.5rem 0;
      font-size: var(--fs-text-sm);
      color: var(--fs-ink-faint);
    }
  `,
})
export class ChipIconPickerComponent {
  /** Icono elegido sin `bi-`, o nulo para el automático. */
  readonly value = model<string | null>(null);

  /** Nombre que se está escribiendo, del que sale el icono automático. */
  readonly name = input('');

  protected readonly open = signal(false);
  protected readonly query = signal('');

  protected readonly auto = computed(() => iconFor(this.name().trim()));
  protected readonly current = computed(() => chipIcon(this.name().trim(), this.value()));
  protected readonly groups = computed(() => searchIcons(this.query()));

  /** Elige y pliega: se elige un icono, no se colecciona. */
  protected choose(icon: string | null): void {
    this.value.set(icon);
    this.open.set(false);
    this.query.set('');
  }
}
