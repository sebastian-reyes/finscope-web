import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FinscopeService } from '../../core/finscope.service';
import { ToastService } from '../../core/toast.service';
import { CategoryResponse, CategoryScope } from '../../core/models';
import { describeError } from '../../core/api-error';
import { CategoryChipComponent } from '../../shared/ui/category-chip';

/** Un ámbito con la forma en que se presenta en pantalla. */
interface Scope {
  scope: CategoryScope;
  /** Cómo se llama el grupo. */
  label: string;
  /** Icono que lo identifica, el mismo que usa el tipo de movimiento en el resto de la app. */
  icon: string;
  /** Qué se dice cuando el grupo está vacío. */
  empty: string;
}

/**
 * Los tres ámbitos, en el orden en que se muestran.
 * Los egresos van primero porque son la mayoría de los movimientos y de las categorías.
 */
const SCOPES: readonly Scope[] = [
  {
    scope: 'EXPENSE',
    label: 'Egresos',
    icon: 'bi-arrow-down-left',
    empty: 'Todavía no tienes categorías de egresos.',
  },
  {
    scope: 'INCOME',
    label: 'Ingresos',
    icon: 'bi-arrow-up-right',
    empty: 'Todavía no tienes categorías de ingresos.',
  },
  {
    scope: 'BOTH',
    label: 'Ambos',
    icon: 'bi-arrow-down-up',
    empty: 'Ninguna categoría sirve para las dos cosas.',
  },
];

/** Un ámbito junto a las categorías que lo tienen. */
interface CategoryGroup extends Scope {
  categories: CategoryResponse[];
}

/**
 * Catálogo de categorías del usuario.
 *
 * La categoría es la clasificación principal de un movimiento y cada uno lleva exactamente
 * una, de modo que renombrar o borrar alcanza a todos los que clasifica: cada fila enseña
 * cuántos hay detrás antes de dejar tocarla.
 *
 * El catálogo se agrupa por ámbito y no en una lista sola. Una categoría de ingresos y una
 * de egresos no compiten entre sí —nunca se ofrecen en el mismo formulario— y mezclarlas
 * obligaba a leer una etiqueta pequeña en cada fila para saber cuál era cuál.
 *
 * Borrar no destruye nada. Como la categoría es obligatoria, los movimientos de la que se
 * elimina pasan a la categoría de reserva, que por eso no se puede borrar y aparece
 * marcada.
 */
@Component({
  selector: 'app-categories',
  imports: [ReactiveFormsModule, RouterLink, CategoryChipComponent],
  templateUrl: './categories.html',
  styleUrl: './categories.scss',
})
export class CategoriesPage {
  private readonly api = inject(FinscopeService);
  private readonly toasts = inject(ToastService);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly scopes = SCOPES;

