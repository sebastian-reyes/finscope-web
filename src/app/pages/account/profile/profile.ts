import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { AuthService } from '../../../core/auth.service';
import { ToastService } from '../../../core/toast.service';
import { describeError } from '../../../core/api-error';

/**
 * El nombre con el que la aplicación se dirige al usuario.
 *
 * El correo también es un dato suyo, pero no vive aquí: es la credencial con la que se entra
 * y cambiarlo es un trámite con contraseña y enlace, así que va en Seguridad.
 */
@Component({
  selector: 'app-account-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="fs-panel fs-block" aria-labelledby="nombreTitle">
      <p class="fs-section" id="nombreTitle">Nombre</p>

      <form class="fs-form" (submit)="onSubmit($event)">
        <div>
          <label class="fs-label" for="accountName">Cómo quieres que te llamemos</label>
          <input
            id="accountName"
            type="text"
            class="fs-field"
            maxlength="70"
            autocomplete="name"
            placeholder="Tu nombre"
            [value]="name()"
            [disabled]="saving()"
            (input)="name.set($any($event.target).value)"
          />
          <p class="fs-hint">
            Es el saludo del inicio y lo que aparece arriba a la derecha. Puedes dejarlo en blanco y
            se usará tu correo.
          </p>
        </div>

        @if (changed()) {
          <div class="fs-form__actions" animate.enter="fs-anim-expand">
            <button
              type="button"
              class="fs-btn fs-btn--ghost"
              [disabled]="saving()"
              (click)="discard()"
            >
              Descartar
            </button>
            <button type="submit" class="fs-btn fs-btn--solid" [disabled]="saving()">
              @if (saving()) {
                <span class="fs-spinner" aria-hidden="true"></span>
                Guardando…
              } @else {
                Guardar nombre
              }
            </button>
          </div>
        }
      </form>
    </section>
  `,
  styleUrl: '../settings-shared.scss',
})
export class AccountProfilePage {
  private readonly auth = inject(AuthService);
  private readonly toasts = inject(ToastService);

  protected readonly saving = signal(false);

  /**
   * Nombre tal y como se está escribiendo, que solo se guarda al confirmarlo.
   *
   * Sigue al guardado —el menú vuelve a preguntar quién es el usuario al abrirse, y el nombre
   * puede haber cambiado desde otro dispositivo— salvo si alguien estaba escribiendo: lo
   * tecleado no se pisa por debajo.
   */
  protected readonly name = linkedSignal<string, string>({
    source: () => this.auth.user()?.displayName ?? '',
    computation: (saved, previous) =>
      previous && previous.value.trim() !== previous.source ? previous.value : saved,
  });

  /** Si lo escrito difiere de lo guardado: es lo único que merece ofrecer guardar. */
  protected readonly changed = computed(
    () => this.name().trim() !== (this.auth.user()?.displayName ?? ''),
  );

  /**
   * Recoge el envío del formulario nativo.
   * Se usa el suceso del navegador y no `ngSubmit` para no arrastrar el módulo de
   * formularios por un solo campo, así que frenar la navegación toca aquí.
   *
   * @param event envío del formulario
   */
  protected onSubmit(event: Event): void {
    event.preventDefault();
    this.save();
  }

  /** Devuelve el campo a lo que hay guardado. */
  protected discard(): void {
    this.name.set(this.auth.user()?.displayName ?? '');
  }

  protected save(): void {
    if (this.saving() || !this.changed()) {
      return;
    }
    this.saving.set(true);
    // Se manda recortado, que es como va a quedar guardado: así lo que se ve en el campo
    // tras guardar es exactamente lo que hay en la base de datos.
    this.auth.updateProfile({ displayName: this.name().trim() }).subscribe({
      next: (user) => {
        this.name.set(user.displayName ?? '');
        this.saving.set(false);
        this.toasts.success(user.displayName ? 'Nombre actualizado' : 'Nombre quitado');
      },
      error: (error) => {
        this.toasts.error(describeError(error));
        this.saving.set(false);
      },
    });
  }
}
