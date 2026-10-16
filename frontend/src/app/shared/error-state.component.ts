import { Component, input, output } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { cloudOfflineOutline, refreshOutline } from 'ionicons/icons';

/** "Não foi possível carregar" + "Tentar novamente" -- estado de erro de uma seção. */
@Component({
  selector: 'app-error-state',
  imports: [IonButton, IonIcon],
  template: `
    <div class="error-state" role="alert">
      <ion-icon name="cloud-offline-outline" aria-hidden="true"></ion-icon>
      <div class="error-text">
        <strong>{{ title() }}</strong>
        <span>Verifique a conexão com o servidor e tente de novo.</span>
      </div>
      <ion-button fill="outline" size="small" (click)="retry.emit()">
        <ion-icon slot="start" name="refresh-outline" aria-hidden="true"></ion-icon>
        Tentar novamente
      </ion-button>
    </div>
  `,
  styles: [
    `
      .error-state {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 14px;
        padding: 18px 20px;
        border-radius: var(--r-md);
        border: 1px solid rgba(var(--ion-color-danger-rgb), 0.4);
        background: rgba(var(--ion-color-danger-rgb), 0.08);
      }
      .error-state > ion-icon {
        flex-shrink: 0;
        font-size: 1.6rem;
        color: var(--ion-color-danger);
      }
      .error-text {
        flex: 1;
        min-width: 180px;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      strong {
        font-size: var(--fs-sm);
        color: var(--app-text-primary);
      }
      span {
        font-size: var(--fs-sm);
        color: var(--app-text-secondary);
      }
      ion-button {
        --border-radius: var(--r-sm);
        margin: 0;
        font-weight: 600;
      }
    `,
  ],
})
export class ErrorStateComponent {
  readonly title = input('Não foi possível carregar esta seção');
  readonly retry = output<void>();

  constructor() {
    addIcons({ cloudOfflineOutline, refreshOutline });
  }
}
