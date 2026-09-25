/**
 * Las imágenes de perfil que se pueden elegir.
 *
 * No son fotos: son ilustraciones dibujadas aquí, todas con la misma mano —cabeza de frente
 * con los hombros asomando, colores naturales del animal, ojos grandes con dos brillos,
 * mejillas sonrosadas y boquita pequeña— para que ninguna parezca de otro juego. Van sobre un fondo teñido con los dos colores que haya elegido el usuario, así que
 * el animal es suyo y el marco sigue a la paleta.
 *
 * La API guarda solo el identificador y no conoce este catálogo: añadir un animal es añadirlo
 * aquí. Uno que el cliente no conozca —guardado desde una versión más nueva— se pinta con las
 * iniciales, que es lo mismo que no haber elegido.
 *
 * Las formas se dibujan en una caja de 64 × 64 y el círculo que las enmarca las recorta, por
 * eso algunas —el cuello de la llama, el caparazón de la tortuga— salen por abajo a propósito.
 */

/** Una imagen de perfil del catálogo. */
export interface AvatarChoice {
  /** Lo que se guarda en la cuenta. */
  id: string;
  /** Cómo se llama en pantalla y para el lector de pantalla. */
  label: string;
  /** El dibujo, sin la etiqueta `svg` que lo envuelve. */
  art: string;
}

/** La tinta de los ojos y los contornos, la misma en todos para que se lean como familia. */
const INK = '#2b2d33';

/**
 * Ojos grandes con dos brillos: uno grande arriba y uno pequeño abajo. Es lo que más hace
 * que un dibujo tan simple parezca tierno, y sin brillo a 28 px se leen como agujeros.
 */
function eyes(y: number, left = 25, right = 39, r = 3.1): string {
  const eye = (x: number) =>
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${INK}"/>` +
    `<circle cx="${x + r * 0.35}" cy="${y - r * 0.38}" r="${r * 0.42}" fill="#fff"/>` +
    `<circle cx="${x - r * 0.38}" cy="${y + r * 0.4}" r="${r * 0.17}" fill="#fff" opacity=".85"/>`;
  return eye(left) + eye(right);
}

/** Mejillas sonrosadas, bajo los ojos y un poco hacia fuera. */
function blush(y: number, left = 20.5, right = 43.5): string {
  return (
    `<ellipse cx="${left}" cy="${y}" rx="3.3" ry="2" fill="#ff8fab" opacity=".5"/>` +
    `<ellipse cx="${right}" cy="${y}" rx="3.3" ry="2" fill="#ff8fab" opacity=".5"/>`
  );
}

/** Boquita en «w», la del gato y sus parientes. */
function mouth(y: number): string {
  return (
    `<path d="M29 ${y} Q30.5 ${y + 1.9} 32 ${y} Q33.5 ${y + 1.9} 35 ${y}" stroke="${INK}" ` +
    'stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
  );
}

/** Brillo suave arriba a la izquierda de la cabeza: le da volumen sin sombras. */
function shine(cx: number, cy: number, rx = 6, ry = 3): string {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#fff" opacity=".22" transform="rotate(-20 ${cx} ${cy})"/>`;
}

/** Hombros que asoman por abajo, para que el animal se siente en el círculo y no flote. */
function shoulders(fill: string, chest?: string): string {
  return (
    `<path d="M15.5 64 Q16.5 50 32 50 Q47.5 50 48.5 64 Z" fill="${fill}"/>` +
    (chest ? `<ellipse cx="32" cy="61" rx="7.5" ry="6.5" fill="${chest}"/>` : '')
  );
}

