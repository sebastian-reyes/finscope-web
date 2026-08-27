import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import { TagResponse } from '../../core/models';
import { TagChipComponent } from './tag-chip';

/** Longitud que admite el contrato para un nombre de tag. */
const MAX_LENGTH = 70;

/** Cuántos tags del catálogo se ofrecen de un toque antes de que la fila se haga larga. */
const SUGGESTION_COUNT = 8;

/** Contador para que cada instancia tenga su propio `datalist`. */
let nextId = 1;

/**
 * Campo para los tags de un movimiento.
 *
 * Un movimiento puede llevar varios, así que se escriben como fichas y no como un texto
 * separado por comas: así se ve cuántos hay, cada uno conserva el color y el icono con el
 * que aparece en el resto de la aplicación, y quitar uno no obliga a reeditar una frase.
 * La API reemplaza el conjunto entero al guardar, de modo que lo que quede aquí es lo que
 * tendrá el movimiento.
 */
@Component({
  selector: 'fs-tags-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TagChipComponent],
  template: `
    <div class="fs-tags" [class.is-disabled]="disabled()">
      @for (tag of tags(); track tag) {
        <button
          type="button"
          class="fs-tags__item"
          animate.enter="fs-anim-pop"
          [disabled]="disabled()"
          [attr.aria-label]="'Quitar el tag ' + tag"
          (click)="remove(tag)"
        >
          <fs-tag-chip [name]="tag" />
          <span class="fs-tags__x" aria-hidden="true"><i class="bi bi-x"></i></span>
        </button>
      }

      <input
        class="fs-tags__input"
        type="text"
        [id]="inputId()"
        [attr.list]="listId"
        [value]="draft()"
        [disabled]="disabled()"
        [placeholder]="tags().length ? 'Añadir otro…' : 'alimentación, transporte…'"
        maxlength="70"
        autocomplete="off"
        (input)="draft.set($any($event.target).value)"
        (keydown)="onKeydown($event)"
        (blur)="commit()"
      />

      <datalist [id]="listId">
        @for (tag of catalogue(); track tag.id) {
          <option [value]="tag.name"></option>
        }
      </datalist>
    </div>

    @if (suggestions().length) {
      <div class="fs-tags__suggestions" role="group" aria-label="Tags que ya usas">
        @for (tag of suggestions(); track tag.id) {
          <button
            type="button"
            class="fs-tags__suggestion"
            [disabled]="disabled()"
            [attr.aria-label]="'Añadir el tag ' + tag.name"
            (click)="add(tag.name)"
          >
            <fs-tag-chip [name]="tag.name" />
          </button>
        }
      </div>
    }
  `,
  styles: `
    /* La caja imita a un campo de formulario para que se lea como tal, pero por dentro es
       una fila que envuelve: las fichas y el texto que se escribe comparten el mismo sitio. */
    .fs-tags {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.4rem;
      min-height: 2.9rem;
      padding: 0.4rem 0.6rem;
      border: 1px solid var(--fs-line);
      border-radius: var(--fs-radius);
      background-color: var(--fs-surface-sunken);
      transition:
        border-color 0.15s ease,
        box-shadow 0.15s ease;
    }

    .fs-tags:focus-within {
      border-color: var(--fs-brand);
      box-shadow: 0 0 0 0.2rem rgba(var(--fs-brand-rgb), 0.15);
    }

    .fs-tags.is-disabled {
      opacity: 0.6;
    }

    .fs-tags__item {
      position: relative;
      padding: 0;
      border: none;
      background: none;
      line-height: 0;
      border-radius: 999px;
      outline-offset: 2px;
    }

    /* La cruz está siempre visible y no solo al pasar el ratón: en un móvil no hay ratón
       que pasar, y un tag que no se sabe quitar acaba quedándose donde no debe. */
    .fs-tags__x {
      position: absolute;
      top: -0.25rem;
      right: -0.25rem;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 1.05rem;
      height: 1.05rem;
      border-radius: 50%;
      background-color: var(--fs-ink-muted);
      color: var(--fs-surface);
      font-size: 0.7rem;
      line-height: 1;
    }

    .fs-tags__item:hover .fs-tags__x,
    .fs-tags__item:focus-visible .fs-tags__x {
      background-color: var(--fs-expense);
    }

    .fs-tags__input {
      flex: 1;
      min-width: 7rem;
      padding: 0.15rem 0;
      border: none;
      background: none;
      color: var(--fs-ink);
      font-size: 0.9375rem;
    }

    .fs-tags__input:focus {
      outline: none;
    }

    .fs-tags__suggestions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin-top: 0.6rem;
    }

    .fs-tags__suggestion {
      padding: 0;
      border: none;
      background: none;
      border-radius: 999px;
      line-height: 0;
      opacity: 0.75;
      outline-offset: 2px;
      transition:
        opacity 0.12s ease,
        transform 0.12s ease;
    }

    .fs-tags__suggestion:hover {
      opacity: 1;
    }

    .fs-tags__suggestion:active {
      transform: scale(0.96);
    }

    .fs-tags__suggestion:disabled {
      opacity: 0.4;
    }
  `,
})
export class TagsFieldComponent {
  /** Tags del movimiento. Es un modelo porque el campo los añade y los quita por su cuenta. */
  readonly tags = model<string[]>([]);

