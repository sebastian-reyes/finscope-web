import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  input,
  model,
  output,
  viewChild,
} from '@angular/core';

/**
 * Buscador de una lista: lupa, campo y un aspa para vaciarlo.
 *
 * Solo recoge el texto; qué se hace con él lo decide cada pantalla. Los movimientos lo mandan
 * a la API con un retardo, porque no caben enteros en el navegador; los fijos y los
 * presupuestos filtran al momento lo que ya tienen, que es un mes y cabe de sobra.
 *
 * El aspa —y Escape— avisan aparte con `cleared` además de vaciar el valor: vaciar a propósito
 * no es seguir escribiendo, y quien espera un retardo tiene que poder saltárselo.
 */
@Component({
  selector: 'fs-search-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'fs-search' },
  template: `
    <i class="bi bi-search fs-search__icon" aria-hidden="true"></i>
    <label class="visually-hidden" [attr.for]="inputId()">{{ label() }}</label>
    <input
      #field
      [id]="inputId()"
      class="fs-field fs-search__input"
      type="search"
      autocomplete="off"
      [placeholder]="placeholder()"
      [value]="value()"
      (input)="value.set($any($event.target).value)"
      (keydown.escape)="onEscape($event)"
    />
    @if (value()) {
      <button
        type="button"
        class="fs-search__clear"
        (click)="clear()"
        aria-label="Borrar la búsqueda"
      >
        <i class="bi bi-x-lg" aria-hidden="true"></i>
      </button>
    }
  `,
})
export class SearchFieldComponent {
  /** Texto escrito, tal cual: sin recortar, para que el campo no se coma los espacios. */
  readonly value = model('');

  readonly inputId = input.required<string>();

  /** Lo que lee un lector de pantalla: dónde se busca, que el marcador no siempre lo dice. */
  readonly label = input.required<string>();

  readonly placeholder = input('Buscar');

  /** El campo se vació con el aspa o con Escape, no tecleando. */
  readonly cleared = output<void>();

  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');

  /**
   * Vacía el campo y deja el cursor en él.
   * El aspa desaparece al pulsarla, y sin devolver el foco al campo se iría al principio de
   * la página, que en un teléfono es perder el sitio.
   */
  protected clear(): void {
    this.value.set('');
    this.cleared.emit();
    this.field().nativeElement.focus();
  }

  /** Escape vacía el campo, pero con el campo ya vacío se deja pasar a quien lo quiera. */
  protected onEscape(event: Event): void {
    if (this.value()) {
      event.preventDefault();
      this.clear();
    }
  }
}