const FOX =
  shoulders('#ef8a3a', '#fff6ec') +
  '<path d="M13.5 30 Q13 14 18 10 Q24 14 29 21 Z" fill="#ef8a3a"/>' +
  '<path d="M50.5 30 Q51 14 46 10 Q40 14 35 21 Z" fill="#ef8a3a"/>' +
  '<path d="M17 25 Q17 16 19 13.5 Q22.5 16.5 25.5 21 Z" fill="#fff6ec"/>' +
  '<path d="M47 25 Q47 16 45 13.5 Q41.5 16.5 38.5 21 Z" fill="#fff6ec"/>' +
  '<path d="M11.5 32 Q11.5 19 32 19 Q52.5 19 52.5 32 Q52.5 45 32 51 Q11.5 45 11.5 32 Z" fill="#ef8a3a"/>' +
  '<path d="M12.5 34 Q22 32 27 39 Q29 46 32 51 Q17 47 12.5 34 Z" fill="#fff6ec"/>' +
  '<path d="M51.5 34 Q42 32 37 39 Q35 46 32 51 Q47 47 51.5 34 Z" fill="#fff6ec"/>' +
  shine(23, 24.5) +
  eyes(33.5, 24.5, 39.5) +
  blush(39.5, 19.5, 44.5) +
  `<ellipse cx="32" cy="42.8" rx="2.5" ry="1.8" fill="${INK}"/>` +
  mouth(44.6);

const CAT =
  shoulders('#9aa3ae', '#eef0f2') +
  '<path d="M13 31 Q12 15 16.5 11 Q23 14.5 28 20 Z" fill="#9aa3ae"/>' +
  '<path d="M51 31 Q52 15 47.5 11 Q41 14.5 36 20 Z" fill="#9aa3ae"/>' +
  '<path d="M16.5 26 Q16 17.5 18 14.5 Q22 17 25 20.5 Z" fill="#f7b3c2"/>' +
  '<path d="M47.5 26 Q48 17.5 46 14.5 Q42 17 39 20.5 Z" fill="#f7b3c2"/>' +
  '<ellipse cx="32" cy="34" rx="20" ry="17" fill="#9aa3ae"/>' +
  '<path d="M28 18.5 Q28.8 22 29.5 24.5 M32 17.8 V24.5 M36 18.5 Q35.2 22 34.5 24.5" ' +
  'stroke="#7b848f" stroke-width="2.2" stroke-linecap="round" fill="none"/>' +
  '<path d="M12.8 32.5 H16.5 M12.6 36.5 H16 M51.2 32.5 H47.5 M51.4 36.5 H48" ' +
  'stroke="#7b848f" stroke-width="2" stroke-linecap="round"/>' +
  '<ellipse cx="32" cy="42" rx="7.5" ry="5" fill="#eef0f2"/>' +
  shine(22.5, 25.5) +
  eyes(35, 24, 40, 3.3) +
  blush(41, 19.5, 44.5) +
  '<path d="M30.3 39.8 H33.7 Q33.5 41.4 32 42 Q30.5 41.4 30.3 39.8 Z" fill="#f08da6"/>' +
  mouth(42.8) +
  '<path d="M21 42 L13 40.5 M21 44.5 L13.5 45.5 M43 42 L51 40.5 M43 44.5 L50.5 45.5" ' +
  'stroke="#6b7480" stroke-width="1" stroke-linecap="round" opacity=".7"/>';

const DOG =
  shoulders('#d9a066', '#f5e1c8') +
  '<ellipse cx="32" cy="33.5" rx="17.5" ry="17" fill="#d9a066"/>' +
  '<path d="M32 17 Q28.6 23.5 29.2 32 H34.8 Q35.4 23.5 32 17 Z" fill="#f5e1c8"/>' +
  '<ellipse cx="32" cy="42" rx="10" ry="7.5" fill="#f5e1c8"/>' +
  '<path d="M17 18 Q7 19 8.5 34 Q10 42 16.5 38.5 Q18.5 29 21.5 21 Z" fill="#8b5a2b"/>' +
  '<path d="M47 18 Q57 19 55.5 34 Q54 42 47.5 38.5 Q45.5 29 42.5 21 Z" fill="#8b5a2b"/>' +
  shine(24.5, 23.5, 5, 2.6) +
  eyes(33, 25, 39) +
  blush(40, 21, 43) +
  `<path d="M28.8 38.8 Q32 37.4 35.2 38.8 Q34.5 41.6 32 42.1 Q29.5 41.6 28.8 38.8 Z" fill="${INK}"/>` +
  '<ellipse cx="31" cy="39.1" rx="1.2" ry=".6" fill="#fff" opacity=".6"/>' +
  '<path d="M30.8 45 Q32 49.5 33.2 45 Z" fill="#f28b9b"/>' +
  `<path d="M32 42.1 V43.8 M29 44 Q30.5 45.9 32 44 Q33.5 45.9 35 44" stroke="${INK}" ` +
  'stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';

