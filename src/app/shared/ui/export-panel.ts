import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  signal,
} from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { describeError } from '../../core/api-error';
import {
  EXPORT_LIMIT,
  ExportProgress,
  ExportService,
  ExportTooLargeError,
} from '../../core/export/export.service';
import { ExportFormat, ExportReport } from '../../core/export/report';

/** Lo que una pantalla pide exportar. */
export interface ExportRequest {
  /** Qué se exporta, en una frase: «Tus movimientos». */
  subject: string;
  /** Lo que acota la exportación, tal y como se enseña: el periodo y cada filtro puesto. */
  scope: { label: string; value: string }[];
  /** Cómo reunir los datos y armar el informe, avisando del avance. */
  run: () => Observable<ExportProgress>;
}

interface FormatChoice {
  format: ExportFormat;
  name: string;
  hint: string;
  icon: string;
}

const FORMATS: FormatChoice[] = [
  {
    format: 'xlsx',
    name: 'Excel',
    hint: 'Tabla lista para filtrar y sumar, con una hoja de resumen.',
    icon: 'bi-file-earmark-spreadsheet',
  },
  {
    format: 'pdf',
    name: 'PDF',
    hint: 'Informe para leer, imprimir o mandar: totales, reparto y detalle.',
    icon: 'bi-file-earmark-pdf',
  },
  {
    format: 'csv',
    name: 'CSV',
    hint: 'Datos planos para llevar a otra aplicación u hoja de cálculo.',
    icon: 'bi-filetype-csv',
  },
];

const SIZE = new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 });

/**
 * El contenido de la hoja de exportar: se elige el formato y el archivo baja.
 *
 * La hoja la pone cada pantalla, con su `fs-bottom-sheet` y sus animaciones de entrada y
 * salida: la de salida tiene que colgar del elemento que se quita, y si la hoja viviera aquí
 * dentro se quitaría este componente y la hoja desaparecería de golpe.
 *
 * Enseña arriba lo que va a salir —el periodo y los filtros puestos— porque eso es lo que
 * decide qué filas lleva el archivo, y descubrirlo después de abrirlo sería tarde. El informe
 * se arma una sola vez: cambiar de formato tras la primera descarga no vuelve a pedir nada.
 */
