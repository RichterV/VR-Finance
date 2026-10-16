import { Component, input } from '@angular/core';

import { ReceiptValueAutofill } from './receipt-value.service';

/** Aviso embaixo do campo Valor: lendo o comprovante / valor preenchido pelo comprovante. */
@Component({
  selector: 'app-receipt-value-hint',
  template: `
    @if (autofill().reading()) {
      <p class="receipt-hint">Lendo o valor do comprovante...</p>
    } @else if (autofill().filled() !== null) {
      <p class="receipt-hint filled">Valor lido do comprovante — confira antes de salvar.</p>
    }
  `,
  styles: [
    `
      .receipt-hint {
        margin: calc(-1 * var(--sp-2)) 0 var(--sp-3);
        padding: 0 var(--sp-1);
        font-size: var(--fs-xs);
        color: var(--app-text-secondary);
      }
      .receipt-hint.filled {
        color: var(--ion-color-primary);
      }
    `,
  ],
})
export class ReceiptValueHintComponent {
  readonly autofill = input.required<ReceiptValueAutofill>();
}