  /** Catálogo del usuario, para autocompletar y para sugerir los que más usa. */
  readonly catalogue = input<TagResponse[]>([]);

  readonly disabled = input(false);

  /** Identificador del `input`, para que la etiqueta de fuera pueda apuntarle. */
  readonly inputId = input('tagsField');

  /** Texto que se está escribiendo y que todavía no es un tag. */
  protected readonly draft = signal('');

  protected readonly listId = `tagsCatalogue-${nextId++}`;

  /**
   * Los tags que más usa y que este movimiento todavía no lleva.
   * Se ordenan por uso y no alfabéticamente porque aquí no se busca un tag concreto, se
   * repite el de siempre; el resto sigue estando al alcance escribiendo.
   */
  protected readonly suggestions = computed(() => {
    const picked = new Set(this.tags().map((tag) => tag.toLowerCase()));
    return [...this.catalogue()]
      .filter((tag) => !picked.has(tag.name.toLowerCase()))
      .sort(
        (left, right) =>
          right.transactionCount - left.transactionCount || left.name.localeCompare(right.name),
      )
      .slice(0, SUGGESTION_COUNT);
  });

  /**
   * Atajos de teclado del campo.
   * El intro y la coma cierran el tag que se está escribiendo; el retroceso sobre un campo
   * vacío borra el último, que es como se comporta cualquier campo de fichas.
   *
   * @param event pulsación recibida en el campo de texto
   */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      // Sin esto, el intro enviaría el formulario entero con el tag a medio escribir.
      event.preventDefault();
      this.commit();
      return;
    }
    if (event.key === 'Backspace' && !this.draft()) {
      const current = this.tags();
      if (current.length) {
        this.tags.set(current.slice(0, -1));
      }
    }
  }

  /**
   * Convierte en tag lo que haya escrito, si es que hay algo.
   * Se llama también al salir del campo: quien escribe un tag y va directo a guardar da por
   * hecho que cuenta, y perderlo por no haber pulsado intro sería una trampa.
   */
  protected commit(): void {
    const value = this.draft().trim();
    if (value) {
      this.add(value);
    }
    this.draft.set('');
  }

  /**
   * Añade un tag descartando los repetidos.
   * La comparación ignora las mayúsculas igual que la API, que reutiliza el tag existente
   * en vez de crear uno nuevo: sin esto se verían dos fichas que al guardar serían una.
   *
   * @param name nombre del tag a añadir
   */
  protected add(name: string): void {
    const value = name.trim().slice(0, MAX_LENGTH);
    if (!value) {
      return;
    }
    const exists = this.tags().some((tag) => tag.toLowerCase() === value.toLowerCase());
    if (!exists) {
      this.tags.set([...this.tags(), value]);
    }
    this.draft.set('');
  }

  protected remove(name: string): void {
    this.tags.set(this.tags().filter((tag) => tag !== name));
  }
}
