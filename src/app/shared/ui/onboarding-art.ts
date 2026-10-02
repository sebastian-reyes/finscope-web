import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { COLOR_PRESETS } from '../../core/palette.service';
import { AvatarComponent } from './avatar';
import { LogoComponent } from './logo';
import type { OnboardingSlide } from './onboarding';

/**
 * El dibujo de un paso del recorrido de bienvenida.
 *
 * No son capturas: una imagen no seguiría a la paleta ni al tema elegidos, pesaría más que
 * todo esto junto y se vería borrosa o diminuta según la pantalla. Son las piezas de la
 * aplicación —la tarjeta de balance, la barra de presupuesto, la fila de un fijo— dibujadas
 * como tarjetas iguales a las de verdad, con cifras de ejemplo. Así, al cerrar el recorrido,
 * lo que se ve ya resulta conocido.
 *
 * Todo mide en `em` y la base la pone el hueco que le deja el texto, así que el dibujo encoge
 * entero en un teléfono bajo en lugar de montarse sobre el título.
 */
@Component({
  selector: 'fs-onboarding-art',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvatarComponent, LogoComponent],
  templateUrl: './onboarding-art.html',
  styleUrl: './onboarding-art.scss',
})
export class OnboardingArtComponent {
  /** Qué paso dibujar. */
  readonly slide = input.required<OnboardingSlide['id']>();

  /** Unas cuantas de las parejas que se pueden elegir, para el dibujo del último paso. */
  protected readonly swatches = COLOR_PRESETS.slice(0, 5);

  /** Unas cuantas de las imágenes de perfil, con la llama delante como la elegida. */
  protected readonly avatars = ['llama', 'fox', 'cat', 'piggy', 'owl'];

  /** El reparto de ejemplo del paso de entender, con las barras ya medidas contra la mayor. */
  protected readonly categories = [
    { name: 'Comida', icon: 'bi-cup-hot', share: 38, bar: 100 },
    { name: 'Hogar', icon: 'bi-house', share: 27, bar: 71 },
    { name: 'Transporte', icon: 'bi-bus-front', share: 18, bar: 47 },
  ];
}
