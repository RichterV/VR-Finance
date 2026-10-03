import { Component, computed, effect, input, signal, untracked } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { IonItem, IonSelect, IonSelectOption, IonToggle } from '@ionic/angular';
import { startWith } from 'rxjs';

import { RECURRENCE_DAYS, dayOfIso, formatIsoBr, nextOccurrenceIso } from './recurrence';

/**
 * "Repetir todo mês" de Adicionar gasto/receita: toggle + dia do mês (1 a 31). O lançamento salvo é
 * o 1º; a recorrência cria os próximos na virada de cada mês. Ao ligar, o dia vem da data escolhida.
 */
@Component({
  selector: 'app-recurrence-field',
  standalone: true,
  imports: [ReactiveFormsModule, IonItem, IonToggle, IonSelect, IonSelectOption],
  template: `
    <ion-item>
      <ion-toggle [formControl]="enabled()">Repetir todo mês</ion-toggle>
    </ion-item>
    @if (isOn()) {
      <ion-item>
        <ion-select
          label="Dia do mês"
          [formControl]="day()"
          interface="popover"
          [interfaceOptions]="{ size: 'auto' }"
        >
          @for (d of days; track d) {
            <ion-select-option [value]="d">Dia {{ d }}</ion-select-option>
          }
        </ion-select>
      </ion-item>
      <p class="recurrence-hint">
        @if (nextLabel(); as next) {
          Próximo lançamento em {{ next }}, depois todo mês.
        }
        @if (dayValue() && dayValue()! > 28) {
          Em meses sem o dia {{ dayValue() }}, cai no último dia do mês.
        }
        Dá pra editar, pausar ou excluir em Visualizar dados → Recorrências.
      </p>
    }
  `,
  styles: [
    `
      .recurrence-hint {
        margin: 4px 4px 12px;
        font-size: 0.8rem;
        color: var(--app-text-secondary);
      }
    `,
  ],
})
export class RecurrenceFieldComponent {
  readonly enabled = input.required<FormControl<boolean>>();
  readonly day = input.required<FormControl<number | null>>();
  /** Data do lançamento (`AAAA-MM-DD`) -- define o dia padrão e o próximo lançamento. */
  readonly launchDate = input.required<string>();

  readonly days = RECURRENCE_DAYS;
  readonly isOn = signal(false);
  readonly dayValue = signal<number | null>(null);

  readonly nextLabel = computed(() => {
    const day = this.dayValue();
    return day ? formatIsoBr(nextOccurrenceIso(this.launchDate(), day)) : null;
  });

  constructor() {
    // Acompanha os dois controles (resetForm do modal também passa por aqui).
    effect((onCleanup) => {
      const enabled = this.enabled();
      const day = this.day();
      untracked(() => {
        const subs = [
          enabled.valueChanges.pipe(startWith(enabled.value)).subscribe((on) => {
            this.isOn.set(on);
            if (on && !day.value) day.setValue(dayOfIso(this.launchDate()));
          }),
          day.valueChanges.pipe(startWith(day.value)).subscribe((d) => this.dayValue.set(d)),
        ];
        onCleanup(() => subs.forEach((s) => s.unsubscribe()));
      });
    });
  }
}
