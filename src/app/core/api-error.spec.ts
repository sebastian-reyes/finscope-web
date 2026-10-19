import { HttpErrorResponse } from '@angular/common/http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { describeError, describeProblem } from './api-error';
import { ToastService } from './toast.service';

function apiError(
  status: number,
  code?: string,
  message = 'Something went wrong',
): HttpErrorResponse {
  return new HttpErrorResponse({
    status,
    error: code ? { status, code, message } : null,
  });
}

describe('describeProblem', () => {
  afterEach(() => vi.restoreAllMocks());

  it('traduce un código conocido sin enseñar el mensaje en inglés ni el código', () => {
    const problem = describeProblem(
      apiError(409, 'TAG_NAME_ALREADY_USED', 'A tag named Viajes already exists'),
    );

    expect(problem.title).toBe('Ese nombre ya existe');
    expect(problem.detail).not.toContain('TAG_NAME_ALREADY_USED');
    expect(problem.detail).not.toContain('already exists');
  });

  it('nombra lo que ya no existe en lugar de enseñar su id', () => {
    const problem = describeProblem(
      apiError(404, 'TRANSACTION_NOT_FOUND', 'Transaction not found with id: 42'),
    );

    expect(problem.title).toBe('Este movimiento ya no existe');
    expect(problem.detail).not.toContain('42');
  });

  it('cae en el estado cuando el código es uno que aún no conoce', () => {
    // Una API más nueva que la web puede contestar un código que aquí no está; eso no
    // puede volver a enseñar el texto en crudo.
    const problem = describeProblem(apiError(500, 'SOMETHING_NEW', 'NullPointerException'));

    expect(problem.title).toBe('Algo falló de nuestro lado');
    expect(problem.detail).not.toContain('NullPointerException');
  });

  it('distingue no tener red de que el servicio no conteste', () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get');

    onLine.mockReturnValue(false);
    expect(describeProblem(apiError(0)).title).toBe('Sin conexión');

    onLine.mockReturnValue(true);
    expect(describeProblem(apiError(0)).title).toBe('FinScope no responde');
  });

  it('da un mensaje genérico a lo que no es un fallo HTTP', () => {
    expect(describeProblem(new Error('boom')).title).toBe('Algo salió mal');
  });

  it('describeError devuelve una frase que se sostiene sola', () => {
    expect(describeError(apiError(401, 'INVALID_CREDENTIALS'))).toBe(
      'El correo o la contraseña no coinciden. Revísalos e inténtalo otra vez.',
    );
  });
});

describe('ToastService.failure', () => {
  it('pone título y explicación, y deja el error más tiempo que un éxito', () => {
    const toasts = new ToastService();

    toasts.success('Guardado');
    toasts.failure(apiError(409, 'BUDGET_ALREADY_SET'));

    const [ok, failed] = toasts.toasts();
    expect(failed.title).toBe('Ya hay un presupuesto');
    expect(failed.tone).toBe('error');
    expect(failed.visibleMs).toBeGreaterThan(ok.visibleMs);
  });
});
