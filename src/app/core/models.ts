/**
 * Tipos que reflejan los esquemas del contrato OpenAPI de FinScope (v6.0.0).
 * Se mantienen a mano y no generados para que el proyecto siga siendo sencillo de leer;
 * si el contrato cambia, este archivo es el único punto a tocar.
 */

export interface UserResponse {
  id: number;
  email: string;
  displayName?: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
  user: UserResponse;
}

export interface RegisterRequest {
  email: string;
  password: string;
  displayName?: string;
}

/** Cambio de los datos con los que el usuario se presenta. Lo ausente se deja como está. */
export interface UpdateUserRequest {
  /** Nombre a mostrar. En blanco deja la cuenta sin nombre. */
  displayName?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

/** Código estable del tipo de transacción. Determina el signo del importe. */
export type TransactionTypeCode = 'INCOME' | 'EXPENSE';

export interface TransactionTypeResponse {
  id: number;
  name: string;
  code: TransactionTypeCode;
}

/**
 * Ámbito de una categoría: a qué tipo de movimiento se ofrece.
 * Solo decide qué categorías propone el formulario; no restringe lo ya guardado.
 */
export type CategoryScope = 'EXPENSE' | 'INCOME' | 'BOTH';

/**
 * Categoría del catálogo del usuario.
 *
 * Cada transacción lleva exactamente una, y eso es lo que la separa del tag: al no poder
 * repetirse dentro de un movimiento, la suma por categoría reparte el total del periodo y
 * admite porcentajes. El catálogo se siembra al registrarse y desde ahí es del usuario.
 */
export interface CategoryResponse {
  id: number;
  name: string;
  appliesTo: CategoryScope;
  /** Categoría de reserva: recibe los movimientos de las que se borran y no se borra. */
  isSystem: boolean;
  /** Cuántas transacciones clasifica. Dentro de una transacción viaja a cero. */
  transactionCount: number;
}

/** Cuerpo de alta y de actualización de una categoría. */
export interface SaveCategoryRequest {
  name: string;
  appliesTo?: CategoryScope;
}

/** Tag del catálogo del usuario. Se comparte entre todas sus transacciones. */
export interface TagResponse {
  id: number;
  name: string;
  /** Cuántas transacciones lo llevan. Un tag recién creado vale cero. */
  transactionCount: number;
}

/** Cuerpo de alta y de renombrado de un tag. */
export interface SaveTagRequest {
  name: string;
}

export interface TransactionResponse {
  id: number;
  amount: number;
  description?: string;
  date: string;
  transactionType: TransactionTypeResponse;
  /** Categoría principal. Siempre viene: es obligatoria en toda transacción. */
  category: CategoryResponse;
  /** Nombres de los tags de la transacción, en orden alfabético. */
  tags: string[];
}

export interface TransactionPageResponse {
  content: TransactionResponse[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface CreateTransactionRequest {
  amount: number;
  description?: string;
  date?: string;
  transactionTypeId: number;
  /** Categoría principal, obligatoria. Debe admitir el tipo de la transacción. */
  categoryId: number;
  tags?: string[];
}

export type UpdateTransactionRequest = Partial<CreateTransactionRequest>;

/**
 * Filtros del periodo, comunes al listado y a los agregados.
 * Los nulos y los vacíos no se envían. `month` y `year` acotan a un mes natural y la API
 * los rechaza junto a `dateFrom` o `dateTo`, así que las pantallas ofrecen uno u otro.
 */
export interface TransactionFilters {
  month?: number | null;
  year?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  transactionTypeId?: number | null;
  /** Identificador de la categoría principal. */
  categoryId?: number | null;
  /** Nombre del tag, sin distinguir mayúsculas. */
  tag?: string | null;
}

/** Filtros del listado, que además pagina y ordena. */
export interface TransactionPageQuery extends TransactionFilters {
  page: number;
  size: number;
  /** Formato `campo,dirección`. Campos admitidos: date, amount e id. */
  sort: string;
}

/** Ingresos y egresos acumulados por una categoría dentro del periodo. */
export interface CategorySummaryResponse {
  categoryId: number;
  /** Nombre de la categoría. */
  category: string;
  income: number;
  expense: number;
  transactionCount: number;
}

/** Ingresos y egresos acumulados por un tag dentro del periodo. */
export interface TagSummaryResponse {
  /** Nulo para el grupo de transacciones que no llevan ningún tag. */
  tag?: string | null;
  income: number;
  expense: number;
  transactionCount: number;
}

/** Totales del periodo y sus desgloses por categoría y por tag. */
export interface TransactionSummaryResponse {
  income: number;
  expense: number;
  /** Diferencia entre income y expense; negativa si se gastó de más. */
  net: number;
  transactionCount: number;
  /**
   * Desglose por categoría, de mayor a menor egreso. Como cada transacción tiene
   * exactamente una, sus importes suman el total del periodo: es el único que puede
   * dibujarse como un reparto porcentual.
   */
  byCategory: CategorySummaryResponse[];
  /**
   * Desglose por tag, de mayor a menor egreso. Sus importes no suman el total: una
   * transacción con varios tags aporta su importe íntegro a cada uno. Es un análisis de
   * contexto, nunca una distribución del gasto.
   */
  byTag: TagSummaryResponse[];
}

/** Tamaño de cada tramo de una serie temporal. */
export type SummaryGranularity = 'DAY' | 'WEEK' | 'MONTH';

/** Totales de un tramo de la serie. */
export interface SummaryBucketResponse {
  /** Instante inicial del tramo, inclusivo. */
  periodStart: string;
  income: number;
  expense: number;
  net: number;
  transactionCount: number;
}

/**
 * Evolución de ingresos y egresos a lo largo del periodo.
 * Solo trae los tramos con alguna transacción: los huecos los rellena el cliente.
 */
export interface SummarySeriesResponse {
  granularity: SummaryGranularity;
  buckets: SummaryBucketResponse[];
}

/**
 * Presupuesto de una categoría para un mes, junto a lo que se lleva gastado en ella.
 *
 * El plan y la realidad viajan juntos porque por separado no dicen nada: un límite de 400
 * solo significa algo al lado de los 340 que ya se fueron. Es lo único del modelo que mira
 * hacia delante; todo lo demás cuenta lo que ya pasó.
 */
export interface BudgetResponse {
  id: number;
  categoryId: number;
  /** Nombre de la categoría presupuestada. */
  category: string;
  month: number;
  year: number;
  /** Importe presupuestado para el mes. */
  amount: number;
  /**
   * Egresos de esa categoría dentro del mes. Es la misma cifra que el `expense` del
   * desglose por categoría del resumen, así que la barra y el gráfico de reparto siempre
   * cuentan lo mismo.
   */
  spent: number;
  /**
   * Lo que los movimientos fijos de esa categoría van a llevarse este mes y todavía no se
   * han llevado. Es dinero que aún no figura en `spent` pero que ya tiene dueño: sin él,
   * 400 con 120 gastados aparentan 280 libres cuando el internet de 180 sigue sin pagarse.
   */
  committed: number;
  /** Lo que queda: `amount` menos `spent`. Negativo cuando el gasto se pasó del límite. */
  remaining: number;
  /**
   * Lo que de verdad queda libre: `remaining` menos `committed`. Es el número con el que
   * se decide si se puede gastar algo más este mes, y también puede ser negativo.
   */
  available: number;
}

/** Cuerpo de alta de un presupuesto. La categoría debe admitir egresos. */
export interface SaveBudgetRequest {
  categoryId: number;
  month: number;
  year: number;
  amount: number;
}

/**
 * Cuerpo de cambio del importe.
 * Ni la categoría ni el mes se tocan: son lo que identifica al presupuesto.
 */
export interface UpdateBudgetRequest {
  amount: number;
}

/** Petición de copia de los presupuestos de un mes a otro. */
export interface CopyBudgetsRequest {
  sourceMonth: number;
  sourceYear: number;
  month: number;
  year: number;
}

/**
 * Estado de un movimiento fijo dentro de un mes.
 *
 * No lo guarda nadie: lo resuelve la API al leer, mirando si hay un movimiento enlazado en
 * ese mes, si el mes está omitido y qué día es hoy. `NOT_DUE` cubre dos casos que para
 * quien mira la lista son el mismo —la plantilla está pausada, o toca cada varios meses y
 * ese no es uno de ellos—; `active` distingue cuál.
 */
export type RecurringStatus = 'PENDING' | 'OVERDUE' | 'PAID' | 'SKIPPED' | 'NOT_DUE';

/**
 * Plantilla de un movimiento que se repite: el alquiler, el internet, el sueldo.
 *
 * Dice que ese cargo vuelve cada cierto tiempo, no que haya ocurrido. No genera nada sola:
 * cada mes produce un pendiente que se confirma, y esa confirmación es la que crea la
 * transacción.
 *
 * Es lo que devuelven el alta y la modificación, sin estado de ningún mes: el estado
 * depende del mes que se mire.
 */
export interface RecurringTransactionResponse {
  id: number;
  categoryId: number;
  transactionTypeId: number;
  /** Cómo lo llama el usuario. Se copia al movimiento al confirmar. */
  description: string;
  /** Lo que se suele pagar, no lo definitivo: al confirmar se puede corregir. */
  amount: number;
  /** Día previsto, entre 1 y 31. Se recorta al último día en los meses cortos. */
  dayOfMonth: number;
  /** Cada cuántos meses toca: 1 mensual, 2 bimestral, 3 trimestral, 12 anual. */
  everyMonths: number;
  startMonth: number;
  startYear: number;
  /** Un fijo pausado no vence ni compromete presupuesto, pero conserva su historial. */
  active: boolean;
}

/**
 * La misma plantilla resuelta contra un mes: si vence en él, en qué estado está y, cuando
 * ya se confirmó, con qué movimiento y por cuánto.
 *
 * Plantilla y estado viajan juntos porque por separado no sirven de nada: una lista de
 * fijos sin saber cuáles faltan no es un checklist, es un catálogo.
 */
export interface RecurringOccurrenceResponse extends RecurringTransactionResponse {
  /** Nombre de la categoría, con la grafía que escribió el usuario. */
  category: string;
  /** Código del tipo, que decide el signo del importe. */
  type: TransactionTypeCode;
  month: number;
  year: number;
  /** Día concreto de vencimiento, ya recortado. Ausente cuando no vence ese mes. */
  dueDate?: string;
  status: RecurringStatus;
  /** Movimiento con el que se confirmó el mes. Solo viene si está `PAID`. */
  transactionId?: number;
  /** Importe de ese movimiento, que puede no ser el estimado. */
  paidAmount?: number;
  paidDate?: string;
}

/** Cuerpo de alta de un movimiento fijo. La categoría debe admitir el tipo indicado. */
export interface SaveRecurringTransactionRequest {
  categoryId: number;
  transactionTypeId: number;
  description: string;
  amount: number;
  dayOfMonth: number;
  everyMonths?: number;
  startMonth: number;
  startYear: number;
}

/**
 * Cuerpo de modificación. Solo se aplican los campos presentes, y el cambio rige de aquí en
 * adelante: los meses ya confirmados no se recalculan.
 */
export type UpdateRecurringTransactionRequest = Partial<
  Omit<SaveRecurringTransactionRequest, 'everyMonths'>
> & {
  everyMonths?: number;
  active?: boolean;
};

/**
 * Confirmación del movimiento de un mes.
 * El mes es lo que se confirma; el resto solo hace falta cuando lo real no coincide con lo
 * previsto.
 */
export interface ConfirmRecurringTransactionRequest {
  month: number;
  year: number;
  amount?: number;
  date?: string;
  description?: string;
}

/** Mes que se omite. */
export interface SkipRecurringTransactionRequest {
  month: number;
  year: number;
}

/** Cuerpo de error estructurado que devuelve la API en cualquier fallo. */
export interface ErrorResponse {
  timestamp: string;
  status: number;
  code: string;
  message: string;
}
