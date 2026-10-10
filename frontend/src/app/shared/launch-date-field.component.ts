import { Component, ViewChild, forwardRef, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { IonDatetime, IonDatetimeButton, IonItem, IonLabel, IonPopover } from '@ionic/angular';

import { maxLaunchDateIso, otherMonthLabel, todayIso } from './launch-date';

let nextId = 0;

/**
 * Campo "Data" de Adicionar Gasto/Receita (`formControlName`, valor `AAAA-MM-DD`): começa em
 * hoje e abre um calendário limitado de hoje até o fim do mês seguinte. Quando a data cai em
 * outro mês, avisa em qual mês o lançamento vai contar.
 */
@Component({
  selector: 'app-launch-date-field',
  standalone: true,
  imports: [IonItem, IonLabel, IonDatetime, IonDatetimeButton, IonPopover],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => LaunchDateFieldComponent), multi: true }],
  template: `
    <ion-item>
      <ion-label>Data</ion-label>
      <ion-datetime-button slot="end" [attr.datetime]="datetimeId" [disabled]="disabled()"></ion-datetime-button>
    </ion-item>
    @if (monthHint(); as hint) {
      <p class="launch-date-hint">Vai contar em {{ hint }}</p>
    }
    <ion-popover cssClass="launch-date-popover" [keepContentsMounted]="true">
      <ng-template>
        <ion-datetime
          [id]="datetimeId"
          presentation="date"
          locale="pt-BR"
          [firstDayOfWeek]="0"
          [min]="min"
          [max]="max"
          [value]="value()"
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
      .launch-date-hint {
        margin: -4px 6px 12px;
        font-size: var(--fs-xs);
        color: var(--ion-color-warning);
      }
    `,
  ],
})
export class LaunchDateFieldComponent implements ControlValueAccessor {
  @ViewChild(IonPopover) popover?: IonPopover;

  readonly datetimeId = `launch-date-${nextId++}`;
  readonly min = todayIso();
  readonly max = maxLaunchDateIso();
  readonly value = signal(todayIso());
  readonly disabled = signal(false);

  private onChangeFn: (value: string) => void = () => {};
  private onTouchedFn: () => void = () => {};

  monthHint(): string | null {
    return otherMonthLabel(this.value());
  }

  onChange(raw: string | null): void {
    // Com presentation="date" o Ionic pode devolver só a data ou data+hora, dependendo da versão.
    const iso = (raw ?? todayIso()).slice(0, 10);
    this.value.set(iso);
    this.onChangeFn(iso);
    this.onTouchedFn();
    this.popover?.dismiss();
  }

  writeValue(value: string | null): void {
    this.value.set(value || todayIso());
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChangeFn = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouchedFn = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
}
