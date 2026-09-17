import { iconFor, normaliseName } from './icons';

/**
 * Los iconos que se pueden elegir para una categoría o un tag.
 *
 * Es una lista corta y no la librería entera: Bootstrap Icons trae unos dos mil, y entre ellos
 * hay decenas de flechas, variantes rellenas y símbolos de interfaz que no dicen nada de un
 * gasto. Buscar ahí un carrito es peor que elegirlo entre cincuenta. Cada uno lleva palabras en
 * castellano para el buscador, porque su nombre en inglés (`egg-fried`) no es lo que alguien
 * teclea buscando «desayuno».
 *
 * Están todos los que {@link iconFor} deduce de un nombre, de modo que el icono automático
 * de cualquier ficha también puede fijarse a mano. Se guarda el nombre sin el prefijo `bi-`.
 */

/** Un icono elegible, con las palabras por las que se le encuentra. */
export interface IconChoice {
  /** Nombre en Bootstrap Icons, sin `bi-`. */
  icon: string;
  /** Palabras en castellano, sin tildes, para el buscador. */
  words: string;
}

/** Un grupo del selector. */
export interface IconGroup {
  label: string;
  icons: readonly IconChoice[];
}

export const ICON_GROUPS: readonly IconGroup[] = [
  {
    label: 'Comida',
    icons: [
      { icon: 'basket', words: 'comida mercado supermercado compras despensa' },
      { icon: 'cart3', words: 'carrito supermercado compras' },
      { icon: 'cup-hot', words: 'cafe desayuno te cafeteria' },
      { icon: 'egg-fried', words: 'desayuno huevo cocina almuerzo' },
      { icon: 'cup-straw', words: 'bebida jugo gaseosa delivery' },
      { icon: 'cake2', words: 'postre pastel cumpleanos dulce' },
      { icon: 'apple', words: 'fruta verdura saludable' },
    ],
  },
  {
    label: 'Hogar',
    icons: [
      { icon: 'house', words: 'casa hogar alquiler renta vivienda' },
      { icon: 'house-heart', words: 'familia casa hogar' },
      { icon: 'lightning-charge', words: 'luz electricidad servicios' },
      { icon: 'lightbulb', words: 'luz idea electricidad' },
      { icon: 'droplet', words: 'agua servicios' },
      { icon: 'fire', words: 'gas calefaccion cocina' },
      { icon: 'wifi', words: 'internet wifi red' },
      { icon: 'plug', words: 'enchufe electricidad aparatos' },
      { icon: 'tools', words: 'reparaciones mantenimiento herramientas' },
      { icon: 'building', words: 'edificio condominio mantenimiento oficina' },
    ],
  },
  {
    label: 'Transporte',
    icons: [
      { icon: 'car-front', words: 'auto carro coche transporte' },
      { icon: 'taxi-front', words: 'taxi uber cabify' },
      { icon: 'bus-front', words: 'bus micro transporte publico pasaje' },
      { icon: 'train-front', words: 'tren metro' },
      { icon: 'bicycle', words: 'bicicleta bici' },
      { icon: 'scooter', words: 'scooter moto patineta' },
      { icon: 'fuel-pump', words: 'gasolina combustible grifo' },
      { icon: 'airplane', words: 'avion vuelo viaje vacaciones' },
      { icon: 'suitcase-lg', words: 'maleta viaje vacaciones hotel' },
    ],
  },
  {
    label: 'Salud',
    icons: [
      { icon: 'heart-pulse', words: 'salud medico' },
      { icon: 'capsule', words: 'farmacia medicina pastillas' },
      { icon: 'hospital', words: 'hospital clinica' },
      { icon: 'bandaid', words: 'curita botiquin' },
      { icon: 'person-arms-up', words: 'gimnasio deporte ejercicio' },
      { icon: 'scissors', words: 'peluqueria corte barberia' },
      { icon: 'brush', words: 'belleza cuidado personal maquillaje' },
    ],
  },
  {
    label: 'Ocio',
    icons: [
      { icon: 'controller', words: 'juegos videojuegos ocio entretenimiento' },
      { icon: 'film', words: 'cine peliculas streaming series' },
      { icon: 'music-note-beamed', words: 'musica spotify concierto' },
      { icon: 'ticket-perforated', words: 'entradas eventos teatro' },
      { icon: 'dribbble', words: 'deporte pelota futbol' },
      { icon: 'book', words: 'libros lectura' },
      { icon: 'camera', words: 'fotos fotografia' },
      { icon: 'palette', words: 'arte pintura hobby' },
      { icon: 'balloon-heart', words: 'fiesta celebracion cita' },
    ],
  },
  {
    label: 'Compras',
    icons: [
      { icon: 'bag', words: 'compras ropa moda tienda' },
      { icon: 'handbag', words: 'cartera accesorios moda' },
      { icon: 'gift', words: 'regalo cumpleanos navidad' },
      { icon: 'shop', words: 'tienda negocio venta' },
      { icon: 'box-seam', words: 'paquete pedido envio online' },
      { icon: 'gem', words: 'joyas lujo' },
      { icon: 'phone', words: 'celular telefono movil plan' },
      { icon: 'cpu', words: 'tecnologia suscripcion software' },
    ],
  },
  {
    label: 'Dinero',
    icons: [
      { icon: 'cash-coin', words: 'sueldo salario ingreso pago efectivo' },
      { icon: 'wallet2', words: 'billetera gastos' },
      { icon: 'piggy-bank', words: 'ahorro alcancia' },
      { icon: 'bank', words: 'banco prestamo' },
      { icon: 'credit-card', words: 'tarjeta credito deuda' },
      { icon: 'graph-up-arrow', words: 'inversion intereses rendimiento dividendos' },
      { icon: 'coin', words: 'moneda cambio dolares' },
      { icon: 'receipt', words: 'factura impuestos recibo cuenta' },
    ],
  },
  {
    label: 'Trabajo y estudio',
    icons: [
      { icon: 'laptop', words: 'freelance trabajo computadora proyecto' },
      { icon: 'briefcase', words: 'trabajo oficina negocio' },
      { icon: 'mortarboard', words: 'educacion universidad colegio curso' },
      { icon: 'pencil', words: 'utiles escolares estudio' },
      { icon: 'globe-americas', words: 'idiomas internacional' },
    ],
  },
  {
    label: 'Personas y otros',
    icons: [
      { icon: 'people', words: 'amigos familia grupo' },
      { icon: 'person-heart', words: 'pareja cuidado' },
      { icon: 'heart', words: 'mascotas amor donacion' },
      { icon: 'emoji-smile', words: 'personal gustos' },
      { icon: 'tree', words: 'naturaleza jardin plantas' },
      { icon: 'flower1', words: 'flores jardin' },
      { icon: 'sun', words: 'verano playa' },
      { icon: 'umbrella', words: 'seguro lluvia imprevistos' },
      { icon: 'stars', words: 'especial deseos' },
      { icon: 'tag', words: 'etiqueta varios general' },
      { icon: 'three-dots', words: 'otros varios misc' },
    ],
  },
];

