import { Injectable, computed, effect, signal } from '@angular/core';

const THEME_KEY = 'finscope.theme';

/** Aspecto elegido. `system` deja mandar a la preferencia del sistema operativo. */
export type ThemePreference = 'light' | 'dark' | 'system';

/**
 * Aspecto claro u oscuro de la aplicación.
 * Bootstrap 5.3 resuelve el tema con el atributo `data-theme` del documento, así que
 * aquí solo se decide su valor y se recuerda entre sesiones. La opción `system` no escribe
 * un tema fijo: escucha al sistema, de modo que cambiarlo fuera se nota dentro sin recargar.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly media = window.matchMedia('(prefers-color-scheme: dark)');
  private readonly systemPrefersDark = signal(this.media.matches);
  private readonly preferenceSignal = signal<ThemePreference>(readStoredPreference());

  readonly preference = this.preferenceSignal.asReadonly();

  /** Aspecto que acaba viéndose, ya resuelto el caso de seguir al sistema. */
  readonly resolved = computed<'light' | 'dark'>(() => {
    const preference = this.preferenceSignal();
    if (preference !== 'system') {
      return preference;
    }
    return this.systemPrefersDark() ? 'dark' : 'light';
  });

  constructor() {
    this.media.addEventListener('change', (event) => this.systemPrefersDark.set(event.matches));
    // Un efecto y no una llamada suelta: siguiendo al sistema, el tema puede cambiar sin
    // que nadie toque nada dentro de la aplicación.
    effect(() => document.documentElement.setAttribute('data-theme', this.resolved()));
  }

  set(preference: ThemePreference): void {
    this.preferenceSignal.set(preference);
    localStorage.setItem(THEME_KEY, preference);
  }

  /** Alterna entre claro y oscuro tomando como punto de partida lo que se ve ahora. */
  toggle(): void {
    this.set(this.resolved() === 'dark' ? 'light' : 'dark');
  }
}

function readStoredPreference(): ThemePreference {
  const stored = localStorage.getItem(THEME_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}
