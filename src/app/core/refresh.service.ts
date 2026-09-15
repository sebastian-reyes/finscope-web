import { DestroyRef, Injectable, Signal, effect, inject, signal } from '@angular/core';

/**
 * Cuánto se espera como mucho a que la pantalla diga que ha terminado. Es un respaldo, no el
 * caso normal: una pantalla que recargue sin encender su señal de carga —porque lo sirvió la
 * caché al instante— dejaría el indicador girando para siempre.
 */
const MAX_WAIT = 8000;

/** Lo que una pantalla ofrece para poder recargarse desde fuera. */
interface Refreshable {
  /** Vuelve a pedir lo que la pantalla enseña. */
  run: () => void;
  /** Si la pantalla está cargando ahora mismo, que es lo que apaga el indicador. */
  busy: Signal<boolean>;
}

/**
 * Recargar la pantalla que se está mirando, desde fuera de ella.
 *
 * Existe porque el gesto de arrastrar hacia abajo vive en la carcasa —es el marco el que lo
 * recibe, no la pantalla— y lo que hay que recargar solo lo sabe la pantalla: cada una pide
 * unas cosas distintas y con unos filtros que son suyos. Así que cada pantalla deja aquí su
 * forma de recargarse mientras está puesta, y la carcasa la invoca sin saber qué hace.
 *
 * Hay un solo hueco a propósito: solo hay una pantalla puesta a la vez. Si mañana hubiera
 * dos, esto tendría que ser una lista y el gesto tendría que decidir a cuál va, que es una
 * pregunta que hoy no existe.
 */
@Injectable({ providedIn: 'root' })
export class RefreshService {
  /** La pantalla puesta, si sabe recargarse. */
  private readonly source = signal<Refreshable | null>(null);

  /** Si hay algo que recargar: sin esto, el gesto no debería ni insinuarse. */
  readonly available = signal(false);

  /** Si hay una recarga en curso, que es lo que mantiene el indicador girando. */
  readonly running = signal(false);

  /**
   * Si la pantalla ha llegado a decir que cargaba. Sin esta marca, el efecto apagaría el
   * indicador en el mismo frame en que se enciende: cuando se llama a `run()`, la señal de
   * carga todavía vale `false` y la petición aún no ha salido.
   */
  private started = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      const source = this.source();
      const busy = source?.busy() ?? false;
      if (!this.running()) {
        return;
      }
      if (busy) {
        this.started = true;
      } else if (this.started) {
        this.stop();
      }
    });

    inject(DestroyRef).onDestroy(() => this.clearTimer());
  }

  /**
   * Deja aquí cómo se recarga la pantalla mientras esté puesta.
   *
   * @param run  lo que vuelve a pedir lo que la pantalla enseña
   * @param busy señal de carga de esa misma pantalla
   * @return la función que lo retira, para llamarla al destruirse la pantalla
   */
  register(run: () => void, busy: Signal<boolean>): () => void {
    const entry: Refreshable = { run, busy };
    this.source.set(entry);
    this.available.set(true);
    return () => {
      if (this.source() === entry) {
        this.source.set(null);
        this.available.set(false);
        this.stop();
      }
    };
  }

  /** Recarga la pantalla puesta. No hace nada si no hay ninguna o si ya se está recargando. */
  run(): void {
    const source = this.source();
    if (!source || this.running()) {
      return;
    }
    this.started = false;
    this.running.set(true);
    this.clearTimer();
    this.timer = setTimeout(() => this.stop(), MAX_WAIT);
    source.run();
  }

  private stop(): void {
    this.started = false;
    this.clearTimer();
    this.running.set(false);
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
