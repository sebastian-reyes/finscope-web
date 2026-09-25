import { ThemePreference } from '../../core/theme.service';

/** Una de las tres formas de elegir el aspecto, con el icono que la representa. */
export interface ThemeOption {
  value: ThemePreference;
  label: string;
  icon: string;
}

/**
 * Las tres opciones del tema. Las usan el conmutador de su pantalla y la fila del menú, que
 * enseña la elegida al lado del rótulo.
 */
export const THEME_OPTIONS: readonly ThemeOption[] = [
  { value: 'light', label: 'Claro', icon: 'bi-sun' },
  { value: 'dark', label: 'Oscuro', icon: 'bi-moon-stars' },
  // «Sistema» y no «El del sistema»: las tres opciones con su icono tienen que caber en una
  // línea, porque la pastilla que se desliza por el control se coloca suponiendo una.
  { value: 'system', label: 'Sistema', icon: 'bi-circle-half' },
];
