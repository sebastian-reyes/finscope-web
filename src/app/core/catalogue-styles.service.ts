import {
  Injectable,
  Injector,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { AuthService } from './auth.service';
import { FinscopeService } from './finscope.service';
import { chipIcon } from './format/icon-choices';

/** De qué catálogo es un nombre: una categoría y un tag pueden llamarse igual. */
export type CatalogueKind = 'category' | 'tag';

/** El aspecto elegido de una ficha. Cada campo, nulo si se deduce del nombre. */
export interface ChipStyle {
  color: string | null;
  icon: string | null;
}

/** Lo mínimo de un elemento del catálogo para saber cómo pintarlo. */
interface Styled {
  name: string;
  color?: string | null;
  icon?: string | null;
}

type StyleMap = ReadonlyMap<string, ChipStyle>;

const NO_STYLE: ChipStyle = { color: null, icon: null };

/**
 * El color y el icono elegidos de cada categoría y cada tag, por nombre.
 *
 * Hace falta porque la mayoría de las fichas no tienen el objeto a mano: una transacción trae
 * los tags como nombres sueltos, y los presupuestos, los fijos y el resumen traen la categoría
 * por nombre. En vez de ensanchar esas respuestas, las fichas preguntan aquí.
 *
 * Se llena de dos formas. Cada vez que cualquier pantalla pide el catálogo, {@link
 * FinscopeService} deja aquí la copia —así cambiar un color o un icono en la pantalla de tags
 * se ve al momento en el resto—. Y la primera ficha que se pinta con sesión abierta pide los dos
 * catálogos una vez, para las pantallas que nunca los piden. Si esa petición falla no pasa
 * nada: las fichas se quedan con lo deducido del nombre, que es lo que había antes.
 *
 * Los mapas se vacían al cambiar de sesión, igual que la paleta: el aspecto de una cuenta no
 * es de la siguiente.
 */
@Injectable({ providedIn: 'root' })
export class CatalogueStylesService {
  private readonly auth = inject(AuthService);
  private readonly injector = inject(Injector);

  private readonly owner = computed(() => this.auth.user()?.id ?? null);

  private readonly maps = linkedSignal({
    source: this.owner,
    computation: (): Record<CatalogueKind, StyleMap> => ({ category: new Map(), tag: new Map() }),
  });

  /** Si alguna ficha ha preguntado ya, que es lo único que justifica pedir los catálogos. */
  private readonly wanted = signal(false);

  constructor() {
    effect(() => {
      const owner = this.owner();
      if (owner === null || !this.wanted()) {
        return;
      }
      untracked(() => this.load());
    });
  }

  /**
   * El aspecto guardado de un elemento del catálogo.
   *
   * @param kind catálogo al que pertenece
   * @param name nombre tal y como se muestra
   * @return el color y el icono guardados; nulos si no tiene o todavía no se sabe
   */
  styleOf(kind: CatalogueKind, name: string): ChipStyle {
    return this.maps()[kind].get(key(name)) ?? NO_STYLE;
  }

  /**
   * La clase del icono con que se pinta un elemento: el elegido o, si no hay, el deducido.
   * Es lo que usan los desplegables, que no pintan una ficha pero sí su icono.
   *
   * @param kind catálogo al que pertenece
   * @param name nombre tal y como se muestra
   * @return la clase CSS del icono
   */
  iconOf(kind: CatalogueKind, name: string): string {
    return chipIcon(name, this.styleOf(kind, name).icon);
  }

  /**
   * Avisa de que hay fichas que pintar.
   * Lo llaman las fichas al construirse, y no {@link styleOf}, porque aquella se evalúa dentro
   * de un `computed` y ahí no se puede escribir en una señal.
   */
  watch(): void {
    if (!this.wanted()) {
      this.wanted.set(true);
    }
  }

  /**
   * Sustituye lo que se sabía de un catálogo por su copia recién pedida.
   *
   * @param kind catálogo recibido
   * @param items todos sus elementos
   */
  remember(kind: CatalogueKind, items: readonly Styled[]): void {
    const next = new Map<string, ChipStyle>();
    for (const item of items) {
      if (item.color || item.icon) {
        next.set(key(item.name), toStyle(item));
      }
    }
    this.maps.update((maps) => ({ ...maps, [kind]: next }));
  }

  /**
   * Apunta un solo elemento, recién creado o modificado, sin esperar a la lista.
   *
   * @param kind catálogo al que pertenece
   * @param item el elemento tal y como lo devolvió la API
   */
  rememberOne(kind: CatalogueKind, item: Styled): void {
    this.maps.update((maps) => {
      const next = new Map(maps[kind]);
      if (item.color || item.icon) {
        next.set(key(item.name), toStyle(item));
      } else {
        next.delete(key(item.name));
      }
      return { ...maps, [kind]: next };
    });
  }

  /**
   * Pide los dos catálogos. El servicio de la API se toma aquí y no en el constructor porque
   * él también depende de este: inyectarlo arriba sería un ciclo.
   */
  private load(): void {
    const api = this.injector.get(FinscopeService);
    const ignore = { error: () => undefined };
    api.listCategories().subscribe(ignore);
    api.listTags().subscribe(ignore);
  }
}

function toStyle(item: Styled): ChipStyle {
  return { color: item.color ?? null, icon: item.icon ?? null };
}

/** Los nombres se comparan sin distinguir mayúsculas, igual que la API impide repetirlos. */
function key(name: string): string {
  return name.trim().toLocaleLowerCase('es');
}