/** La alcancía: un cerdito con una moneda asomando por su ranura, el guiño a las finanzas. */
const PIGGY =
  shoulders('#f5a9ba') +
  '<path d="M14.5 27 Q12 15 16 12 Q22.5 14 27.5 20 Z" fill="#ec8aa3"/>' +
  '<path d="M49.5 27 Q52 15 48 12 Q41.5 14 36.5 20 Z" fill="#ec8aa3"/>' +
  '<path d="M17 24 Q16 17 17.8 15 Q21.5 16.5 24.5 20 Z" fill="#f7c1cd"/>' +
  '<path d="M47 24 Q48 17 46.2 15 Q42.5 16.5 39.5 20 Z" fill="#f7c1cd"/>' +
  '<ellipse cx="32" cy="34" rx="19.5" ry="17" fill="#f5a9ba"/>' +
  '<path d="M28.6 20.6 A3.4 3.4 0 0 1 35.4 20.6 Z" fill="#f5c542"/>' +
  '<path d="M30.4 19 Q32 18.2 33.6 19" stroke="#d9a21f" stroke-width=".9" fill="none" stroke-linecap="round"/>' +
  '<rect x="27" y="20.2" width="10" height="2.6" rx="1.3" fill="#c45f79"/>' +
  shine(22, 26) +
  eyes(33, 24, 40, 3) +
  blush(39.5, 18.5, 45.5) +
  '<ellipse cx="32" cy="42" rx="7.5" ry="5.3" fill="#ec8aa3"/>' +
  '<ellipse cx="29.4" cy="42" rx="1.4" ry="2.1" fill="#a8465f"/>' +
  '<ellipse cx="34.6" cy="42" rx="1.4" ry="2.1" fill="#a8465f"/>';

/** La llama, el guiño a Perú: con pestañas, copete y una manta andina al cuello. */
const LLAMA =
  '<path d="M17 64 Q17 47 32 47 Q47 47 47 64 Z" fill="#f6ebd9"/>' +
  '<path d="M17.3 54.5 Q32 50.5 46.7 54.5 V64 H17.3 Z" fill="#e25d4f"/>' +
  '<path d="M17.5 58.5 l3 -2.4 l3 2.4 l3 -2.4 l3 2.4 l3 -2.4 l3 2.4 l3 -2.4 l3 2.4 l3 -2.4 l2 1.6" ' +
  'stroke="#f2c14e" stroke-width="1.8" fill="none" stroke-linejoin="round"/>' +
  '<path d="M17.5 62.2 H46.5" stroke="#2ba3a0" stroke-width="2.4"/>' +
  '<path d="M22 24 Q17.5 9 21.5 6 Q26.5 8 26.8 22 Z" fill="#f6ebd9"/>' +
  '<path d="M42 24 Q46.5 9 42.5 6 Q37.5 8 37.2 22 Z" fill="#f6ebd9"/>' +
  '<path d="M22.6 20 Q20.5 11 22 9 Q24.6 11 25 20 Z" fill="#f2c8b8"/>' +
  '<path d="M41.4 20 Q43.5 11 42 9 Q39.4 11 39 20 Z" fill="#f2c8b8"/>' +
  '<rect x="19.5" y="17" width="25" height="33" rx="12.5" fill="#f6ebd9"/>' +
  '<path d="M22 22 Q22 15.5 26.5 16.5 Q28 11.5 32 13.5 Q36 11.5 37.5 16.5 Q42 15.5 42 22 ' +
  'Q32 19 22 22 Z" fill="#fffaf2"/>' +
  eyes(31.5, 26, 38, 2.8) +
  `<path d="M23.4 29.6 l-1.6 -1.1 M24.2 28.4 l-1.1 -1.5 M40.6 29.6 l1.6 -1.1 M39.8 28.4 l1.1 -1.5" ` +
  `stroke="${INK}" stroke-width="1" stroke-linecap="round"/>` +
  blush(37, 22.5, 41.5) +
  '<ellipse cx="32" cy="41.5" rx="8.5" ry="6.5" fill="#ecdcc0"/>' +
  `<path d="M30 39.3 Q32 40.8 34 39.3 M32 40.8 V42.2" stroke="${INK}" stroke-width="1.3" ` +
  'fill="none" stroke-linecap="round"/>' +
  mouth(42.6);

