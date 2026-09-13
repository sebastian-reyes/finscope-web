import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ExchangeRateService } from './exchange-rate.service';
import { TransactionResponse } from './models';

const LAST_IN_DOLLARS: TransactionResponse = {
  id: 7,
  amount: 15.99,
  currency: 'USD',
  exchangeRate: 3.55,
  description: 'Netflix',
  date: '2026-09-05T10:00:00',
  transactionType: { id: 2, name: 'Egreso', code: 'EXPENSE' },
  category: {
    id: 4,
    name: 'Suscripciones',
    appliesTo: 'EXPENSE',
    isSystem: false,
    transactionCount: 3,
  },
  tags: [],
};

/** La consulta que resuelve cuál fue la última tasa: el movimiento más reciente en esa moneda. */
const LAST_QUERY = '/transactions?currency=USD&page=0&size=1&sort=date,desc';

describe('ExchangeRateService', () => {
  let service: ExchangeRateService;
  let http: HttpTestingController;

  /**
   * Contesta a la consulta con el movimiento indicado, o sin ninguno.
   *
   * @param transaction último movimiento en esa moneda, si lo hay
   */
  function settle(transaction?: TransactionResponse): void {
    const content = transaction ? [transaction] : [];
    http.expectOne(LAST_QUERY).flush({
      content,
      page: 0,
      size: 1,
      totalElements: content.length,
      totalPages: content.length,
    });
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ExchangeRateService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('trae la tasa del movimiento más reciente en esa moneda', () => {
    service.ensureLoaded('USD');
    settle(LAST_IN_DOLLARS);

    expect(service.lastRate('USD')).toEqual({ rate: 3.55, date: '2026-09-05T10:00:00' });
  });

  it('pregunta una sola vez por moneda', () => {
    service.ensureLoaded('USD');
    settle(LAST_IN_DOLLARS);

    // Abrir el formulario tres veces no son tres consultas: lo que se sabe, se sabe.
    service.ensureLoaded('USD');
    service.ensureLoaded('USD');

    http.expectNone(LAST_QUERY);
  });

  it('no propone nada cuando todavía no hay ningún movimiento en esa moneda', () => {
    service.ensureLoaded('USD');
    settle();

    // El campo se queda vacío y obligatorio, como estaba antes de existir la propuesta.
    expect(service.lastRate('USD')).toBeNull();
  });

  it('se queda con lo que se acaba de guardar sin volver a preguntar', () => {
    service.remember('USD', 3.7, '2026-09-13T09:00:00');

    expect(service.lastRate('USD')).toEqual({ rate: 3.7, date: '2026-09-13T09:00:00' });
    // Ya se sabe cuál es la última: preguntarlo sería pedir la respuesta que se acaba de dar.
    service.ensureLoaded('USD');
    http.expectNone(LAST_QUERY);
  });

  it('vuelve a intentarlo si la consulta falló', () => {
    service.ensureLoaded('USD');
    http.expectOne(LAST_QUERY).error(new ProgressEvent('error'));

    // Un fallo no se recuerda como «no hay ninguna»: esto es una comodidad, y la próxima vez
    // que se elija la moneda vuelve a intentarse.
    expect(service.lastRate('USD')).toBeNull();
    service.ensureLoaded('USD');
    settle(LAST_IN_DOLLARS);
    expect(service.lastRate('USD')?.rate).toBe(3.55);
  });

  it('no sabe de la moneda base, que no se convierte a sí misma', () => {
    expect(service.lastRate('PEN')).toBeNull();
  });
});
