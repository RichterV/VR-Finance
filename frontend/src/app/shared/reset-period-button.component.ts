import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { refreshOutline } from 'ionicons/icons';

/**
 * Botão de ícone (setas circulares) posicionado à esquerda dos seletores de mês/ano, que volta
 * esses campos pro valor padrão da tela -- "sem filtro" nas listagens, mês/ano atual na Home.
 * Fica sempre visível (não desloca o layout) e desabilitado quando a data já está no padrão.
 * Só mexe em mês/ano, nunca nos outros filtros da tela (busca, status etc.).
 */
@Component({
  selector: 'app-reset-period-button',
  standalone: true,
  imports: [IonIcon],
  template: `
    <button
      type="button"
      class="icon-btn highlight reset-period-btn"
      [disabled]="disabled"
      title="Voltar mês/ano ao padrão"
      aria-label="Voltar mês/ano ao padrão"
      (click)="reset.emit()"
    >
      <ion-icon name="refresh-outline"></ion-icon>
    </button>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        flex: 0 0 auto;
      }
      .reset-period-btn:disabled {
        opacity: 0.35;
        cursor: default;
        background: transparent;
        color: var(--app-text-secondary);
      }
    `,
  ],
})
export class ResetPeriodButtonComponent {
  @Input() disabled = false;
  @Output() readonly reset = new EventEmitter<void>();

  constructor() {
    addIcons({ refreshOutline });
  }
}