/** El búho, por la cabeza fría con el dinero. */
const OWL =
  '<path d="M14 64 Q13 44 32 44 Q51 44 50 64 Z" fill="#9c6b45"/>' +
  '<path d="M13 28 Q12.5 15 18 11.5 Q22 17 26 19 Q32 17.5 38 19 Q42 17 46 11.5 Q51.5 15 51 28 ' +
  'Q53 46 32 50 Q11 46 13 28 Z" fill="#9c6b45"/>' +
  '<ellipse cx="32" cy="56" rx="11" ry="9.5" fill="#ead4b5"/>' +
  '<path d="M27 53 l2 1.8 l2 -1.8 M33 53 l2 1.8 l2 -1.8 M30 58 l2 1.8 l2 -1.8" stroke="#c7a57e" ' +
  'stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
  '<path d="M14 41 Q9.5 51 14.5 61 Q18.5 52 18 43 Z" fill="#7d5334"/>' +
  '<path d="M50 41 Q54.5 51 49.5 61 Q45.5 52 46 43 Z" fill="#7d5334"/>' +
  '<circle cx="24.5" cy="31" r="8" fill="#fff6e8" stroke="#e8c79a" stroke-width="1.2"/>' +
  '<circle cx="39.5" cy="31" r="8" fill="#fff6e8" stroke="#e8c79a" stroke-width="1.2"/>' +
  eyes(31.5, 24.5, 39.5, 3.8) +
  blush(40, 18, 46) +
  '<path d="M29.8 37 H34.2 Q33.8 40.2 32 41.6 Q30.2 40.2 29.8 37 Z" fill="#f2b33d"/>';

/**
 * El panda. La mancha negra hace de ojo y lleva solo los brillos: con un ojo blanco y una
 * pupila dentro de la mancha, la mirada quedaba fija y daba más miedo que ternura. Las
 * manchas caen un poco hacia fuera, que es lo que le da cara de bueno.
 */
const PANDA =
  shoulders(INK, '#fff') +
  `<circle cx="17" cy="19.5" r="6.8" fill="${INK}"/>` +
  `<circle cx="47" cy="19.5" r="6.8" fill="${INK}"/>` +
  '<circle cx="17" cy="19.5" r="3.2" fill="#4a4d55"/>' +
  '<circle cx="47" cy="19.5" r="3.2" fill="#4a4d55"/>' +
  '<ellipse cx="32" cy="34" rx="19.5" ry="17" fill="#fff" stroke="#e3e6ea" stroke-width="1"/>' +
  shine(23, 24.5) +
  `<ellipse cx="24.6" cy="34.6" rx="4.6" ry="5.4" transform="rotate(35 24.6 34.6)" fill="${INK}"/>` +
  `<ellipse cx="39.4" cy="34.6" rx="4.6" ry="5.4" transform="rotate(-35 39.4 34.6)" fill="${INK}"/>` +
  '<circle cx="25.8" cy="33" r="1.7" fill="#fff"/>' +
  '<circle cx="38.2" cy="33" r="1.7" fill="#fff"/>' +
  '<circle cx="24" cy="36.2" r=".7" fill="#fff" opacity=".85"/>' +
  '<circle cx="40" cy="36.2" r=".7" fill="#fff" opacity=".85"/>' +
  blush(41.5, 18.5, 45.5) +
  `<ellipse cx="32" cy="40.6" rx="2.6" ry="1.8" fill="${INK}"/>` +
  mouth(42.6);

