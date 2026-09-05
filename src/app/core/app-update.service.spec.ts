import { TestBed } from '@angular/core/testing';
import { SwUpdate, UnrecoverableStateEvent, VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppUpdateService } from './app-update.service';

/** El trabajador de servicio, fingido: en una prueba no hay ninguno registrado. */
class FakeSwUpdate {
  isEnabled = true;
  readonly versionUpdates = new Subject<VersionEvent>();
  readonly unrecoverable = new Subject<UnrecoverableStateEvent>();
  readonly checkForUpdate = vi.fn().mockResolvedValue(false);
  readonly activateUpdate = vi.fn().mockResolvedValue(true);
}

/** La versión nueva ya descargada y lista para entrar. */
const VERSION_READY = {
  type: 'VERSION_READY',
  currentVersion: { hash: 'viejo' },
  latestVersion: { hash: 'nuevo' },
} as VersionEvent;

describe('AppUpdateService', () => {
  let updates: FakeSwUpdate;
  let reload: ReturnType<typeof vi.spyOn>;

  /** Vuelve a la aplicación, que es una de las veces que se pregunta por versiones. */
  function returnToApp(): void {
    document.dispatchEvent(new Event('visibilitychange'));
  }

  function service(): AppUpdateService {
    return TestBed.inject(AppUpdateService);
  }

  beforeEach(() => {
    updates = new FakeSwUpdate();
    // `location` no se deja sustituir, así que se mira el método del servicio que recarga.
    reload = vi.spyOn(AppUpdateService.prototype as unknown as { reload: () => void }, 'reload');
    reload.mockImplementation(() => {});

    TestBed.configureTestingModule({
      providers: [{ provide: SwUpdate, useValue: updates }],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('enciende el aviso cuando hay una versión nueva descargada', () => {
    const update = service();
    expect(update.ready()).toBe(false);

    updates.versionUpdates.next(VERSION_READY);

    expect(update.ready()).toBe(true);
  });

  it('no se da por enterado con los avisos previos a que la versión esté lista', () => {
    const update = service();

    updates.versionUpdates.next({
      type: 'VERSION_DETECTED',
      version: { hash: 'nuevo' },
    } as VersionEvent);

    expect(update.ready()).toBe(false);
  });

  it('pregunta al abrir y cada vez que se vuelve a la aplicación', () => {
    service();
    expect(updates.checkForUpdate).toHaveBeenCalledTimes(1);

    returnToApp();

    expect(updates.checkForUpdate).toHaveBeenCalledTimes(2);
  });

  it('deja de preguntar cuando ya hay una versión esperando', () => {
    service();
    updates.versionUpdates.next(VERSION_READY);

    returnToApp();

    expect(updates.checkForUpdate).toHaveBeenCalledTimes(1);
  });

  it('no vigila nada donde no hay trabajador de servicio', () => {
    updates.isEnabled = false;

    service();
    returnToApp();

    expect(updates.checkForUpdate).not.toHaveBeenCalled();
  });

  it('activa la versión y recarga con ella', async () => {
    const update = service();
    updates.versionUpdates.next(VERSION_READY);

    await update.apply();

    expect(updates.activateUpdate).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  it('recarga igualmente si activar la versión falla', async () => {
    updates.activateUpdate.mockRejectedValue(new Error('caché corrupta'));
    const update = service();

    await expect(update.apply()).rejects.toThrow();

    expect(reload).toHaveBeenCalledOnce();
  });

  it('recarga sin preguntar cuando la caché queda irrecuperable', () => {
    service();

    updates.unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'roto' });

    expect(reload).toHaveBeenCalledOnce();
  });

  it('deja de escuchar la vuelta a la aplicación cuando se destruye el inyector', () => {
    service();
    TestBed.resetTestingModule();

    returnToApp();

    expect(updates.checkForUpdate).toHaveBeenCalledTimes(1);
  });
});
