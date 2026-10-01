import { Component, DestroyRef, computed, effect, inject } from '@angular/core';
import { IonButton, IonIcon, Platform } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { fingerPrint } from 'ionicons/icons';
import { Subscription } from 'rxjs';

import { AppLockService } from '../core/app-lock.service';
import { AuthService } from '../core/auth.service';

/**
 * Tela de bloqueio do APK (ver AppLockService). Fica por cima de tudo -- inclusive modais, popovers
 * e alerts do Ionic, que empilham a partir de z-index ~20000 --, sem navegar: o que estava aberto
 * embaixo (um formulário pela metade, por exemplo) continua lá depois de desbloquear.
 */
@Component({
  selector: 'app-lock-overlay',
  imports: [IonButton, IonIcon],
  template: `
    @if (lock.locked()) {
      <div class="app-lock" role="dialog" aria-modal="true" aria-labelledby="app-lock-title">
        <div class="lock-wrap">
          <div class="brand-icon">$</div>
          <div class="lock-card">
            <div class="lock-icon" [class.busy]="lock.busy()">
              <ion-icon name="finger-print"></ion-icon>
            </div>
            <h2 id="app-lock-title">VR Finance bloqueado</h2>
            @if (firstName()) {
              <p class="lock-user">Olá, {{ firstName() }}</p>
            }
            @if (lock.errorMessage()) {
              <p class="lock-error">{{ lock.errorMessage() }}</p>
            }
            <ion-button expand="block" [disabled]="lock.busy()" (click)="lock.unlock()">
              {{ lock.busy() ? 'Verificando...' : 'Desbloquear' }}
            </ion-button>
            <button type="button" class="link-button" (click)="lock.logoutFromLock()">Sair e entrar com senha</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [
    `
      .app-lock {
        position: fixed;
        inset: 0;
        z-index: 100000;
        background:
          radial-gradient(circle at 50% 0%, rgba(var(--ion-color-primary-rgb), 0.18), transparent 60%),
          var(--ion-background-color);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        padding-top: calc(24px + env(safe-area-inset-top));
        animation: lock-fade-in 0.18s ease-out;
      }

      .lock-wrap {
        width: 100%;
        max-width: 380px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 28px;
      }

      .brand-icon {
        width: 56px;
        height: 56px;
        border-radius: 16px;
        background: var(--ion-color-primary);
        color: var(--ion-color-primary-contrast);
        font-size: 28px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 12px 28px rgba(var(--ion-color-primary-rgb), 0.35);
      }

      .lock-card {
        width: 100%;
        background: var(--app-surface-glass);
        backdrop-filter: blur(12px);
        border: 1px solid var(--app-surface-border);
        border-radius: 20px;
        padding: 28px 24px;
        box-shadow: 0 20px 40px rgba(0, 0, 0, 0.35);
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
      }

      .lock-icon {
        width: 72px;
        height: 72px;
        border-radius: 50%;
        background: var(--app-surface);
        border: 1px solid var(--app-surface-border);
        display: flex;
        align-items: center;
        justify-content: center;
        margin-bottom: 16px;
        font-size: 36px;
        color: var(--ion-color-primary);
      }

      .lock-icon.busy {
        animation: lock-pulse 1.2s ease-in-out infinite;
      }

      h2 {
        margin: 0;
        font-size: 1.15rem;
        font-weight: 700;
        color: var(--app-text-primary);
      }

      .lock-user {
        margin: 6px 0 0;
        color: var(--app-text-secondary);
        font-size: 0.9rem;
      }

      .lock-error {
        margin: 14px 0 0;
        color: var(--ion-color-danger);
        font-size: 0.85rem;
      }

      ion-button {
        width: 100%;
        margin-top: 22px;
        --border-radius: 12px;
        font-weight: 600;
      }

      .link-button {
        background: none;
        border: none;
        color: var(--app-text-secondary);
        font-size: 0.85rem;
        margin-top: 14px;
        cursor: pointer;
        text-decoration: underline;
      }

      @keyframes lock-pulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.45;
        }
      }

      @keyframes lock-fade-in {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
    `,
  ],
})
export class AppLockOverlayComponent {
  readonly lock = inject(AppLockService);
  private readonly auth = inject(AuthService);
  private readonly platform = inject(Platform);

  readonly firstName = computed(() => this.auth.currentUser()?.first_name ?? '');

  private backButtonSub?: Subscription;

  constructor() {
    addIcons({ fingerPrint });
    // Enquanto bloqueado, o voltar do Android minimiza o app em vez de fechar o modal que está embaixo.
    effect(() => {
      this.backButtonSub?.unsubscribe();
      this.backButtonSub = this.lock.locked()
        ? this.platform.backButton.subscribeWithPriority(10000, () => this.lock.minimizeApp())
        : undefined;
    });
    inject(DestroyRef).onDestroy(() => this.backButtonSub?.unsubscribe());
  }
}
