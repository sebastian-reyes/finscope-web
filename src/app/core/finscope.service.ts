import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  BudgetResponse,
  CategoryResponse,
  CategoryScope,
  ConfirmRecurringTransactionRequest,
  CopyBudgetsRequest,
  CreateTransactionRequest,
  RecurringOccurrenceResponse,
  RecurringTransactionResponse,
  SaveBudgetRequest,
  SaveCategoryRequest,
  SaveRecurringTransactionRequest,
  SaveTagRequest,
  SkipRecurringTransactionRequest,
  SummaryGranularity,
  SummarySeriesResponse,
  TagResponse,
  TransactionFilters,
  TransactionPageQuery,
  TransactionPageResponse,
  TransactionResponse,
  TransactionSummaryResponse,
  TransactionTypeResponse,
  UpdateBudgetRequest,
  UpdateRecurringTransactionRequest,
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

  // Presupuestos: cuánto se piensa gastar en cada categoría durante un mes

  /**
   * Presupuestos de un mes con lo que ya se lleva gastado en cada categoría.
   * Solo salen las categorías presupuestadas: no tener presupuesto no es tenerlo en cero.
   */
  listBudgets(month: number, year: number): Observable<BudgetResponse[]> {
    return this.http.get<BudgetResponse[]>(`${this.api}/budgets`, {
      params: new HttpParams().set('month', month).set('year', year),
    });
  }

  createBudget(
    categoryId: number,
    month: number,
    year: number,
    amount: number,
  ): Observable<BudgetResponse> {
    return this.http.post<BudgetResponse>(`${this.api}/budgets`, {
      categoryId,
      month,
      year,
      amount,
    } satisfies SaveBudgetRequest);
  }

  /** Solo cambia el importe: la categoría y el mes identifican al presupuesto. */
  updateBudget(id: number, amount: number): Observable<BudgetResponse> {
    return this.http.patch<BudgetResponse>(`${this.api}/budgets/${id}`, {
      amount,
    } satisfies UpdateBudgetRequest);
  }

  /** Retira el límite. Los movimientos de esa categoría se quedan como estaban. */
  deleteBudget(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/budgets/${id}`);
  }

  /**
   * Trae al mes indicado los presupuestos de otro, sin pisar los que ya tuviera.
   * Devuelve el mes destino entero, así que la pantalla se repinta con la respuesta y no
   * necesita volver a pedir la lista.
   */
  copyBudgets(request: CopyBudgetsRequest): Observable<BudgetResponse[]> {
    return this.http.post<BudgetResponse[]>(`${this.api}/budgets/copy`, request);
  }

  // Movimientos fijos: lo que se repite y qué falta por confirmar este mes

  /**
   * Todos los fijos del usuario resueltos contra un mes.
   *
   * Llegan también los pausados y los que no vencen ese mes, con estado `NOT_DUE`, porque
   * la pantalla de gestión necesita verlos siempre. Quien solo quiera el checklist filtra
   * por estado en lugar de pedir otra lista.
   */
  listRecurring(month: number, year: number): Observable<RecurringOccurrenceResponse[]> {
    return this.http.get<RecurringOccurrenceResponse[]>(`${this.api}/recurring-transactions`, {
      params: new HttpParams().set('month', month).set('year', year),
    });
  }

  /**
   * Da de alta la plantilla. No registra ningún movimiento, ni siquiera el de este mes: el
   * alta dice que ese cargo se repite, no que ya haya ocurrido.
   */
  createRecurring(
    request: SaveRecurringTransactionRequest,
  ): Observable<RecurringTransactionResponse> {
    return this.http.post<RecurringTransactionResponse>(
      `${this.api}/recurring-transactions`,
      request satisfies SaveRecurringTransactionRequest,
    );
  }

  /**
   * Cambia la plantilla de aquí en adelante.
   * Los movimientos ya confirmados con ella no se tocan: subir el alquiler en octubre no
   * cambia lo que se pagó en septiembre.
   */
  updateRecurring(
    id: number,
    request: UpdateRecurringTransactionRequest,
  ): Observable<RecurringTransactionResponse> {
    return this.http.patch<RecurringTransactionResponse>(
      `${this.api}/recurring-transactions/${id}`,
      request satisfies UpdateRecurringTransactionRequest,
    );
  }

  /**
   * Borra la plantilla y sus omisiones. Los movimientos que se confirmaron con ella se
   * quedan, porque ocurrieron; lo único que pierden es el enlace.
   */
  deleteRecurring(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/recurring-transactions/${id}`);
  }

  /**
   * Registra el movimiento del mes y lo deja enlazado a su plantilla.
   * Sin más cuerpo que el mes usa el importe estimado y el día previsto, que es lo que
   * permite confirmar de un toque cuando se pagó lo de siempre.
   */
  confirmRecurring(
    id: number,
    request: ConfirmRecurringTransactionRequest,
  ): Observable<RecurringOccurrenceResponse> {
    return this.http.post<RecurringOccurrenceResponse>(
      `${this.api}/recurring-transactions/${id}/confirm`,
      request satisfies ConfirmRecurringTransactionRequest,
    );
  }

  /**
   * Marca que ese mes no toca. Deja de contar como comprometido contra el presupuesto de
   * su categoría, que es lo que hace útil la omisión: lo que no se va a pagar no debería
   * estar reservando dinero.
   */
  skipRecurring(
    id: number,
    month: number,
    year: number,
  ): Observable<RecurringOccurrenceResponse> {
    return this.http.post<RecurringOccurrenceResponse>(
      `${this.api}/recurring-transactions/${id}/skip`,
      { month, year } satisfies SkipRecurringTransactionRequest,
    );
  }

  /** Devuelve el fijo a pendiente en ese mes. Si no estaba omitido no cambia nada. */
  unskipRecurring(
    id: number,
    month: number,
    year: number,
  ): Observable<RecurringOccurrenceResponse> {
    return this.http.delete<RecurringOccurrenceResponse>(
      `${this.api}/recurring-transactions/${id}/skip`,
      { params: new HttpParams().set('month', month).set('year', year) },
    );
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
