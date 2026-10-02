import { Injectable, inject } from '@angular/core';
import { Observable, defer, from, map, mergeMap, of, reduce, scan, switchMap } from 'rxjs';
import { FinscopeService } from '../finscope.service';
import { TransactionFilters, TransactionResponse } from '../models';
import { PaletteService } from '../palette.service';
import { EXPORT_MIME, ExportFormat, ExportReport, reportToCsv } from './report';
import { reportToPdf } from './report-pdf';
import { reportToXlsx } from './xlsx';

/** Lo más que la API devuelve en una página. */
const PAGE_SIZE = 100;

/**
 * Tope de movimientos de una exportación.
 * Son cincuenta peticiones, un sexto del límite por minuto de la API: más allá, quien exporta
 * se quedaría sin poder usar la aplicación un rato, y un periodo así se acota mejor por fechas.
 */
export const EXPORT_LIMIT = 5000;

/** Cuántas páginas se piden a la vez. */
const CONCURRENCY = 3;

/** El avance de una exportación, o su resultado. */
export type ExportProgress =
  { kind: 'progress'; loaded: number; total: number } | { kind: 'done'; report: ExportReport };

/** Se exportaría más de lo que se permite. */
export class ExportTooLargeError extends Error {
  constructor(readonly total: number) {
    super(`Son ${total} movimientos`);
  }
}

/**
 * Reúne lo que se exporta y lo convierte en un archivo.
 *
 * Las pantallas solo dicen qué filtros tienen puestos; de pedir todas las páginas, elegir
 * el formato y bajar el archivo se ocupa este servicio, para que movimientos y fijos
 * exporten exactamente igual.
 */
@Injectable({ providedIn: 'root' })
export class ExportService {
  private readonly api = inject(FinscopeService);
  private readonly palette = inject(PaletteService);

  /** Los dos colores del usuario, para que el informe se parezca a su aplicación. */
  colors(): { brand: string; accent: string } {
    return { brand: this.palette.primary(), accent: this.palette.secondary() };
  }

  /**
   * Pide todos los movimientos que dejan pasar los filtros, página a página.
   *
   * La pantalla enseña veinte; el archivo tiene que llevarlos todos. Se pide la primera para
   * saber cuántas hay y el resto de tres en tres, avisando de cuántos van, y al final se
   * devuelven en el orden de la lista aunque las páginas lleguen desordenadas.
   *
   * @param filters filtros de la pantalla, tal cual
   * @param sort    orden de la lista, para que el archivo se lea igual que la pantalla
   * @param onProgress a quién avisar de cuántos van
   * @return los movimientos, en orden
   */
  collectTransactions(
    filters: TransactionFilters,
    sort: string,
    onProgress: (loaded: number, total: number) => void,
  ): Observable<TransactionResponse[]> {
    const page = (index: number) =>
      this.api.listTransactions({ ...filters, page: index, size: PAGE_SIZE, sort });
    return page(0).pipe(
      switchMap((first) => {
        if (first.totalElements > EXPORT_LIMIT) {
          throw new ExportTooLargeError(first.totalElements);
        }
        onProgress(first.content.length, first.totalElements);
        const rest = Array.from({ length: Math.max(0, first.totalPages - 1) }, (_, i) => i + 1);
        if (!rest.length) {
          return of(first.content);
        }
        return from(rest).pipe(
          mergeMap((index) => page(index).pipe(map((result) => ({ index, result }))), CONCURRENCY),
          scan(
            (pages, { index, result }) => {
              pages.set(index, result.content);
              const loaded = [...pages.values()].reduce((total, items) => total + items.length, 0);
              onProgress(loaded, first.totalElements);
              return pages;
            },
            new Map<number, TransactionResponse[]>([[0, first.content]]),
          ),
          reduce((_, pages) => pages),
          map((pages) =>
            [...pages.entries()].sort(([a], [b]) => a - b).flatMap(([, items]) => items),
          ),
        );
      }),
    );
  }

  /**
   * Convierte el informe en un archivo del formato pedido.
   *
   * @param report informe ya armado
   * @param format formato
   * @return el archivo, con su nombre y su tipo
   */
  render(report: ExportReport, format: ExportFormat): File {
    const name = `${report.fileName}.${format}`;
    const type = EXPORT_MIME[format];
    switch (format) {
      case 'xlsx':
        return new File([reportToXlsx(report)], name, { type });
      case 'pdf':
        return new File([reportToPdf(report)], name, { type });
      case 'csv':
        return new File([reportToCsv(report)], name, { type });
    }
  }

  /**
   * Baja el archivo con el nombre que lleva.
   * El enlace temporal se suelta al rato y no enseguida: Safari empieza la descarga después
   * del clic, y soltarlo en el acto la cancela.
   */
  download(file: File): void {
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  /** Si el dispositivo sabe mandar este archivo a otra aplicación: correo, WhatsApp, Drive… */
  canShare(file: File): boolean {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  }

  /**
   * Abre el menú de compartir del sistema con el archivo.
   * Que la persona cierre el menú sin elegir nada no es un fallo, así que se calla.
   */
  share(file: File): Observable<void> {
    return defer(() =>
      navigator.share({ files: [file], title: file.name }).catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        throw error;
      }),
    );
  }
}

/**
 * Une el avance de la recogida y el informe final en un solo flujo, que es lo que espera la
 * hoja de exportar.
 *
 * @param collect cómo reunir los datos, avisando del avance
 * @param build   cómo armar el informe con ellos
 */
export function exportJob<T>(
  collect: (onProgress: (loaded: number, total: number) => void) => Observable<T>,
  build: (data: T) => ExportReport,
): Observable<ExportProgress> {
  return new Observable<ExportProgress>((subscriber) => {
    const subscription = collect((loaded, total) =>
      subscriber.next({ kind: 'progress', loaded, total }),
    )
      .pipe(map((data): ExportProgress => ({ kind: 'done', report: build(data) })))
      .subscribe(subscriber);
    return () => subscription.unsubscribe();
  });
}
