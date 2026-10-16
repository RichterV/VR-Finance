import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { caretDown, caretUp, swapVerticalOutline } from 'ionicons/icons';

import { SortDirection } from './sortable';

/** Clickable <th> that toggles asc/desc sort on a column and shows the current state as an icon. */
@Component({
  selector: 'th[appSortTh]',
  standalone: true,
  imports: [IonIcon],
  template: `
    <ng-content></ng-content>
    <ion-icon [name]="iconName" class="sort-icon" [class.active]="active"></ion-icon>
  `,
  host: {
    class: 'sortable-th',
    '(click)': 'handleClick()',
  },
  styles: [
    `
      :host {
        cursor: pointer;
        user-select: none;
      }
      :host:hover {
        color: var(--app-text-primary);
      }
      .sort-icon {
        margin-inline-start: 4px;
        font-size: 0.8rem;
        vertical-align: -1px;
        color: var(--app-text-secondary);
        opacity: 0.4;
      }
      .sort-icon.active {
        opacity: 1;
        color: var(--ion-color-primary);
      }
    `,
  ],
})
export class SortThComponent {
  @Input('appSortTh') column = '';
  @Input() sortColumn: string | null = null;
  @Input() sortDirection: SortDirection = 'asc';
  @Output() readonly sort = new EventEmitter<string>();

  constructor() {
    addIcons({ caretUp, caretDown, swapVerticalOutline });
  }

  get active(): boolean {
    return this.sortColumn === this.column;
  }

  get iconName(): string {
    if (!this.active) return 'swap-vertical-outline';
    return this.sortDirection === 'asc' ? 'caret-up' : 'caret-down';
  }

  handleClick(): void {
    this.sort.emit(this.column);
  }
}
