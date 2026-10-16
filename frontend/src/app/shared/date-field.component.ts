import { Component, Input, ViewChild, forwardRef, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { IonDatetime, IonDatetimeButton, IonIcon, IonItem, IonLabel, IonPopover } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { closeCircle } from 'ionicons/icons';

import { todayIso } from './launch-date';

let nextId = 0;

/**
 * Campo de data genérico (`formControlName`, valor `AAAA-MM-DD`), com faixa `min`/`max` livre.
 * `optional`: começa vazio (null), mostra "Definir" e ganha um "×" pra voltar a vazio -- usado na
 * garantia de Manutenção Casa. Sem `optional`, vazio vira hoje (mesmo jeito do launch-date-field,
 * que continua sendo o campo de data de Gasto/Receita, com a regra própria de faixa e o aviso de mês).
 */
@Component({
  selector: 'app-date-field',
  standalone: true,
  imports: [IonItem, IonLabel, IonDatetime, IonDatetimeButton, IonPopover, IonIcon],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DateFieldComponent), multi: true }],
  template: `
    <ion-item>
      <ion-label>{{ label }}</ion-label>
      @if (value() || !optional) {
        <ion-datetime-button slot="end" [attr.datetime]="datetimeId" [disabled]="disabled()"></ion-datetime-button>
        @if (optional) {
          <button
            slot="end"
            type="button"
            class="clear-btn"
            [attr.aria-label]="'Remover ' + label.toLowerCase()"
            [title]="'Remover ' + label.toLowerCase()"
            (click)="clear()"
          >
            <ion-icon name="close-circle"></ion-icon>
          </button>
        }
      } @else {
        <button slot="end" type="button" class="define-btn" [disabled]="disabled()" (click)="define()">Definir</button>
      }
    </ion-item>
    <ion-popover cssClass="launch-date-popover" [keepContentsMounted]="true">
      <ng-template>
        <ion-datetime
          [id]="datetimeId"
          presentation="date"
          locale="pt-BR"
          [firstDayOfWeek]="0"
          [min]="min"
          [max]="max"
          [value]="value() || initialPick()"
          (ionChange)="onChange($any($event.detail.value))"
        ></ion-datetime>
      </ng-template>
    </ion-popover>
  `,
  styles: [
    `
      ion-datetime-button::part(native) {
        background: var(--app-surface-hover);
        color: var(--ion-color-primary);
        border-radius: var(--r-sm);
      }
      .define-btn {
        background: var(--app-surface-hover);
        color: var(--ion-color-primary);
        border: 0;
        border-radius: var(--r-sm);
        padding: 6px 12px;
        font: inherit;
        font-size: var(--fs-sm);
        cursor: pointer;
      }
      .clear-btn {
        background: none;
        border: 0;
        padding: 4px;
        margin-left: 4px;
        color: var(--app-text-secondary);
        font-size: 1.25rem;
        display: flex;
        cursor: pointer;
      }
    `,
  ],
})
export class DateFieldComponent implements ControlValueAccessor {
  @ViewChild(IonPopover) popover?: IonPopover;

  @Input() label = 'Data';
  @Input() min?: string;
  @Input() max?: string;
  @Input() optional = false;

  readonly datetimeId = `date-field-${nextId++}`;
  readonly value = signal<string | null>(null);
  readonly disabled = signal(false);

  private onChangeFn: (value: string | null) => void = () => {};
  private onTouchedFn: () => void = () => {};

  constructor() {
    addIcons({ closeCircle });
  }

  /** Dia sugerido ao abrir um campo vazio: hoje, puxado pra dentro da faixa. */
  initialPick(): string {
    const today = todayIso();
    if (this.min && today < this.min) return this.min;
    if (this.max && today > this.max) return this.max;
    return today;
  }

  onChange(raw: string | null): void {
    if (!raw) return;
    // Com presentation="date" o Ionic pode devolver só a data ou data+hora, dependendo da versão.
    this.set(raw.slice(0, 10));
    this.popover?.dismiss();
  }

  define(): void {
    this.set(this.initialPick());
  }

  clear(): void {
    this.set(null);
  }

  private set(value: string | null): void {
    this.value.set(value);
    this.onChangeFn(value);
    this.onTouchedFn();
  }

  writeValue(value: string | null): void {
    this.value.set(value || (this.optional ? null : todayIso()));
  }

  registerOnChange(fn: (value: string | null) => void): void {
    this.onChangeFn = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouchedFn = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
}
