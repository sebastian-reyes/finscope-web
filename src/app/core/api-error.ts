import { HttpErrorResponse } from '@angular/common/http';
import { ErrorResponse } from './models';
import { environment } from '../../environments/environment';

/**
 * Un fallo contado para quien usa la aplicación: qué ha pasado, en pocas palabras, y qué
 * puede hacer al respecto. El detalle se sostiene solo —sin el título— porque los avisos
 * dentro de una pantalla ya llevan su propio título de contexto y solo usan el detalle.
 */
export interface Problem {
  title: string;
  detail: string;
}

/**
 * Lo que se dice para cada código estable de la API.
 * El mensaje que trae la respuesta no se muestra nunca: está en inglés, nombra ids y está
 * pensado para quien integra la API, no para quien apunta sus gastos. El código, en cambio,
 * no cambia, así que es lo que se traduce.
 */
const BY_CODE: Record<string, Problem> = {
  INVALID_CREDENTIALS: {
    title: 'No pudimos iniciar sesión',
    detail: 'El correo o la contraseña no coinciden. Revísalos e inténtalo otra vez.',
  },
  EMAIL_ALREADY_REGISTERED: {
    title: 'Ese correo ya está en uso',
    detail: 'Ya hay una cuenta con ese correo. Si es la tuya, inicia sesión; si no, usa otro.',
  },
  UNAUTHENTICATED: {
    title: 'Tu sesión terminó',
    detail: 'Vuelve a iniciar sesión para seguir donde lo dejaste.',
  },
  INVALID_REFRESH_TOKEN: {
    title: 'Tu sesión terminó',
    detail: 'Vuelve a iniciar sesión para seguir donde lo dejaste.',
  },
  ACCESS_DENIED: {
    title: 'No tienes acceso',
    detail: 'Esto no está disponible para tu cuenta.',
  },
  INVALID_ACCOUNT_TOKEN: {
    title: 'El enlace ya no sirve',
    detail: 'Caducó o ya se usó. Pide uno nuevo y ábrelo desde el último correo.',
  },
  TOO_MANY_ATTEMPTS: {
    title: 'Demasiados intentos',
    detail: 'Por seguridad, espera unos minutos antes de volver a intentarlo.',
  },
  RATE_LIMIT_EXCEEDED: {
    title: 'Vamos más despacio',
    detail: 'Hubo demasiadas peticiones seguidas. Espera un momento y vuelve a intentarlo.',
  },
  TAG_NAME_ALREADY_USED: {
    title: 'Ese nombre ya existe',
    detail: 'Ya tienes un tag que se llama así. Elige otro nombre.',
  },
  CATEGORY_NAME_ALREADY_USED: {
    title: 'Ese nombre ya existe',
    detail: 'Ya tienes una categoría que se llama así. Elige otro nombre.',
  },
  CATEGORY_NOT_APPLICABLE: {
    title: 'Esa categoría no encaja',
    detail: 'Es para otro tipo de movimiento, así que no se puede usar aquí. Elige otra.',
  },
  SYSTEM_CATEGORY_PROTECTED: {
    title: 'Esta categoría no se puede borrar',
    detail: 'Recibe los movimientos de las categorías que eliminas, así que tiene que quedarse.',
  },
  EXCHANGE_RATE_REQUIRED: {
    title: 'Falta el tipo de cambio',
    detail:
      'Para trabajar con otra moneda hace falta el tipo de cambio. Escríbelo y vuelve a intentarlo.',
  },
  EXCHANGE_RATE_NOT_APPLICABLE: {
    title: 'Sobra el tipo de cambio',
    detail: 'Es tu moneda principal, así que no lleva tipo de cambio. Déjalo vacío.',
  },
  BUDGET_ALREADY_SET: {
    title: 'Ya hay un presupuesto',
    detail:
      'Esa categoría ya tiene presupuesto ese mes. Edita el que existe en lugar de crear otro.',
  },
  RECURRING_ALREADY_CONFIRMED: {
    title: 'Ya está confirmado',
    detail: 'Este fijo ya se confirmó ese mes. Si quieres deshacerlo, borra su movimiento.',
  },
  RECURRING_SKIPPED: {
    title: 'Está omitido ese mes',
    detail: 'Deshaz la omisión antes de confirmarlo.',
  },
  RECURRING_NOT_DUE: {
    title: 'No vence ese mes',
    detail: 'Este fijo no toca ese mes, así que no hay nada que confirmar ni omitir.',
  },
  RECURRING_DATE_OUT_OF_PERIOD: {
    title: 'La fecha no cae en ese mes',
    detail: 'La fecha del movimiento tiene que estar dentro del mes que estás confirmando.',
  },
  INVALID_LOAN_PLAN: {
    title: 'Las cuotas no cuadran',
    detail:
      'Las cuotas tienen que sumar lo que se va a devolver y no pueden vencer antes del préstamo.',
  },
  LOAN_OVERPAYMENT: {
    title: 'El pago supera la deuda',
    detail: 'Ese monto es mayor que lo que queda por devolver. Ajusta el pago.',
  },
  PUSH_NOT_CONFIGURED: {
    title: 'Avisos no disponibles',
    detail: 'Por ahora FinScope no puede mandar avisos. Inténtalo más adelante.',
  },
  PUSH_ENDPOINT_NOT_ALLOWED: {
    title: 'No se pudieron activar los avisos',
    detail: 'Este navegador usa un servicio de avisos que FinScope no admite. Prueba con otro.',
  },
  CONTENT_TOO_LARGE: {
    title: 'Es demasiado grande',
    detail: 'Lo que intentas enviar supera el tamaño permitido. Prueba con algo más pequeño.',
  },
};

