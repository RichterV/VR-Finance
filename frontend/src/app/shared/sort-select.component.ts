import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IonSelect, IonSelectOption } from '@ionic/angular';

import { SortOption, SortState, sortKeyToState, sortStateToKey } from './sortable';

/**
 * Seletor "Ordenar por" das listas em cartões do celular, onde não há cabeçalho de coluna
 * clicável (`th[appSortTh]`). Lê e escreve o mesmo SortState da tabela, então trocar de
 * ordenação num dos dois reflete no outro. Só aparece abaixo de 768px (regra em global.scss).
 * Uma ordenação feita pela tabela sem opção equivalente aqui só deixa o seletor sem item marcado.
 */
@Component({
  selector: 'app-sort-select',
  standalone: true,
  imports: [IonSelect, IonSelectOption],
  template: `
    <ion-select
      [value]="key"
      (ionChange)="onChange($any($event.detail.value))"
      interface="popover"
      fill="outline"
      label="Ordenar por"
      labelPlacement="floating"
    >
      @for (opt of options; track opt.value) {
        <ion-select-option [value]="opt.value">{{ opt.label }}</ion-select-option>
      }
    </ion-select>
  `,
  styles: [
    `
      ion-select {
        border-radius: 8px;
      }
    `,
  ],
})
export class SortSelectComponent {
  @Input({ required: true }) options: readonly SortOption[] = [];
  @Input({ required: true }) state!: SortState;
  @Output() readonly stateChange = new EventEmitter<SortState>();

  get key(): string {
    return sortStateToKey(this.state);
  }

  onChange(key: string): void {
    this.stateChange.emit(sortKeyToState(key));
  }
}
