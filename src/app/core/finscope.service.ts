import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  CategoryResponse,
  CategoryScope,
  CreateTransactionRequest,
  SaveCategoryRequest,
  SaveTagRequest,
  SummaryGranularity,
  SummarySeriesResponse,
  TagResponse,
  TransactionFilters,
  TransactionPageQuery,
  TransactionPageResponse,
  TransactionResponse,
  TransactionSummaryResponse,
  TransactionTypeResponse,
  UpdateTransactionRequest,
} from './models';
import { environment } from '../../environments/environment';

/**
 * Acceso a los recursos de negocio de la API.
 *
 * Las rutas de cada endpoint son las mismas de siempre; lo único que cambia por entorno es
 * el origen que llevan delante. En desarrollo `apiUrl` va vacío, así que quedan relativas y
 * el proxy del servidor de desarrollo las reenvía al backend sin CORS de por medio; en
 * producción es la URL del servicio desplegado, porque el estático y la API ya no comparten
 * dominio.
 */
@Injectable({ providedIn: 'root' })
export class FinscopeService {
  private readonly http = inject(HttpClient);

  /** Origen de la API, vacío en desarrollo. Ver `src/environments`. */
  private readonly api = environment.apiUrl;

  // Categorías: clasificación principal, una sola por transacción

  /**
   * Catálogo completo, en orden alfabético y con el número de transacciones de cada una.
   * Es lo que alimenta el selector del formulario y el gráfico de reparto del gasto.
   */
  listCategories(): Observable<CategoryResponse[]> {
    return this.http.get<CategoryResponse[]>(`${this.api}/categories`);
  }

  createCategory(name: string, appliesTo: CategoryScope): Observable<CategoryResponse> {
    return this.http.post<CategoryResponse>(`${this.api}/categories`, {
      name,
      appliesTo,
    } satisfies SaveCategoryRequest);
  }

  /** El cambio alcanza a todas las transacciones que clasifica, porque la categoría es una. */
  updateCategory(id: number, name: string, appliesTo: CategoryScope): Observable<CategoryResponse> {
    return this.http.patch<CategoryResponse>(`${this.api}/categories/${id}`, {
      name,
      appliesTo,
    } satisfies SaveCategoryRequest);
  }

  /**
   * Elimina la categoría y manda sus movimientos a la de reserva.
   * No se pierde ningún movimiento: como la categoría es obligatoria, la API los reasigna
   * antes de borrarla.
   */
  deleteCategory(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/categories/${id}`);
  }

  // Tags: catálogo del usuario, compartido entre sus transacciones

  /**
   * Catálogo completo, en orden alfabético y con el número de transacciones de cada tag.
   * Incluye los que no usa ninguna transacción: siguen ocupando su nombre.
   */
  listTags(): Observable<TagResponse[]> {
    return this.http.get<TagResponse[]>(`${this.api}/tags`);
  }

  /** Alta explícita, para preparar el catálogo sin registrar una transacción. */
  createTag(name: string): Observable<TagResponse> {
    return this.http.post<TagResponse>(`${this.api}/tags`, { name } satisfies SaveTagRequest);
  }

  /** Renombra el tag en todas las transacciones que lo llevan, porque el tag es uno solo. */
  renameTag(id: number, name: string): Observable<TagResponse> {
    return this.http.patch<TagResponse>(`${this.api}/tags/${id}`, {
      name,
    } satisfies SaveTagRequest);
  }

  /** Lo retira de todas sus transacciones, que por lo demás quedan intactas. */
  deleteTag(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/tags/${id}`);
  }

  // Tipos de transacción (catálogo global, solo lectura)

  listTransactionTypes(): Observable<TransactionTypeResponse[]> {
    return this.http.get<TransactionTypeResponse[]>(`${this.api}/transaction-types`);
  }

  // Transacciones

  listTransactions(query: TransactionPageQuery): Observable<TransactionPageResponse> {
    const params = filterParams(query)
      .set('page', query.page)
      .set('size', query.size)
      .set('sort', query.sort);
    return this.http.get<TransactionPageResponse>(`${this.api}/transactions`, { params });
  }

  createTransaction(request: CreateTransactionRequest): Observable<TransactionResponse> {
    return this.http.post<TransactionResponse>(`${this.api}/transactions`, request);
  }

  updateTransaction(
    id: number,
    request: UpdateTransactionRequest,
  ): Observable<TransactionResponse> {
    return this.http.patch<TransactionResponse>(`${this.api}/transactions/${id}`, request);
  }

  deleteTransaction(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/transactions/${id}`);
  }

  // Agregados

  /** Totales del periodo y desglose por tag, con los mismos filtros que el listado. */
  getSummary(filters: TransactionFilters): Observable<TransactionSummaryResponse> {
    return this.http.get<TransactionSummaryResponse>(`${this.api}/transactions/summary`, {
      params: filterParams(filters),
    });
  }

  /** Evolución del periodo en tramos del tamaño indicado. */
  getSummarySeries(
    filters: TransactionFilters,
    granularity: SummaryGranularity,
  ): Observable<SummarySeriesResponse> {
    return this.http.get<SummarySeriesResponse>(`${this.api}/transactions/summary/series`, {
      params: filterParams(filters).set('granularity', granularity),
    });
  }
}

/**
 * Traduce los filtros del periodo a parámetros de consulta.
 * Los nulos y los textos en blanco se omiten: la API trata un filtro ausente como «sin
 * acotar», mientras que mandarlo vacío sería un valor inválido.
 */
export function filterParams(filters: TransactionFilters): HttpParams {
  const values: Array<[string, number | string | null | undefined]> = [
    ['month', filters.month],
    ['year', filters.year],
    ['dateFrom', filters.dateFrom],
    ['dateTo', filters.dateTo],
    ['transactionTypeId', filters.transactionTypeId],
    ['categoryId', filters.categoryId],
    ['tag', filters.tag?.trim() || null],
  ];
  let params = new HttpParams();
  for (const [key, value] of values) {
    if (value != null && value !== '') {
      params = params.set(key, value);
    }
  }
  return params;
}