  protected readonly categories = signal<CategoryResponse[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly showCreate = signal(false);
  /** Categoría que se está editando, si hay alguna. */
  protected readonly editingId = signal<number | null>(null);
  /** Categoría cuyo borrado espera confirmación en su propia fila. */
  protected readonly confirmingId = signal<number | null>(null);

  /** Ámbito elegido en el formulario de alta y en el de edición. */
  protected readonly newScope = signal<CategoryScope>('EXPENSE');
  protected readonly editScope = signal<CategoryScope>('EXPENSE');

  /**
   * Los dos formularios de la pantalla. Solo el nombre va aquí: el ámbito se elige tocando
   * una pastilla y vive en su propia señal.
   *
   * Van en grupo y no como controles sueltos porque `ngSubmit` no es un suceso del navegador
   * sino una salida de `FormGroupDirective`: sin `[formGroup]` en la etiqueta, el `<form>` se
   * enviaba de verdad —recargando la página— y el método de alta no llegaba a ejecutarse
   * nunca. `ReactiveFormsModule` tampoco trae `NgForm`, que es quien lo aportaría en un
   * formulario dirigido por plantilla.
   */
  protected readonly newForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(70)]],
  });

  protected readonly editForm = this.formBuilder.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(70)]],
  });

  protected readonly newName = this.newForm.controls.name;
  protected readonly editName = this.editForm.controls.name;

  /** El catálogo repartido en sus tres grupos, siempre los tres. */
  protected readonly groups = computed<CategoryGroup[]>(() =>
    SCOPES.map((scope) => ({
      ...scope,
      categories: this.categories().filter((category) => category.appliesTo === scope.scope),
    })),
  );

  /** Nombre de la categoría de reserva, para explicar a dónde van los movimientos. */
  protected readonly fallbackName = computed(
    () => this.categories().find((category) => category.isSystem)?.name ?? 'Otros',
  );

  protected readonly unused = computed(() =>
    this.categories().filter((category) => category.transactionCount === 0),
  );

  constructor() {
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.listCategories().subscribe({
      next: (categories) => {
        this.categories.set(categories);
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(describeError(error));
        this.loading.set(false);
      },
    });
  }

  /**
   * Abre el formulario de alta ya apuntando al grupo desde el que se pidió.
   * Es la diferencia entre añadir «una categoría» y añadir «una categoría de ingresos»:
   * el ámbito ya lo dijo el usuario al pulsar en ese grupo.
   *
   * @param scope ámbito con el que nace la categoría
   */
  protected openCreate(scope: CategoryScope): void {
    this.showCreate.set(true);
    this.newName.reset('');
    this.newScope.set(scope);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  protected toggleCreate(): void {
    this.showCreate.set(!this.showCreate());
    this.newName.reset('');
    this.newScope.set('EXPENSE');
  }

  /**
   * Traduce el ámbito al texto con el que se explica en pantalla.
   *
   * @param scope ámbito de la categoría
   * @return la etiqueta que se muestra
   */
  protected scopeLabel(scope: CategoryScope): string {
    return SCOPES.find((candidate) => candidate.scope === scope)!.label;
  }

  protected create(): void {
    if (this.newName.invalid || this.saving()) {
      this.newName.markAsTouched();
      return;
    }
    this.saving.set(true);
    this.api.createCategory(this.newName.value.trim(), this.newScope()).subscribe({
      next: (category) => {
        this.toasts.success(`Categoría «${category.name}» creada`);
        this.newName.reset('');
        this.showCreate.set(false);
        this.saving.set(false);
        this.reload();
      },
      error: (error) => this.fail(error),
    });
  }

  protected startEdit(category: CategoryResponse): void {
    this.editingId.set(category.id);
    this.confirmingId.set(null);
    this.editName.setValue(category.name);
    this.editScope.set(category.appliesTo);
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
  }

  /**
   * Guarda el nombre y el ámbito nuevos.
   * La API rechaza con un conflicto el nombre que ya ocupa otra categoría en vez de
   * fusionarlas, y ese mensaje es el que acaba en el aviso.
   */
  protected saveEdit(id: number): void {
    if (this.editName.invalid || this.saving()) {
      return;
    }
    this.saving.set(true);
    this.api.updateCategory(id, this.editName.value.trim(), this.editScope()).subscribe({
      next: (category) => {
        this.toasts.success(`Guardado como «${category.name}»`);
        this.editingId.set(null);
        this.saving.set(false);
        this.reload();
      },
      error: (error) => this.fail(error),
    });
  }

  protected askRemove(category: CategoryResponse): void {
    this.confirmingId.set(category.id);
    this.editingId.set(null);
  }

  protected cancelRemove(): void {
    this.confirmingId.set(null);
  }

  protected remove(category: CategoryResponse): void {
    this.saving.set(true);
    this.api.deleteCategory(category.id).subscribe({
      next: () => {
        this.toasts.success(`«${category.name}» eliminada`);
        this.confirmingId.set(null);
        this.saving.set(false);
        this.reload();
      },
      error: (error) => this.fail(error),
    });
  }

  private fail(error: unknown): void {
    this.toasts.error(describeError(error));
    this.saving.set(false);
  }
}
