/**
 * Preferencias de aspecto guardadas en el navegador, separadas por usuario.
 *
 * El tema y los colores no viajan en el perfil: el contrato no tiene dónde ponerlos y son
 * decisiones de cómo se ve la aplicación, no datos de la cuenta. Pero guardarlos en una
 * clave suelta tenía un fallo que solo se nota con dos personas: cerrar sesión no borra el
 * `localStorage`, así que quien entrara después heredaba el tema y los colores del anterior.
 *
 * De ahí que la clave lleve el identificador de quien la escribió. La clave sin identificador
 * sigue existiendo y hace dos papeles a la vez: es la de quien todavía no ha entrado —la
 * pantalla de acceso tiene su propio interruptor de tema y tiene que poder recordarlo— y es
 * también donde estaba lo guardado antes de que las claves llevaran usuario, de modo que
 * nadie pierde su tema oscuro al actualizar.
 */

/** Quién es el dueño de una preferencia, o nadie si no hay sesión. */
export type PreferenceOwner = number | null;

/**
 * La clave con la que se guarda una preferencia.
 *
 * @param base nombre de la preferencia, sin usuario
 * @param owner de quién es, o nulo si no hay sesión
 * @return la clave de `localStorage`
 */
export function preferenceKey(base: string, owner: PreferenceOwner): string {
  return owner === null ? base : `${base}.${owner}`;
}

/**
 * Lee una preferencia, cayendo a la clave sin usuario si esa cuenta no tiene nada suyo.
 *
 * La caída es la que hace que actualizar no borre lo que ya había elegido la gente, y la que
 * deja que el tema elegido en la pantalla de acceso siga puesto al entrar por primera vez.
 *
 * @param base nombre de la preferencia
 * @param owner de quién es, o nulo si no hay sesión
 * @return lo guardado, o nulo si no hay nada
 */
export function readPreference(base: string, owner: PreferenceOwner): string | null {
  return localStorage.getItem(preferenceKey(base, owner)) ?? localStorage.getItem(base);
}

/**
 * Guarda una preferencia en el sitio de quien la elige.
 *
 * @param base nombre de la preferencia
 * @param owner de quién es, o nulo si no hay sesión
 * @param value lo que se guarda
 */
export function writePreference(base: string, owner: PreferenceOwner, value: string): void {
  localStorage.setItem(preferenceKey(base, owner), value);
}

/**
 * Olvida una preferencia.
 *
 * Borra también la clave sin usuario cuando hay sesión: sin eso, restablecer los colores
 * dejaría reaparecer los de antes de la actualización en cuanto se recargara la página, que
 * es justo lo contrario de restablecer.
 *
 * @param base nombre de la preferencia
 * @param owner de quién es, o nulo si no hay sesión
 */
export function clearPreference(base: string, owner: PreferenceOwner): void {
  localStorage.removeItem(preferenceKey(base, owner));
  localStorage.removeItem(base);
}
