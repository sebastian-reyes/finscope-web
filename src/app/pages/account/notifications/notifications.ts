import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FinscopeService } from '../../../core/finscope.service';
import { NotificationPreferencesResponse } from '../../../core/models';
import { PushService } from '../../../core/push.service';
import { ToastService } from '../../../core/toast.service';
import { describeError } from '../../../core/api-error';

/**
 * Los avisos: si llegan a este dispositivo y cuáles quiere la cuenta.
 *
 * Lo que se activa aquí es el dispositivo; las preferencias, en cambio, son de la cuenta y
 * valen para todos.
 */
@Component({
  selector: 'app-account-notifications',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notifications.html',
  styleUrls: ['../settings-shared.scss', './notifications.scss'],
})
export class AccountNotificationsPage {
  private readonly api = inject(FinscopeService);
  private readonly push = inject(PushService);
  private readonly toasts = inject(ToastService);

  /** En qué punto están los avisos en este dispositivo. */
  protected readonly pushStatus = this.push.status;
  protected readonly pushBusy = this.push.busy;

  /** Qué avisos quiere la cuenta. Nulo hasta que se piden, que es al tener uno activo. */
  protected readonly preferences = signal<NotificationPreferencesResponse | null>(null);
  protected readonly sendingTest = signal(false);

  constructor() {
    // Las preferencias solo se enseñan con los avisos activos en este dispositivo, así que se
    // piden entonces y no al abrir la pantalla: sin avisos no hay nada que elegir.
    effect(() => {
      if (this.pushStatus() === 'on' && !untracked(this.preferences)) {
        untracked(() => this.loadPreferences());
      }
    });
  }

  /** Pide el permiso del teléfono y suscribe este dispositivo. */
  protected async enablePush(): Promise<void> {
    try {
      await this.push.enable();
      if (this.pushStatus() === 'on') {
        this.toasts.success('Avisos activados en este dispositivo');
      }
    } catch (error) {
      if (this.pushStatus() === 'denied') {
        return;
      }
      this.toasts.error(describeError(error));
    }
  }

  protected async disablePush(): Promise<void> {
    await this.push.disable();
    this.toasts.success('Avisos desactivados en este dispositivo');
  }

  /** Manda un aviso de prueba, que es la única forma de saber que llegan de verdad. */
  protected sendTestNotification(): void {
    if (this.sendingTest()) {
      return;
    }
    this.sendingTest.set(true);
    this.push.sendTest().subscribe({
      next: ({ delivered }) => {
        this.sendingTest.set(false);
        if (delivered > 0) {
          this.toasts.success('Aviso enviado. Debería llegarte en unos segundos.');
        } else {
          this.toasts.error('No hay ningún dispositivo que pueda recibirlo. Vuelve a activarlos.');
        }
      },
      error: (error) => {
        this.sendingTest.set(false);
        this.toasts.error(describeError(error));
      },
    });
  }

  /**
   * Cambia una preferencia al momento, sin botón de guardar, como el tema.
   * Si la API falla se vuelve atrás, para que el interruptor no mienta sobre lo que hay.
   */
  protected setPreference(key: keyof NotificationPreferencesResponse, value: boolean): void {
    const previous = this.preferences();
    if (!previous) {
      return;
    }
    this.preferences.set({ ...previous, [key]: value });
    this.api.updateNotificationPreferences({ [key]: value }).subscribe({
      next: (saved) => this.preferences.set(saved),
      error: (error) => {
        this.preferences.set(previous);
        this.toasts.error(describeError(error));
      },
    });
  }

  private loadPreferences(): void {
    this.api.getNotificationPreferences().subscribe({
      next: (preferences) => this.preferences.set(preferences),
      error: (error) => this.toasts.error(describeError(error)),
    });
  }
}
