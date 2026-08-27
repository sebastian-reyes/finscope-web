import { Injectable, signal } from '@angular/core';

/** Aviso breve que aparece tras una operación. */
export interface Toast {
  id: number;
  text: string;
  tone: 'success' | 'error';
}

const VISIBLE_MS = 4000;

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
    this.push(text, 'success');
  }

  error(text: string): void {
    this.push(text, 'error');
  }

  dismiss(id: number): void {
    this.items.update((current) => current.filter((toast) => toast.id !== id));
  }

  private push(text: string, tone: Toast['tone']): void {
    const id = this.nextId++;
    this.items.update((current) => [...current, { id, text, tone }]);
    setTimeout(() => this.dismiss(id), VISIBLE_MS);
  }
}
