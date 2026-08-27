import { Injectable, inject, signal } from '@angular/core';
import { Subject, forkJoin } from 'rxjs';
import { FinscopeService } from './finscope.service';
import { ToastService } from './toast.service';
import { describeError } from './api-error';
import {
  CategoryResponse,
  TagResponse,
  TransactionResponse,
  TransactionTypeResponse,
} from './models';

/** Lo que acaba de pasarle a un movimiento desde el editor. */
export type TransactionChange =
  /** Alta o edición guardada, con el identificador del movimiento. */
  { kind: 'saved'; id: number } | { kind: 'deleted' };

/**
 * El editor de movimientos, como hoja de toda la aplicación.
 *
 * Registrar es lo que se viene a hacer aquí, y el botón central de la barra inferior lo
 * ofrece desde cualquier pantalla: por eso el editor no puede vivir dentro del historial,
 * sino en la carcasa. Este servicio es lo que las dos partes comparten: quien quiera abrirlo
 * lo pide, la carcasa lo dibuja y quien tenga una lista en pantalla se entera por
 * `changes$` de que hay algo que recargar.
 *
 * Los catálogos que el formulario necesita —tipos, categorías y tags— viven también aquí y
 * no en cada pantalla: son los mismos tres para todas, cambian al guardar y así se piden
 * una vez en lugar de una por sitio desde el que se abra el editor.
 */
@Injectable({ providedIn: 'root' })
export class TransactionEditorService {
  private readonly api = inject(FinscopeService);
  private readonly toasts = inject(ToastService);

  private readonly openSignal = signal(false);
  private readonly targetSignal = signal<TransactionResponse | null>(null);
  private readonly typesSignal = signal<TransactionTypeResponse[]>([]);
  private readonly categoriesSignal = signal<CategoryResponse[]>([]);
  private readonly catalogueSignal = signal<TagResponse[]>([]);

  /** Si la hoja está en pantalla. */
  readonly isOpen = this.openSignal.asReadonly();

  /** Movimiento que se está editando, o nulo cuando es un alta. */
  readonly target = this.targetSignal.asReadonly();

  readonly types = this.typesSignal.asReadonly();
  readonly categories = this.categoriesSignal.asReadonly();
  readonly catalogue = this.catalogueSignal.asReadonly();

  private readonly changes = new Subject<TransactionChange>();

  /** Altas, ediciones y borrados hechos desde la hoja, para quien tenga que recargarse. */
  readonly changes$ = this.changes.asObservable();

  /** Abre la hoja en blanco, para registrar un movimiento nuevo. */
  openCreate(): void {
    this.targetSignal.set(null);
    this.open();
  }

  /**
   * Abre la hoja sobre un movimiento que ya existe.
   *
   * @param transaction movimiento a editar
   */
  openEdit(transaction: TransactionResponse): void {
    this.targetSignal.set(transaction);
    this.open();
  }

  close(): void {
    this.openSignal.set(false);
    this.targetSignal.set(null);
  }

  /**
   * Da por buena un alta o una edición: cierra la hoja y lo cuenta.
   *
   * @param id identificador del movimiento guardado
   */
  notifySaved(id: number): void {
    this.close();
    this.refreshCatalogues();
    this.changes.next({ kind: 'saved', id });
  }

  notifyDeleted(): void {
    this.close();
    this.refreshCatalogues();
    this.changes.next({ kind: 'deleted' });
  }

  /**
   * Vuelve a pedir los tres catálogos.
   * Hace falta tras cada guardado porque el número de movimientos de cada categoría y de
   * cada tag cambia con ellos, y ese conteo es lo que ordena y anota las fichas.
   */
  refreshCatalogues(): void {
    forkJoin({
      types: this.api.listTransactionTypes(),
      categories: this.api.listCategories(),
      catalogue: this.api.listTags(),
    }).subscribe({
      next: ({ types, categories, catalogue }) => {
        this.typesSignal.set(types);
        this.categoriesSignal.set(categories);
        this.catalogueSignal.set(catalogue);
      },
      // Un catálogo que no llega deja el formulario sin categorías que ofrecer, y eso hay
      // que decirlo; lo que no se puede es tumbar con ello la pantalla que hay detrás, que
      // sigue siendo legible.
      error: (error) => this.toasts.error(describeError(error)),
    });
  }

  /**
   * Enseña la hoja y se asegura de que llegan los catálogos.
   * Se piden solo la primera vez: abrir el editor no debería costar tres peticiones cada
   * vez, y a partir de ahí los refresca cada guardado.
   */
  private open(): void {
    if (!this.typesSignal().length) {
      this.refreshCatalogues();
    }
    this.openSignal.set(true);
  }
}