/** Lo que ya no existe, por recurso: el título nombra qué se ha perdido. */
const NOT_FOUND: Record<string, string> = {
  TRANSACTION_NOT_FOUND: 'Este movimiento ya no existe',
  TRANSACTION_TYPE_NOT_FOUND: 'Ese tipo de movimiento no existe',
  TAG_NOT_FOUND: 'Este tag ya no existe',
  CATEGORY_NOT_FOUND: 'Esta categoría ya no existe',
  BUDGET_NOT_FOUND: 'Este presupuesto ya no existe',
  RECURRING_NOT_FOUND: 'Este fijo ya no existe',
  LOAN_NOT_FOUND: 'Este préstamo ya no existe',
  LOAN_PAYMENT_NOT_FOUND: 'Este pago ya no existe',
};

const GONE_DETAIL = 'Puede que se haya borrado desde otro dispositivo. Recarga para ver lo último.';

const UNEXPECTED: Problem = {
  title: 'Algo salió mal',
  detail: 'No pudimos completar la acción. Inténtalo de nuevo y, si se repite, recarga la página.',
};

/**
 * Traduce cualquier fallo a un título y una explicación que se puedan enseñar tal cual.
 * Primero manda el código de la API, que es estable; si no lo hay —o es uno que esta
 * versión aún no conoce— decide el estado HTTP. Nunca se enseña el texto en crudo.
 */
export function describeProblem(error: unknown): Problem {
  if (!(error instanceof HttpErrorResponse)) {
    return UNEXPECTED;
  }
  // Un 0 es que la petición no llegó a contestarse: ni siquiera hay estado. Si el navegador
  // sabe que no hay red, eso es lo que hay que decir; si no, qué sugerir depende de dónde
  // corra la aplicación, así que la pista la pone el entorno.
  if (error.status === 0) {
    return navigator.onLine
      ? { title: 'FinScope no responde', detail: `No hubo respuesta. ${environment.offlineHint}` }
      : {
          title: 'Sin conexión',
          detail: 'No tienes conexión a internet. Revisa tu red y vuelve a intentarlo.',
        };
  }
  const code = errorCode(error);
  if (code && BY_CODE[code]) {
    return BY_CODE[code];
  }
  if (code && NOT_FOUND[code]) {
    return { title: NOT_FOUND[code], detail: `${NOT_FOUND[code]}. ${GONE_DETAIL}` };
  }
  return byStatus(error.status);
}

/**
 * Traduce un fallo a la frase que se muestra en pantalla.
 * Es el detalle de {@link describeProblem}: sirve sola, debajo del título que ya pone cada
 * pantalla o dentro de un aviso.
 */
export function describeError(error: unknown): string {
  return describeProblem(error).detail;
}

function byStatus(status: number): Problem {
  if (status === 400 || status === 422) {
    return {
      title: 'Hay datos que revisar',
      detail: 'Algún dato no tiene el formato esperado. Revísalos y vuelve a intentarlo.',
    };
  }
  if (status === 401) {
    return BY_CODE['UNAUTHENTICATED'];
  }
  if (status === 403) {
    return BY_CODE['ACCESS_DENIED'];
  }
  if (status === 404) {
    return { title: 'Ya no existe', detail: `Lo que buscas ya no existe. ${GONE_DETAIL}` };
  }
  if (status === 409) {
    return {
      title: 'Choca con lo que ya tienes',
      detail:
        'Eso entra en conflicto con algo que ya está guardado. Recarga y revisa antes de repetir.',
    };
  }
  if (status === 429) {
    return BY_CODE['RATE_LIMIT_EXCEEDED'];
  }
  // Un 502, 503 o 504 suele llegar del proxy mientras el servicio arranca, sin cuerpo propio.
  if (status === 502 || status === 503 || status === 504) {
    return {
      title: 'FinScope no está disponible',
      detail: `El servicio no responde ahora mismo. ${environment.offlineHint}`,
    };
  }
  if (status >= 500) {
    return {
      title: 'Algo falló de nuestro lado',
      detail: 'No es nada que hayas hecho tú. Inténtalo de nuevo en un momento.',
    };
  }
  return UNEXPECTED;
}

/**
 * Devuelve el código estable del error, si la API llegó a contestar uno.
 * Sirve para distinguir un caso concreto del resto sin leer el mensaje, que está pensado
 * para mostrarse y no para compararse.
 *
 * @param error fallo recibido
 * @return el código, o nulo si no hay cuerpo de error
 */
export function errorCode(error: unknown): string | null {
  if (!(error instanceof HttpErrorResponse)) {
    return null;
  }
  return (error.error as ErrorResponse | null)?.code ?? null;
}
