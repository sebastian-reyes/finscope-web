import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ThemeService } from '../../core/theme.service';

/**
 * El icono de la aplicación: la imagen de la marca, no un dibujo que la imite.
 *
 * Hay dos variantes. La clara lleva el aro y la flecha en azul y se lee sobre fondo claro;
 * la oscura los lleva en blanco y se lee sobre fondo oscuro. Lo normal es que mande el tema
 * en curso, pero sobre las paredes de marca —el acceso, la bienvenida— el fondo es oscuro
 * en los dos temas, y ahí se pide la oscura siempre.
 *
 * La imagen no sigue al color que elija el usuario: es la marca, y la marca no cambia.
 */
@Component({
  selector: 'fs-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<img [src]="src()" [attr.alt]="label()" width="64" height="64" />`,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
    }

    img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
  `,
})
export class LogoComponent {
  private readonly theme = inject(ThemeService);

  /**
   * Nombre accesible del icono. Vacío —lo normal— lo deja decorativo: allá donde se usa va
   * pegado al rótulo «FinScope», y anunciarlo dos veces solo estorba a quien escucha.
   */
  readonly label = input('');

  /** Sobre qué fondo va: el del tema en curso, o uno oscuro sea cual sea el tema. */
  readonly surface = input<'theme' | 'dark'>('theme');

  protected readonly src = computed(() =>
    this.surface() === 'dark' || this.theme.resolved() === 'dark'
      ? 'icons/logo-dark.png'
      : 'icons/logo-light.png',
  );
}
