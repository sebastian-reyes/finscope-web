/**
 * Iconos y colores derivados de un nombre.
 *
 * Ni el icono ni el color existen en la API: se deducen del nombre, de forma que la misma
 * categoría o el mismo tag se ven igual en toda la aplicación sin guardar nada extra y sin
 * pedirle al usuario que elija un icono al crearlos. Como el nombre siempre se muestra
 * completo, esto decora pero nunca informa.
 */

/** Palabras reconocibles dentro de un nombre y el icono que les corresponde. */
const ICONS: ReadonlyArray<readonly [readonly string[], string]> = [
  [['comida', 'aliment', 'super', 'mercado', 'restaurante', 'almuerzo', 'desayuno'], 'bi-basket'],
  [['transporte', 'taxi', 'bus', 'gasolina', 'combustible', 'auto', 'pasaje'], 'bi-car-front'],
  [['casa', 'hogar', 'alquiler', 'renta', 'vivienda'], 'bi-house'],
  [['ocio', 'entreten', 'cine', 'juego', 'viaje', 'fiesta'], 'bi-controller'],
  [['salud', 'medic', 'farmacia', 'seguro', 'gimnasio'], 'bi-heart-pulse'],
  [['servicio', 'internet', 'telefon', 'luz', 'agua', 'cable'], 'bi-lightning-charge'],
  [['tecno', 'suscrip', 'software'], 'bi-cpu'],
  [['educa', 'curso', 'libro', 'universidad', 'colegio'], 'bi-mortarboard'],
  [['regalo', 'cumple', 'navidad'], 'bi-gift'],
  [['sueldo', 'salario', 'nomina', 'ingreso', 'pago'], 'bi-cash-coin'],
  [['freelance', 'proyecto', 'trabajo'], 'bi-laptop'],
  [['venta', 'tienda', 'negocio'], 'bi-shop'],
  [['interes', 'dividendo', 'rendimiento'], 'bi-graph-up-arrow'],
  [['compra', 'ropa', 'moda', 'zapat'], 'bi-bag'],
  [['ahorro', 'inversion', 'banco'], 'bi-piggy-bank'],
  [['mascota', 'perro', 'gato'], 'bi-heart'],
  [['otros', 'varios', 'misc'], 'bi-three-dots'],
];

/** Cuántas variantes de color tiene la paleta de fichas. */
export const PALETTE_SIZE = 8;

/**
 * Elige el icono a partir de la primera palabra reconocida en el nombre.
 *
 * @param name nombre de la categoría o del tag
 * @return la clase del icono, o una etiqueta genérica si no se reconoce nada
 */
export function iconFor(name: string): string {
  const normalised = normalise(name);
  for (const [keywords, icon] of ICONS) {
    if (keywords.some((keyword) => normalised.includes(keyword))) {
      return icon;
    }
  }
  return 'bi-tag';
}

/**
 * Reparte los nombres entre las variantes de color de forma estable.
 * Se usa un hash del nombre y no su posición en una lista, para que filtrar o reordenar el
 * catálogo no repinte las fichas que sobreviven.
 *
 * @param name nombre de la categoría o del tag
 * @return el índice de la variante de color
 */
export function paletteVariant(name: string): number {
  let hash = 0;
  for (let index = 0; index < name.length; index++) {
    hash = (hash * 31 + name.charCodeAt(index)) % 100000;
  }
  return hash % PALETTE_SIZE;
}

/**
 * Deja el nombre en minúsculas y sin tildes, que es como se comparan las palabras clave.
 *
 * @param name nombre a normalizar
 * @return el nombre comparable
 */
function normalise(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}