@Component({
  selector: 'fs-export-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fs-xp">
      <div class="fs-xp__scope">
        <p class="fs-xp__subject">{{ request().subject }}</p>
        <ul class="fs-xp__chips" aria-label="Lo que se exporta">
          @for (item of request().scope; track item.label) {
            <li class="fs-xp__chip">
              <span>{{ item.label }}</span> {{ item.value }}
            </li>
          }
        </ul>
      </div>

      @switch (phase()) {
        @case ('working') {
          <div class="fs-xp__state" role="status">
            <span class="fs-spinner" aria-hidden="true"></span>
            <div class="fs-xp__state-text">
              <p class="fs-xp__state-title">Preparando tu {{ chosenName() }}…</p>
              @if (progress(); as p) {
                <p class="fs-xp__state-hint">{{ p.loaded }} de {{ p.total }} registros</p>
                <span class="fs-xp__bar" aria-hidden="true">
                  <span [style.width.%]="p.total ? (p.loaded / p.total) * 100 : 100"></span>
                </span>
              }
            </div>
          </div>
        }
        @case ('ready') {
          @if (file(); as ready) {
            <div class="fs-xp__done">
              <span class="fs-xp__done-icon" aria-hidden="true">
                <i class="bi bi-check2"></i>
              </span>
              <div class="fs-xp__state-text">
                <p class="fs-xp__state-title">Listo, se está descargando</p>
                <p class="fs-xp__state-hint fs-xp__file">
                  {{ ready.name }} · {{ size(ready.size) }}
                </p>
              </div>
            </div>
            <div class="fs-xp__actions">
              <button type="button" class="fs-btn fs-btn--outline" (click)="downloadAgain()">
                <i class="bi bi-download" aria-hidden="true"></i>Descargar de nuevo
              </button>
              @if (shareable()) {
                <button type="button" class="fs-btn fs-btn--soft" (click)="share()">
                  <i class="bi bi-share" aria-hidden="true"></i>Compartir
                </button>
              }
            </div>
            <button type="button" class="fs-btn fs-btn--ghost fs-btn--sm" (click)="back()">
              <i class="bi bi-arrow-left" aria-hidden="true"></i>Elegir otro formato
            </button>
          }
        }
        @default {
          @if (error(); as message) {
            <div class="fs-alert" role="alert">
              <i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
              <div>
                <p class="fs-alert__title">No se pudo exportar</p>
                <p>{{ message }}</p>
              </div>
            </div>
          }
          <p class="fs-xp__ask" id="exportFormatLabel">¿En qué formato?</p>
          <div class="fs-xp__formats" role="group" aria-labelledby="exportFormatLabel">
            @for (choice of formats; track choice.format) {
              <button
                type="button"
                class="fs-xp__format"
                [class]="'fs-xp__format fs-xp__format--' + choice.format"
                (click)="choose(choice)"
              >
                <span class="fs-xp__icon" aria-hidden="true">
                  <i class="bi" [class]="'bi ' + choice.icon"></i>
                </span>
                <span class="fs-xp__text">
                  <span class="fs-xp__name">{{ choice.name }}</span>
                  <span class="fs-xp__hint">{{ choice.hint }}</span>
                </span>
                <i class="bi bi-chevron-right fs-xp__go" aria-hidden="true"></i>
              </button>
            }
          </div>
        }
      }
    </div>
  `,
  styles: `
    .fs-xp {
      display: grid;
      gap: 1.1rem;
      padding-bottom: 0.25rem;
    }

    .fs-xp__scope {
      padding: 0.85rem 1rem;
      border-radius: var(--fs-radius);
      background-color: var(--fs-surface-sunken);
    }

    .fs-xp__subject {
      margin: 0 0 0.55rem;
      font-weight: 650;
    }

    .fs-xp__chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.4rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .fs-xp__chip {
      padding: 0.25rem 0.65rem;
      border-radius: 999px;
      background-color: var(--fs-brand-tint);
      color: var(--fs-brand);
      font-size: var(--fs-text-sm);
      font-weight: 600;
    }

    .fs-xp__chip span {
      color: var(--fs-ink-muted);
      font-weight: 500;
    }

    .fs-xp__ask {
      margin: 0 0 -0.4rem;
      font-size: var(--fs-text-sm);
      font-weight: 600;
      color: var(--fs-ink-muted);
    }

    .fs-xp__formats {
      display: grid;
      gap: 0.6rem;
    }

    .fs-xp__format {
      --fs-xp-ink: var(--fs-brand);
      --fs-xp-tint: var(--fs-brand-tint);
      display: flex;
      align-items: center;
      gap: 0.85rem;
      width: 100%;
      padding: 0.8rem 0.9rem;
      border: 1px solid var(--fs-line);
      border-radius: var(--fs-radius);
      background-color: var(--fs-surface);
      color: var(--fs-ink);
      text-align: left;
      cursor: pointer;
      transition:
        border-color 0.15s ease,
        box-shadow 0.15s ease,
        transform 0.15s ease;
    }

    .fs-xp__format:hover {
      border-color: var(--fs-xp-ink);
      box-shadow: 0 6px 18px rgba(9, 13, 20, 0.08);
    }

    .fs-xp__format:active {
      transform: scale(0.99);
    }

    .fs-xp__format:focus-visible {
      outline: none;
      box-shadow: var(--fs-focus-tint);
    }

    /* Los colores con que cada programa pinta su propio icono: se reconocen antes de leerse. */
    .fs-xp__format--xlsx {
      --fs-xp-ink: #1d7044;
      --fs-xp-tint: #e3f1e9;
    }

    .fs-xp__format--pdf {
      --fs-xp-ink: #c0392e;
      --fs-xp-tint: #fbeae8;
    }

    :host-context([data-theme='dark']) .fs-xp__format--xlsx {
      --fs-xp-ink: #4cc38a;
      --fs-xp-tint: #16291f;
    }

    :host-context([data-theme='dark']) .fs-xp__format--pdf {
      --fs-xp-ink: #e8766b;
      --fs-xp-tint: #2e1e1c;
    }

    .fs-xp__icon {
      display: grid;
      flex: none;
      place-items: center;
      width: 2.75rem;
      height: 2.75rem;
      border-radius: var(--fs-radius-control);
      background-color: var(--fs-xp-tint);
      color: var(--fs-xp-ink);
      font-size: 1.3rem;
    }

    .fs-xp__text {
      display: grid;
      flex: 1;
      gap: 0.1rem;
      min-width: 0;
    }

    .fs-xp__name {
      font-weight: 650;
    }

    .fs-xp__hint {
      font-size: var(--fs-text-sm);
      color: var(--fs-ink-muted);
    }

    .fs-xp__go {
      color: var(--fs-ink-faint);
    }

    .fs-xp__state,
    .fs-xp__done {
      display: flex;
      align-items: center;
      gap: 0.9rem;
      padding: 1rem 0.25rem;
    }

    .fs-xp__state-text {
      flex: 1;
      min-width: 0;
    }

    .fs-xp__state-title {
      margin: 0;
      font-weight: 650;
    }

    .fs-xp__state-hint {
      margin: 0.15rem 0 0;
      font-size: var(--fs-text-sm);
      color: var(--fs-ink-muted);
    }

    .fs-xp__file {
      overflow-wrap: anywhere;
    }

    .fs-xp__bar {
      display: block;
      height: 0.375rem;
      margin-top: 0.6rem;
      overflow: hidden;
      border-radius: 999px;
      background-color: var(--fs-line);
    }

    .fs-xp__bar span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background-image: linear-gradient(
        90deg in oklch shorter hue,
        var(--fs-brand),
        var(--fs-accent)
      );
      transition: width 0.25s ease;
    }

    .fs-xp__done-icon {
      display: grid;
      flex: none;
      place-items: center;
      width: 2.75rem;
      height: 2.75rem;
      border-radius: 50%;
      background-color: var(--fs-income-tint);
      color: var(--fs-income);
      font-size: 1.4rem;
    }

    .fs-xp__actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .fs-xp__actions .fs-btn {
      flex: 1 1 10rem;
    }
  `,
})
export class ExportPanelComponent {
  private readonly exporter = inject(ExportService);

  readonly request = input.required<ExportRequest>();

  protected readonly formats = FORMATS;
  protected readonly phase = signal<'choose' | 'working' | 'ready'>('choose');
  protected readonly progress = signal<{ loaded: number; total: number } | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly file = signal<File | null>(null);
  protected readonly shareable = signal(false);
  protected readonly chosenName = signal('');

  /** El informe ya armado, para no volver a pedir nada al cambiar de formato. */
  private report: ExportReport | null = null;
  private running: Subscription | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.running?.unsubscribe());
  }

  protected choose(choice: FormatChoice): void {
    this.error.set(null);
    this.chosenName.set(choice.name);
    if (this.report) {
      this.finish(this.report, choice.format);
      return;
    }
    this.phase.set('working');
    this.progress.set(null);
    this.running = this.request()
      .run()
      .subscribe({
        next: (step) => {
          if (step.kind === 'progress') {
            this.progress.set({ loaded: step.loaded, total: step.total });
          } else {
            this.report = step.report;
            this.finish(step.report, choice.format);
          }
        },
        error: (error: unknown) => {
          this.phase.set('choose');
          this.error.set(
            error instanceof ExportTooLargeError
              ? `Son ${error.total} movimientos y el máximo por archivo es ${EXPORT_LIMIT}. ` +
                  'Acota el periodo o añade un filtro.'
              : describeError(error),
          );
        },
      });
  }

  /** Escribe el archivo y lo baja. */
  private finish(report: ExportReport, format: ExportFormat): void {
    try {
      const file = this.exporter.render(report, format);
      this.file.set(file);
      this.shareable.set(this.exporter.canShare(file));
      this.exporter.download(file);
      this.phase.set('ready');
    } catch (error) {
      this.phase.set('choose');
      this.error.set(error instanceof Error ? error.message : 'No se pudo escribir el archivo.');
    }
  }

  protected downloadAgain(): void {
    const file = this.file();
    if (file) {
      this.exporter.download(file);
    }
  }

  protected share(): void {
    const file = this.file();
    if (file) {
      this.exporter.share(file).subscribe({
        error: (error: unknown) => this.error.set(describeError(error)),
      });
    }
  }

  protected back(): void {
    this.phase.set('choose');
  }

  /** Tamaño del archivo en palabras: «18.4 kB». */
  protected size(bytes: number): string {
    return bytes < 1024 * 1024
      ? `${SIZE.format(bytes / 1024)} kB`
      : `${SIZE.format(bytes / 1024 / 1024)} MB`;
  }
}