const KNOWN = new Set(ICON_GROUPS.flatMap((group) => group.icons.map((choice) => choice.icon)));

/**
 * La clase del icono de una ficha.
 *
 * Un icono guardado que no está en la lista —una versión futura que añadió alguno, un valor
 * escrito a mano contra la API— se trata como si no hubiera ninguno, porque la clase de un
 * icono inexistente pinta un hueco en blanco.
 *
 * @param name nombre de la categoría o del tag
 * @param icon icono guardado, sin prefijo
 * @return la clase CSS del icono
 */
export function chipIcon(name: string, icon: string | null | undefined): string {
  return icon && KNOWN.has(icon) ? `bi-${icon}` : iconFor(name);
}

/**
 * Filtra la lista por lo que se ha escrito en el buscador.
 * Busca en las palabras y en el propio nombre del icono, sin tildes ni mayúsculas.
 *
 * @param query texto buscado
 * @return los grupos que tienen algún icono que coincide, solo con esos iconos
 */
export function searchIcons(query: string): IconGroup[] {
  const terms = normaliseName(query).split(/\s+/).filter(Boolean);
  if (!terms.length) {
    return [...ICON_GROUPS];
  }
  return ICON_GROUPS.map((group) => ({
    label: group.label,
    icons: group.icons.filter((choice) => {
      const haystack = `${choice.words} ${choice.icon} ${normaliseName(group.label)}`;
      return terms.every((term) => haystack.includes(term));
    }),
  })).filter((group) => group.icons.length > 0);
}
