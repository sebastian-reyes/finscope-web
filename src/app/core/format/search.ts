import { normaliseName } from './icons';

/**
 * Si lo escrito en un buscador encaja con alguno de los textos de una fila.
 *
 * Cada palabra se busca por separado y tienen que aparecer todas, aunque sea en textos
 * distintos: «netflix ocio» encuentra el fijo que se llama Netflix y va en Ocio, que es como
 * se acota cuando la primera palabra sola trae demasiados. Sin tildes ni mayúsculas, para que
 * «educacion» encuentre «Educación».
 *
 * @param query  texto escrito; vacío encaja con todo
 * @param fields textos de la fila en los que buscar
 * @return si la fila se queda en la lista
 */
export function matchesSearch(query: string, fields: ReadonlyArray<string>): boolean {
  const words = normaliseName(query).split(/\s+/).filter(Boolean);
  if (!words.length) {
    return true;
  }
  const haystack = fields.map(normaliseName);
  return words.every((word) => haystack.some((field) => field.includes(word)));
}