const PENGUIN =
  '<path d="M9 64 Q11 47 32 47 Q53 47 55 64 Z" fill="#2f3a4a"/>' +
  '<path d="M19 64 Q21 52 32 52 Q43 52 45 64 Z" fill="#fff"/>' +
  '<path d="M11 52 Q7 58 10 64 H15 Q14 57 16 53 Z" fill="#253040"/>' +
  '<path d="M53 52 Q57 58 54 64 H49 Q50 57 48 53 Z" fill="#253040"/>' +
  '<ellipse cx="32" cy="34" rx="19.5" ry="18" fill="#2f3a4a"/>' +
  '<path d="M32 27.5 Q27 20.5 21.5 25.5 Q17.5 32 21 40.5 Q25.5 48.5 32 48.5 Q38.5 48.5 ' +
  '43 40.5 Q46.5 32 42.5 25.5 Q37 20.5 32 27.5 Z" fill="#fff"/>' +
  shine(22, 21, 5, 2.4) +
  eyes(34, 26.3, 37.7, 2.9) +
  blush(40, 22.8, 41.2) +
  '<path d="M28.8 38.2 H35.2 Q34.4 41.2 32 42.6 Q29.6 41.2 28.8 38.2 Z" fill="#f5a623"/>';

const RABBIT =
  '<path d="M16 64 Q17 51 32 51 Q47 51 48 64 Z" fill="#f7f7f9" stroke="#dcdde3" stroke-width="1"/>' +
  '<rect x="19.5" y="3.5" width="9.5" height="27" rx="4.75" fill="#f7f7f9" stroke="#dcdde3" ' +
  'stroke-width="1" transform="rotate(-10 24 16)"/>' +
  '<rect x="35" y="3.5" width="9.5" height="27" rx="4.75" fill="#f7f7f9" stroke="#dcdde3" ' +
  'stroke-width="1" transform="rotate(10 40 16)"/>' +
  '<rect x="22.2" y="7.5" width="4.2" height="19" rx="2.1" fill="#f7b3c2" transform="rotate(-10 24 16)"/>' +
  '<rect x="37.6" y="7.5" width="4.2" height="19" rx="2.1" fill="#f7b3c2" transform="rotate(10 40 16)"/>' +
  '<ellipse cx="32" cy="37.5" rx="17" ry="15" fill="#f7f7f9" stroke="#dcdde3" stroke-width="1"/>' +
  shine(23, 29, 5, 2.4) +
  eyes(36.5, 25, 39, 3) +
  blush(42, 20, 44) +
  '<path d="M30.4 41 H33.6 Q33.3 42.6 32 43.1 Q30.7 42.6 30.4 41 Z" fill="#f08da6"/>' +
  mouth(43.8) +
  '<rect x="30.8" y="44.6" width="2.4" height="2.6" rx=".6" fill="#fff" stroke="#d2d4db" stroke-width=".6"/>';

