import { Component, Input } from '@angular/core';
import { IonSpinner } from '@ionic/angular';

/** Spinner + mensagem centralizados, usado enquanto os dados de uma página ainda não chegaram. */
@Component({
  selector: 'app-loading-state',
  standalone: true,
  imports: [IonSpinner],
  template: `
    <div class="loading-state">
      <ion-spinner name="crescent"></ion-spinner>
      <p>{{ message }}</p>
    </div>
  `,
  styles: [
    `
      .loading-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 16px;
        min-height: 50vh;
        padding: 48px 16px;
        color: var(--app-text-secondary);
      }
      ion-spinner {
        width: 48px;
        height: 48px;
        color: var(--ion-color-primary);
      }
      .loading-state p {
        margin: 0;
        font-size: 0.95rem;
      }
    `,
  ],
})
export class LoadingStateComponent {
  @Input() message = 'Carregando...';
}
