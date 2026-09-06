import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { ConnectionService } from './connection.service';

/** Finge lo que el navegador cree de la red, que en jsdom siempre dice que sí. */
function setOnLine(value: boolean): void {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value });
}

describe('ConnectionService', () => {
  afterEach(() => setOnLine(true));

  it('parte de lo que el navegador dice al arrancar', () => {
    setOnLine(false);

    expect(TestBed.inject(ConnectionService).online()).toBe(false);
  });

  it('se entera de que se cae la red y de que vuelve', () => {
    // De esto depende el aviso: mientras no haya red, lo que se ve en pantalla puede venir de
    // la copia del trabajador de servicio y hay que decirlo.
    const connection = TestBed.inject(ConnectionService);
    expect(connection.online()).toBe(true);

    window.dispatchEvent(new Event('offline'));
    expect(connection.online()).toBe(false);

    window.dispatchEvent(new Event('online'));
    expect(connection.online()).toBe(true);
  });
});