const KOALA =
  shoulders('#a7afb9', '#e7eaee') +
  '<circle cx="14" cy="25" r="10" fill="#a7afb9"/>' +
  '<circle cx="50" cy="25" r="10" fill="#a7afb9"/>' +
  '<circle cx="14.5" cy="25.5" r="6" fill="#eef0f3"/>' +
  '<circle cx="49.5" cy="25.5" r="6" fill="#eef0f3"/>' +
  '<ellipse cx="32" cy="35" rx="17.5" ry="15.5" fill="#a7afb9"/>' +
  shine(24, 26, 5, 2.6) +
  eyes(33, 24.5, 39.5, 2.9) +
  blush(40, 20, 44) +
  '<path d="M27.8 35.5 Q32 33 36.2 35.5 V40.5 Q32 45 27.8 40.5 Z" fill="#3b3f46"/>' +
  '<ellipse cx="30.2" cy="36.2" rx="1.3" ry="1.8" fill="#6a707a"/>' +
  `<path d="M30 46 Q32 47.6 34 46" stroke="${INK}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;

/**
 * La tortuga, por la paciencia: el ahorro que sale es el que se hace despacio. De frente,
 * como los demás: el caparazón asoma a los lados, el peto va delante con sus placas y las
 * aletas saludan a los costados.
 */
const TURTLE =
  '<path d="M7 64 Q8 41 32 41 Q56 41 57 64 Z" fill="#3e8e57"/>' +
  '<path d="M7.6 57 Q9.5 47.5 16 44" stroke="#2f7446" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
  '<path d="M56.4 57 Q54.5 47.5 48 44" stroke="#2f7446" stroke-width="1.6" fill="none" stroke-linecap="round"/>' +
  '<circle cx="12.5" cy="53" r="2.4" fill="#5aab6e"/>' +
  '<circle cx="51.5" cy="53" r="2.4" fill="#5aab6e"/>' +
  '<circle cx="18.5" cy="46.5" r="1.8" fill="#5aab6e"/>' +
  '<circle cx="45.5" cy="46.5" r="1.8" fill="#5aab6e"/>' +
  '<rect x="26.5" y="35" width="11" height="16" rx="4.5" fill="#7cc488"/>' +
  '<path d="M17.5 64 Q18.5 48.5 32 48.5 Q45.5 48.5 46.5 64 Z" fill="#f4e3a6"/>' +
  '<path d="M32 49 V64 M20.2 55.5 H43.8 M18.6 60.5 H45.4" stroke="#dcc57c" stroke-width="1.3" ' +
  'fill="none" stroke-linecap="round"/>' +
  '<ellipse cx="18.5" cy="56.5" rx="3.3" ry="5.8" transform="rotate(28 18.5 56.5)" fill="#a3dfae" stroke="#6aa876" stroke-width="1"/>' +
  '<ellipse cx="45.5" cy="56.5" rx="3.3" ry="5.8" transform="rotate(-28 45.5 56.5)" fill="#a3dfae" stroke="#6aa876" stroke-width="1"/>' +
  '<ellipse cx="32" cy="28.5" rx="14" ry="12.5" fill="#8fd19a"/>' +
  '<circle cx="26" cy="21" r="1.2" fill="#7cc488"/>' +
  '<circle cx="38.5" cy="20.5" r="1" fill="#7cc488"/>' +
  shine(24.5, 22, 4.5, 2.2) +
  eyes(28.5, 26.3, 37.7, 2.9) +
  blush(33.5, 21.5, 42.5) +
  `<path d="M28.5 33.8 Q32 37 35.5 33.8" stroke="${INK}" stroke-width="1.5" fill="none" ` +
  'stroke-linecap="round"/>';

/** Identificador que la API entiende como «quitar la imagen y volver a las iniciales». */
export const INITIALS_AVATAR = 'initials';

/**
 * Las once ilustraciones, en el orden de la cuadrícula: primero las que más se eligen, y la
 * alcancía y la llama delante porque son las que hacen de FinScope algo propio.
 */
export const AVATARS: readonly AvatarChoice[] = [
  { id: 'fox', label: 'Zorro', art: FOX },
  { id: 'cat', label: 'Gato', art: CAT },
  { id: 'dog', label: 'Perro', art: DOG },
  { id: 'piggy', label: 'Cerdito', art: PIGGY },
  { id: 'llama', label: 'Llama', art: LLAMA },
  { id: 'owl', label: 'Búho', art: OWL },
  { id: 'panda', label: 'Panda', art: PANDA },
  { id: 'penguin', label: 'Pingüino', art: PENGUIN },
  { id: 'rabbit', label: 'Conejo', art: RABBIT },
  { id: 'koala', label: 'Koala', art: KOALA },
  { id: 'turtle', label: 'Tortuga', art: TURTLE },
];

/**
 * La ilustración de un identificador guardado.
 *
 * @param id lo que trae la cuenta
 * @return la ilustración, o nula si no hay o no se conoce: entonces van las iniciales
 */
export function avatarOf(id: string | null | undefined): AvatarChoice | null {
  return AVATARS.find((choice) => choice.id === id) ?? null;
}

/**
 * Las iniciales de una cuenta: las de las dos primeras palabras del nombre, o la primera
 * letra del correo si no tiene nombre.
 *
 * @param name nombre con el que se presenta, si lo tiene
 * @param email correo de la cuenta
 * @return una o dos letras en mayúsculas
 */
export function initialsOf(
  name: string | null | undefined,
  email: string | null | undefined,
): string {
  const trimmed = name?.trim();
  if (trimmed) {
    return trimmed
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase();
  }
  return (email?.[0] ?? '?').toUpperCase();
}
