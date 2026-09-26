import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  linkedSignal,
  signal,
} from '@angular/core';
import { AuthService } from '../../../core/auth.service';
import { AVATARS, INITIALS_AVATAR, avatarOf } from '../../../core/format/avatars';
import { ToastService } from '../../../core/toast.service';
import { describeError } from '../../../core/api-error';
import { AvatarComponent } from '../../../shared/ui/avatar';

/**
 * El nombre con el que la aplicación se dirige al usuario y su imagen de perfil.
 *
 * El correo también es un dato suyo, pero no vive aquí: es la credencial con la que se entra
 * y cambiarlo es un trámite con contraseña y enlace, así que va en Seguridad.
 */
@Component({
  selector: 'app-account-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AvatarComponent],
  template: `
    <!--
      La imagen va antes que el nombre porque es lo primero que se ve de la cuenta. Se aplica
      al tocarla, sin botón de guardar, como el tema y los colores: se ve el efecto delante y
      confirmarlo solo añadiría un paso.
    -->
    <section class="fs-panel fs-block" aria-labelledby="imagenTitle">
      <h2 class="fs-card__title" id="imagenTitle">
        <i class="bi bi-emoji-smile" aria-hidden="true"></i>Tu imagen
      </h2>

      <div class="fs-avatars" role="group" aria-labelledby="imagenTitle">
        @for (choice of choices; track choice.id) {
          <button
            type="button"
            class="fs-avatars__item"
            [class.is-active]="chosen() === choice.id"
            [attr.aria-pressed]="chosen() === choice.id"
            [attr.aria-label]="choice.label"
            [attr.title]="choice.label"
            (click)="pickAvatar(choice.id)"
          >
            <fs-avatar
              class="fs-avatars__img"
              [avatar]="choice.id"
              [name]="auth.user()?.displayName"
              [email]="auth.user()?.email"
            />
          </button>
        }
      </div>
      <p class="fs-hint">Se ve en tu perfil y en todos los dispositivos donde entres.</p>
    </section>

    <section class="fs-panel fs-block" aria-labelledby="nombreTitle">
      <h2 class="fs-card__title" id="nombreTitle">
        <i class="bi bi-person" aria-hidden="true"></i>Nombre
      </h2>

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
  styles: `
    .fs-avatars {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(3.5rem, 1fr));
      gap: 0.75rem;
      max-width: 26rem;
      margin-top: 1rem;
    }

    .fs-avatars__item {
      display: flex;
      justify-content: center;
      padding: 0;
      border: 0;
      background: none;
      cursor: pointer;
    }

    .fs-avatars__img {
      width: 3.25rem;
      height: 3.25rem;
      transition:
        transform 0.15s ease,
        box-shadow 0.15s ease;
    }

    .fs-avatars__item:hover .fs-avatars__img {
      transform: scale(1.06);
    }

    .fs-avatars__item:active .fs-avatars__img {
      transform: scale(0.94);
    }

    /* La elegida se marca con un anillo por fuera, como las muestras de color. */
    .fs-avatars__item.is-active .fs-avatars__img {
      box-shadow:
        0 0 0 2px var(--fs-surface),
        0 0 0 4px var(--fs-ink);
    }

    .fs-avatars__item:focus-visible {
      outline: none;
    }

    .fs-avatars__item:focus-visible .fs-avatars__img {
      box-shadow:
        0 0 0 2px var(--fs-surface),
        0 0 0 4px var(--fs-brand);
    }
  `,
})
export class AccountProfilePage {
  protected readonly auth = inject(AuthService);
  private readonly toasts = inject(ToastService);

  protected readonly saving = signal(false);

  /** Las iniciales primero —son lo que hay si no se elige nada— y detrás los animales. */
  protected readonly choices = [
    { id: INITIALS_AVATAR, label: 'Tus iniciales' },
    ...AVATARS.map(({ id, label }) => ({ id, label })),
  ];

  /**
   * La imagen marcada. Sigue a la de la cuenta, pero al tocar otra se marca al momento, sin
   * esperar a la API; si esta falla, vuelve a la de la cuenta. Una imagen que no se conozca
   * cuenta como las iniciales, que es como se pinta.
   */
  protected readonly chosen = linkedSignal(
    () => avatarOf(this.auth.user()?.avatar)?.id ?? INITIALS_AVATAR,
  );

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

  /**
   * Guarda la imagen elegida.
   *
   * @param id la ilustración, o las iniciales para quitarla
   */
  protected pickAvatar(id: string): void {
    const previous = this.chosen();
    if (id === previous) {
      return;
    }
    this.chosen.set(id);
    this.auth.updateProfile({ avatar: id }).subscribe({
      error: (error) => {
        this.chosen.set(previous);
        this.toasts.error(describeError(error));
      },
    });
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
