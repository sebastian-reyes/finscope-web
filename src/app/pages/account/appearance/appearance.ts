import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { COLOR_PRESETS, PaletteService } from '../../../core/palette.service';
import { ThemeService } from '../../../core/theme.service';
import { ToastService } from '../../../core/toast.service';
import { LogoComponent } from '../../../shared/ui/logo';
import { SegmentedDirective } from '../../../shared/ui/segmented';
import { THEME_OPTIONS, ThemeOption } from '../theme-options';

/** Uno de los dos colores que se pueden elegir, con lo que hay que contar de él. */
interface ColorSlot {
  role: 'primary' | 'secondary';
  label: string;
  /** Qué pinta ese color, para que la elección no sea a ciegas. */
  hint: string;
  /** Lo que se le lee a quien navega con teclado al llegar al selector libre. */
  custom: string;
}

/**
 * Claro u oscuro, y la pareja de colores de la aplicación.
 *
 * Todo se aplica al momento y sin botón de guardar: es una preferencia de este navegador y se
 * ve el efecto en la propia pantalla mientras se elige.
 */
@Component({
  selector: 'app-account-appearance',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LogoComponent, SegmentedDirective],
  templateUrl: './appearance.html',
  styleUrls: ['../settings-shared.scss', './appearance.scss'],
})
export class AccountAppearancePage {
  private readonly theme = inject(ThemeService);
  private readonly palette = inject(PaletteService);
  private readonly toasts = inject(ToastService);

  protected readonly preference = this.theme.preference;

  /** Los colores en curso, para marcar cuál de los predefinidos está puesto. */
  protected readonly colors = this.palette.colors;

  /** Si sigue la pareja de fábrica: restablecerla solo se ofrece cuando hay algo que deshacer. */
  protected readonly isDefaultPalette = this.palette.isDefault;

  protected readonly presets = COLOR_PRESETS;

  protected readonly themes: readonly ThemeOption[] = THEME_OPTIONS;

  protected readonly slots: ColorSlot[] = [
    {
      role: 'primary',
      label: 'Color principal',
      hint: 'Manda en los botones, en los enlaces y en la sección en la que estás.',
      custom: 'Elegir otro color principal',
    },
    {
      role: 'secondary',
      label: 'Color secundario',
      hint: 'Acompaña al principal en el icono, en el botón de registrar y en la pantalla de acceso.',
      custom: 'Elegir otro color secundario',
    },
  ];

  protected setTheme(preference: ThemeOption['value']): void {
    this.theme.set(preference);
  }

  /** El color puesto ahora en uno de los dos huecos. */
  protected current(role: ColorSlot['role']): string {
    return role === 'primary' ? this.colors().primary : this.colors().secondary;
  }

  /**
   * Cambia uno de los dos colores.
   * Se aplica al momento y sin botón de guardar: confirmar algo que ya está puesto delante
   * solo añadiría un paso.
   *
   * @param role cuál de los dos
   * @param hex el color elegido
   */
  protected setColor(role: ColorSlot['role'], hex: string): void {
    this.palette.set(role === 'primary' ? { primary: hex } : { secondary: hex });
  }

  /** Devuelve la aplicación al azul y al verde de siempre. */
  protected resetColors(): void {
    this.palette.reset();
    this.toasts.success('Colores restablecidos');
  }
}
