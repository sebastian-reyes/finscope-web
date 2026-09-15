import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RefreshService } from './refresh.service';

describe('RefreshService', () => {
  let service: RefreshService;

  /** Una pantalla de mentira: sabe recargarse y dice cuándo está cargando. */
  function screen() {
    const busy = signal(false);
    const run = vi.fn(() => busy.set(true));
    return { busy, run, finish: () => busy.set(false) };
  }

  /** Deja correr los efectos, que es lo que apaga el indicador. */
  function settle(): void {
    TestBed.tick();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(RefreshService);
  });

  it('no hay nada que recargar mientras ninguna pantalla se registre', () => {
    expect(service.available()).toBe(false);

    service.run();

    expect(service.running()).toBe(false);
  });

  it('recarga la pantalla puesta y espera a que termine para apagarse', () => {
    const page = screen();
    service.register(page.run, page.busy);
    expect(service.available()).toBe(true);

    service.run();
    settle();

    expect(page.run).toHaveBeenCalledOnce();
    // Sigue en marcha mientras la pantalla diga que carga: el indicador es el de la espera,
    // no el del gesto.
    expect(service.running()).toBe(true);

    page.finish();
    settle();

    expect(service.running()).toBe(false);
  });

  it('no encadena dos recargas a la vez', () => {
    const page = screen();
    service.register(page.run, page.busy);

    service.run();
    settle();
    service.run();

    expect(page.run).toHaveBeenCalledOnce();
  });

  it('deja de ofrecerse cuando la pantalla se va', () => {
    const page = screen();
    const stop = service.register(page.run, page.busy);

    stop();

    expect(service.available()).toBe(false);
    service.run();
    expect(page.run).not.toHaveBeenCalled();
  });

  it('la pantalla que llega sustituye a la anterior', () => {
    const first = screen();
    const second = screen();
    service.register(first.run, first.busy);
    service.register(second.run, second.busy);

    service.run();

    expect(first.run).not.toHaveBeenCalled();
    expect(second.run).toHaveBeenCalledOnce();
  });

  it('se rinde sola si la pantalla nunca dice que ha terminado', () => {
    vi.useFakeTimers();
    try {
      const busy = signal(false);
      // Una pantalla que recarga sin encender su señal de carga: lo sirvió la caché al
      // instante. Sin el respaldo, el indicador se quedaría girando para siempre.
      service.register(() => undefined, busy);

      service.run();
      settle();
      expect(service.running()).toBe(true);

      vi.advanceTimersByTime(8000);

      expect(service.running()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
