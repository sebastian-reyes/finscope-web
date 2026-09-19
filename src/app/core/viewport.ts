import { DestroyRef, Signal, inject, signal } from '@angular/core';

/**
 * Una consulta de medios leída como señal.
 *
 * Existe para lo que el CSS no puede decidir: qué componentes llegan a construirse. Esconder
 * con `display: none` lo que en un teléfono no se usa cuesta igual —el componente se crea,
 * pide sus datos y observa su caja—, y en esta aplicación eso es justo lo que pasaba con el
 * formulario de registro del inicio, que en móvil queda relevado por la hoja del botón
 * central.
 *
 * No sustituye a los puntos de quiebre de las hojas: la composición sigue siendo cosa del
 * CSS. Esto solo decide presencia.
 *
 * Hay que llamarla desde un contexto de inyección —el inicializador de un campo—, porque es
 * quien retira el escucha al destruirse el componente.
 *
 * @param query consulta de medios, en la misma sintaxis que en una hoja de estilos
 * @return si se cumple ahora mismo, y cambia cuando deje de cumplirse
 */
export function mediaQuery(query: string): Signal<boolean> {
  const list = window.matchMedia(query);
  const matches = signal(list.matches);
  const onChange = (event: MediaQueryListEvent) => matches.set(event.matches);
  list.addEventListener('change', onChange);
  inject(DestroyRef).onDestroy(() => list.removeEventListener('change', onChange));
  return matches.asReadonly();
}
