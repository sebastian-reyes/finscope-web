import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { avatarOf, initialsOf } from '../../core/format/avatars';

/**
 * La imagen de perfil: la ilustración elegida o, si no hay, las iniciales.
 *
 * Las dos llevan los colores del usuario, cada una a su manera. Las iniciales van en blanco
 * sobre el barrido macizo de la pareja, como el botón de registrar. El animal va sobre la
 * misma pareja pero en su tono claro: con el fondo saturado, un zorro naranja sobre un ámbar
 * no se distinguiría.
 *
 * El tamaño lo pone quien la usa, con ancho y alto; las letras crecen con él.
 */
@Component({
  selector: 'fs-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.is-art]': 'art()',
    '[attr.role]': "label() ? 'img' : null",
    '[attr.aria-label]': 'label()',
    '[attr.aria-hidden]': 'label() ? null : true',
  },
  template: `
    @if (art(); as drawing) {
      <span class="fs-avatar__art" [innerHTML]="drawing"></span>
    } @else {
      <span class="fs-avatar__initials">{{ initials() }}</span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: 2.5rem;
      height: 2.5rem;
      overflow: hidden;
      border-radius: 50%;
      background-color: var(--fs-brand);
      background-image: linear-gradient(
        160deg in oklch shorter hue,
        var(--fs-brand),
        var(--fs-accent)
      );
      color: #fff;
      container-type: size;
    }

    :host(.is-art) {
      background-color: var(--fs-brand-tint);
      background-image: linear-gradient(
        160deg in oklch shorter hue,
        var(--fs-brand-tint),
        var(--fs-accent-tint)
      );
    }

    .fs-avatar__art,
    .fs-avatar__art ::ng-deep svg {
      display: block;
      width: 100%;
      height: 100%;
    }

    /* Las letras miden un tercio largo del círculo, sea del tamaño que sea. */
    .fs-avatar__initials {
      font-size: 38cqh;
      font-weight: 650;
      letter-spacing: 0.02em;
      line-height: 1;
    }
  `,
})
export class AvatarComponent {
  private readonly sanitizer = inject(DomSanitizer);

  /** La ilustración guardada en la cuenta, si la hay. */
  readonly avatar = input<string | null | undefined>(null);

  /** Nombre y correo, de los que salen las iniciales cuando no hay ilustración. */
  readonly name = input<string | null | undefined>(null);
  readonly email = input<string | null | undefined>(null);

  /**
   * Lo que se le lee al lector de pantalla. Vacío la deja como decoración, que es lo normal:
   * casi siempre va al lado del nombre, y leerlo dos veces solo estorba.
   */
  readonly label = input<string | null>(null);

  protected readonly initials = computed(() => initialsOf(this.name(), this.email()));

  /**
   * El dibujo listo para ponerse en el documento. Se marca como seguro porque sale del
   * catálogo escrito en el propio código, nunca de lo que llega de fuera: de la cuenta solo
   * se usa el identificador para buscarlo.
   */
  protected readonly art = computed<SafeHtml | null>(() => {
    const choice = avatarOf(this.avatar());
    return choice
      ? this.sanitizer.bypassSecurityTrustHtml(
          `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">${choice.art}</svg>`,
        )
      : null;
  });
}
