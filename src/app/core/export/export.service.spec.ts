import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TransactionResponse } from '../models';
import { EXPORT_LIMIT, ExportService, ExportTooLargeError } from './export.service';

function page(index: number, count: number, totalElements: number) {
  const content = Array.from(
    { length: count },
    (_, i) => ({ id: index * 100 + i }) as unknown as TransactionResponse,
  );
  return {
    content,
    page: index,
    size: 100,
    totalElements,
    totalPages: Math.ceil(totalElements / 100),
  };
}

describe('ExportService', () => {
  let service: ExportService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ExportService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  const match = (index: number) => (request: { urlWithParams: string }) =>
    request.urlWithParams.includes(`page=${index}&size=100`);

  it('pide todas las páginas con los mismos filtros y las devuelve en orden', () => {
    const progress = vi.fn();
    let result: TransactionResponse[] = [];
    service
      .collectTransactions({ month: 9, year: 2026, tag: 'casa' }, 'amount,desc', progress)
      .subscribe((items) => (result = items));

    const first = http.expectOne(match(0));
    expect(first.request.urlWithParams).toContain('tag=casa');
    expect(first.request.urlWithParams).toContain('sort=amount,desc');
    first.flush(page(0, 100, 250));

    // Llegan desordenadas: el archivo tiene que salir igual que la lista.
    http.expectOne(match(2)).flush(page(2, 50, 250));
    http.expectOne(match(1)).flush(page(1, 100, 250));

    expect(result.map((item) => item.id)).toEqual([
      ...Array.from({ length: 100 }, (_, i) => i),
      ...Array.from({ length: 100 }, (_, i) => 100 + i),
      ...Array.from({ length: 50 }, (_, i) => 200 + i),
    ]);
    expect(progress).toHaveBeenNthCalledWith(1, 100, 250);
    expect(progress).toHaveBeenLastCalledWith(250, 250);
  });

  it('con una sola página no pide nada más', () => {
    let result: TransactionResponse[] | null = null;
    service.collectTransactions({}, 'date,desc', () => {}).subscribe((items) => (result = items));
    http.expectOne(match(0)).flush(page(0, 3, 3));

    expect(result).toHaveLength(3);
  });

  it('se niega a pasar del tope antes de pedir el resto', () => {
    let error: unknown;
    service.collectTransactions({}, 'date,desc', () => {}).subscribe({ error: (e) => (error = e) });
    http.expectOne(match(0)).flush(page(0, 100, EXPORT_LIMIT + 1));

    expect(error).toBeInstanceOf(ExportTooLargeError);
    http.expectNone(match(1));
  });
});
