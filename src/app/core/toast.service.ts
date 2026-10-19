import { Injectable, signal } from '@angular/core';
import { describeProblem } from './api-error';

/** Aviso breve que aparece tras una operación. */
export interface Toast {
  id: number;
  /** Lo que ha pasado en pocas palabras; los avisos de éxito no lo necesitan. */
  title?: string;
  text: string;
  tone: 'success' | 'error';
  /** Cuánto se queda en pantalla; la barra que se vacía lo enseña. */
  visibleMs: number;
}

const VISIBLE_MS = 4000;

/**
 * Un error se queda más: hay que leerlo entero y, muchas veces, hacer algo después. Lo que
 * se lee de reojo es el éxito.
 */
const ERROR_VISIBLE_MS = 8000;

/**
 * Avisos breves de resultado.
 *
 * Guardar un movimiento no debe interrumpir a nadie con un diálogo: el aviso aparece, se
 * lee de reojo y se va solo. Los errores usan el mismo canal para que el usuario no tenga
 * que buscar en dos sitios qué ha pasado.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly items = signal<Toast[]>([]);
  private nextId = 1;

  readonly toasts = this.items.asReadonly();

  success(text: string): void {
    this.push({ text, tone: 'success', visibleMs: VISIBLE_MS });
  }

  error(text: string, title?: string): void {
    this.push({ title, text, tone: 'error', visibleMs: ERROR_VISIBLE_MS });
  }

  /** Cuenta un fallo recibido —de la API o no— con su título y su explicación. */
  failure(error: unknown): void {
    const problem = describeProblem(error);
    this.error(problem.detail, problem.title);
  }

  dismiss(id: number): void {
    this.items.update((current) => current.filter((toast) => toast.id !== id));
  }

  private push(toast: Omit<Toast, 'id'>): void {
    const id = this.nextId++;
    this.items.update((current) => [...current, { id, ...toast }]);
    setTimeout(() => this.dismiss(id), toast.visibleMs);
  }
}
