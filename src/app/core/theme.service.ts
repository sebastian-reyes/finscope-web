import { Injectable, computed, effect, inject, linkedSignal, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { PreferenceOwner, readPreference, writePreference } from './preferences';

const THEME_KEY = 'finscope.theme';

/** Aspecto elegido. `system` deja mandar a la preferencia del sistema operativo. */
export type ThemePreference = 'light' | 'dark' | 'system';

/**
 * Aspecto claro u oscuro de la aplicación.
 * El tema se resuelve con el atributo `data-theme` del documento, así que aquí solo se
 * decide su valor y se recuerda entre sesiones. La opción `system` no escribe un tema fijo:
 * escucha al sistema, de modo que cambiarlo fuera se nota dentro sin recargar.
 *
 * Lo elegido se guarda a nombre de quien lo elige, no del navegador: cerrar sesión no vacía
 * el `localStorage`, y con una sola clave la siguiente persona que entrara heredaba el tema
 * de la anterior. Al entrar y al salir se relee el que toque, de ahí el `linkedSignal`.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly auth = inject(AuthService);
  private readonly media = window.matchMedia('(prefers-color-scheme: dark)');
  private readonly systemPrefersDark = signal(this.media.matches);

  /** De quién es lo que se está leyendo. Sin sesión es la ranura anónima, que es la que
   *  recuerda el interruptor de la pantalla de acceso. */
  private readonly owner = computed<PreferenceOwner>(() => this.auth.user()?.id ?? null);

  private readonly preferenceSignal = linkedSignal({
    source: this.owner,
    computation: (owner: PreferenceOwner) => readStoredPreference(owner),
  });

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
    writePreference(THEME_KEY, this.owner(), preference);
  }

  /** Alterna entre claro y oscuro tomando como punto de partida lo que se ve ahora. */
  toggle(): void {
    this.set(this.resolved() === 'dark' ? 'light' : 'dark');
  }
}

function readStoredPreference(owner: PreferenceOwner): ThemePreference {
  const stored = readPreference(THEME_KEY, owner);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}
