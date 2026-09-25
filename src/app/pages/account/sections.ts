import { SectionTab } from '../../shared/ui/catalogue-tabs';

/** Una de las pantallas que cuelgan de la configuración. */
export interface AccountSection {
  /** Segmento de la dirección, detrás de `/account/`. */
  slug: string;
  title: string;
  /** Lo que se lee debajo del título al abrirla. */
  hint: string;
  icon: string;
  /**
   * Pantallas hermanas que se abren desde la misma fila, si las hay. Cada una trae su propio
   * título, así que en lugar del de la sección se enseña el conmutador entre ellas.
   */
  tabs?: readonly SectionTab[];
}

/**
 * Las pantallas de la configuración, en el orden en que se leen en el menú.
 *
 * Antes todo esto era una sola pantalla —nombre, correo, contraseña, avisos, tema, colores y
 * recorrido—, y en el teléfono había que desplazarse cinco pantallas para llegar al final.
 * Ahora el menú dice qué hay y cada cosa se abre por separado, como en los ajustes del propio
 * teléfono, que es el idioma que ya se conoce.
 */
export const SECTIONS: readonly AccountSection[] = [
  {
    slug: 'profile',
    title: 'Tus datos',
    hint: 'Cómo te llamamos dentro de la aplicación.',
    icon: 'bi-person',
  },
  {
    // Se configuran al empezar y luego se tocan poco: por eso están aquí y no en la barra,
    // donde estaban antes y se llevaban el hueco que ahora ocupa el plan del mes.
    slug: 'categories',
    title: 'Categorías y tags',
    hint: 'Cómo ordenas tus movimientos: en qué se va el dinero y en qué contexto.',
    icon: 'bi-grid-1x2',
    tabs: [
      { path: '/account/categories', label: 'Categorías', icon: 'bi-grid-1x2' },
      { path: '/account/tags', label: 'Tags', icon: 'bi-tags' },
    ],
  },
  {
    slug: 'notifications',
    title: 'Notificaciones',
    hint: 'Avisos de tus pagos fijos y presupuestos, aunque no abras la aplicación.',
    icon: 'bi-bell',
  },
  {
    slug: 'security',
    title: 'Seguridad',
    hint: 'El correo con el que entras y tu contraseña.',
    icon: 'bi-shield-lock',
  },
  {
    slug: 'appearance',
    title: 'Tema y colores',
    hint: 'Cómo ves la aplicación. Nada de esto cambia tus movimientos.',
    icon: 'bi-palette',
  },
];

/** Las direcciones completas de esas pantallas, para la barra y para el deslizamiento. */
export const ACCOUNT_SECTIONS: readonly string[] = SECTIONS.flatMap((section) =>
  section.tabs ? section.tabs.map((tab) => tab.path) : [`/account/${section.slug}`],
);

/**
 * La sección a la que pertenece una dirección de la configuración.
 *
 * @param url dirección completa, con sus parámetros si los lleva
 * @return la sección, o nula si es el menú o una dirección de fuera
 */
export function sectionOf(url: string): AccountSection | null {
  const path = url.split('?')[0];
  return (
    SECTIONS.find(
      (section) =>
        path === `/account/${section.slug}` ||
        (section.tabs?.some((tab) => tab.path === path) ?? false),
    ) ?? null
  );
}
