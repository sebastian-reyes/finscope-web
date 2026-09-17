import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { FinscopeService } from '../../core/finscope.service';
import { RefreshService } from '../../core/refresh.service';
import { ToastService } from '../../core/toast.service';
import { TagResponse } from '../../core/models';
import { describeError } from '../../core/api-error';
import { TagChipComponent } from '../../shared/ui/tag-chip';
import { ChipColorPickerComponent } from '../../shared/ui/chip-color-picker';
import { ChipIconPickerComponent } from '../../shared/ui/chip-icon-picker';
import { styleChange } from '../../core/format/chip-color';

/**
 * Catálogo de tags del usuario.
 *
 * El tag es una entidad compartida por sus transacciones, así que renombrarlo o borrarlo
 * alcanza a todas de golpe: cada fila enseña cuántas hay detrás antes de dejar tocarlo. La
 * vía normal de crearlos sigue siendo escribirlos al registrar un movimiento; darlos de
 * alta aquí solo adelanta trabajo.
 *
 * El tag es el contexto —con quién, para qué, en qué viaje— y puede haber varios en un
 * mismo movimiento, de modo que sus importes se solapan y nunca reparten un total: eso lo
 * hacen las categorías, en la pantalla de al lado.
 */
@Component({
  selector: 'app-tags',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TagChipComponent,
    ChipColorPickerComponent,
    ChipIconPickerComponent,
  ],
  templateUrl: './tags.html',
  styleUrl: './tags.scss',
})
export class TagsPage {
  private readonly api = inject(FinscopeService);
  private readonly toasts = inject(ToastService);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly tags = signal<TagResponse[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly showCreate = signal(false);
  /** Tag que se está editando, si hay alguno. */
  protected readonly editingId = signal<number | null>(null);
  /** Tag cuyo borrado espera confirmación en su propia fila. */
  protected readonly confirmingId = signal<number | null>(null);

  /**
   * Los dos formularios de la pantalla, cada uno con su único campo.
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

  /**
   * Color e icono elegidos en cada formulario, nulos para el automático. Van en señal y no en
   * el grupo porque los selectores no son controles de formulario.
   */
  protected readonly newColor = signal<string | null>(null);
  protected readonly editColor = signal<string | null>(null);
  protected readonly newIcon = signal<string | null>(null);
  protected readonly editIcon = signal<string | null>(null);

  protected readonly used = computed(() => this.tags().filter((tag) => tag.transactionCount > 0));
  protected readonly unused = computed(() =>
    this.tags().filter((tag) => tag.transactionCount === 0),
  );

  constructor() {
    // Arrastrar hacia abajo recarga esta pantalla. El gesto vive en la carcasa —el dedo
    // arrastra la ventana, no una pantalla concreta—, así que lo que se deja aquí es qué hay
    // que volver a pedir y cómo saber que ya ha terminado.
    inject(DestroyRef).onDestroy(
      inject(RefreshService).register(() => this.reload(), this.loading),
    );
    this.reload();
  }

  protected reload(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.listTags().subscribe({
      next: (tags) => {
        this.tags.set(tags);
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(describeError(error));
        this.loading.set(false);
      },
    });
  }

  protected toggleCreate(): void {
    this.showCreate.set(!this.showCreate());
    this.newName.reset('');
    this.newColor.set(null);
    this.newIcon.set(null);
  }

  protected create(): void {
    if (this.newName.invalid || this.saving()) {
      this.newName.markAsTouched();
      return;
    }
    this.saving.set(true);
    const style = { color: this.newColor() ?? undefined, icon: this.newIcon() ?? undefined };
    this.api.createTag(this.newName.value.trim(), style).subscribe({
      next: (tag) => {
        this.toasts.success(`Tag «${tag.name}» creado`);
        this.newName.reset('');
        this.showCreate.set(false);
        this.saving.set(false);
        this.reload();
      },
      error: (error) => this.fail(error),
    });
  }

  protected startEdit(tag: TagResponse): void {
    this.editingId.set(tag.id);
    this.confirmingId.set(null);
    this.editName.setValue(tag.name);
    this.editColor.set(tag.color ?? null);
    this.editIcon.set(tag.icon ?? null);
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
  }

  /**
   * Guarda el nombre, el color y el icono.
   * La API rechaza con un conflicto el nombre que ya ocupa otro tag en vez de fusionarlos,
   * y ese mensaje es el que acaba en el aviso. Color e icono solo viajan si han cambiado, y
   * volver al automático va como `auto`: sin campo, la API deja el que hubiera.
   */
  protected saveEdit(tag: TagResponse): void {
    if (this.editName.invalid || this.saving()) {
      return;
    }
    this.saving.set(true);
    const id = tag.id;
    const style = {
      color: styleChange(tag.color, this.editColor()),
      icon: styleChange(tag.icon, this.editIcon()),
    };
    this.api.updateTag(id, this.editName.value.trim(), style).subscribe({
      next: (tag) => {
        this.toasts.success(`Tag «${tag.name}» guardado`);
        this.editingId.set(null);
        this.saving.set(false);
        this.reload();
      },
      error: (error) => this.fail(error),
    });
  }

  protected askRemove(tag: TagResponse): void {
    this.confirmingId.set(tag.id);
    this.editingId.set(null);
  }

  protected cancelRemove(): void {
    this.confirmingId.set(null);
  }

  protected remove(tag: TagResponse): void {
    this.saving.set(true);
    this.api.deleteTag(tag.id).subscribe({
      next: () => {
        this.toasts.success(`Tag «${tag.name}» eliminado`);
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
