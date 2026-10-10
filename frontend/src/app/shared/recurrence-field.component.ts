import { Component, computed, effect, input, signal, untracked } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { IonItem, IonSelect, IonSelectOption, IonToggle } from '@ionic/angular';
import { startWith } from 'rxjs';

import { MESES_COMPLETOS } from './months';
import {
  RECURRENCE_DAYS,
  dayOfIso,
  defaultEndMonthIso,
  formatIsoBr,
  isEndMonthValid,
  monthIso,
  nextOccurrenceIso,
  occurrenceDate,
  totalOccurrences,
} from './recurrence';
import { toIsoDate } from './launch-date';

/**
 * "Repetir todo mês" de Adicionar gasto/receita: toggle + dia do mês (1 a 31) + data de término
 * opcional (último mês, inclusive; sem ela repete sem fim). O lançamento salvo é o 1º; a recorrência
 * cria os próximos na virada de cada mês. Ao ligar, o dia vem da data escolhida.
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

      <ion-item>
        <ion-toggle [checked]="temFim()" (ionChange)="toggleFim($event.detail.checked)">Tem data de término</ion-toggle>
      </ion-item>
      @if (temFim()) {
        <div class="field-row">
          <ion-item class="col-grow">
            <ion-select
              label="Último mês"
              labelPlacement="stacked"
              [value]="fimMes()"
              (ionChange)="setFim(fimAno(), $any($event.detail.value))"
              interface="popover"
              [interfaceOptions]="{ size: 'auto' }"
            >
              @for (m of meses; track $index) {
                <ion-select-option [value]="$index + 1">{{ m }}</ion-select-option>
              }
            </ion-select>
          </ion-item>
          <ion-item class="col-grow">
            <ion-select
              label="Ano"
              labelPlacement="stacked"
              [value]="fimAno()"
              (ionChange)="setFim($any($event.detail.value), fimMes())"
              interface="popover"
            >
              @for (a of anos(); track a) {
                <ion-select-option [value]="a">{{ a }}</ion-select-option>
              }
            </ion-select>
          </ion-item>
        </div>
      }

      <p class="recurrence-hint">
        @if (fimInvalido()) {
          <span class="erro">O último mês precisa ser depois do mês do lançamento.</span>
        } @else if (resumoFim(); as resumo) {
          {{ resumo }}
        } @else if (nextLabel(); as next) {
          Próximo lançamento em {{ next }}, depois todo mês, sem data pra acabar.
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
        font-size: var(--fs-xs);
        color: var(--app-text-secondary);
      }

      .erro {
        color: var(--ion-color-danger);
      }
    `,
  ],
})
export class RecurrenceFieldComponent {
  readonly enabled = input.required<FormControl<boolean>>();
  readonly day = input.required<FormControl<number | null>>();
  /** Último mês (`AAAA-MM-01`) ou null = sem fim. */
  readonly end = input.required<FormControl<string | null>>();
  /** Data do lançamento (`AAAA-MM-DD`) -- define o dia padrão, o próximo lançamento e o fim padrão. */
  readonly launchDate = input.required<string>();

  readonly days = RECURRENCE_DAYS;
  readonly meses = MESES_COMPLETOS;
  readonly isOn = signal(false);
  readonly dayValue = signal<number | null>(null);
  readonly fimIso = signal<string | null>(null);

  readonly temFim = computed(() => this.fimIso() !== null);
  readonly fimAno = computed(() => Number(this.fimIso()?.slice(0, 4) ?? 0));
  readonly fimMes = computed(() => Number(this.fimIso()?.slice(5, 7) ?? 0));
  readonly anos = computed(() => {
    const inicio = Number(this.launchDate().slice(0, 4)) || new Date().getFullYear();
    return Array.from({ length: 6 }, (_, i) => inicio + i);
  });
  readonly fimInvalido = computed(() => {
    const fim = this.fimIso();
    return fim !== null && !isEndMonthValid(this.launchDate(), fim);
  });

  readonly nextLabel = computed(() => {
    const day = this.dayValue();
    return day ? formatIsoBr(nextOccurrenceIso(this.launchDate(), day)) : null;
  });

  /** "12 lançamentos no total; o último em 15/09/2027." */
  readonly resumoFim = computed(() => {
    const fim = this.fimIso();
    const day = this.dayValue();
    if (!fim || !day) return null;
    const total = totalOccurrences(this.launchDate(), fim);
    const ultimo = formatIsoBr(toIsoDate(occurrenceDate(this.fimAno(), this.fimMes(), day)));
    return `${total} lançamentos no total (este e os próximos); o último em ${ultimo}.`;
  });

  constructor() {
    // Acompanha os controles do modal (o resetForm dele também passa por aqui).
    effect((onCleanup) => {
      const enabled = this.enabled();
      const day = this.day();
      const end = this.end();
      untracked(() => {
        const subs = [
          enabled.valueChanges.pipe(startWith(enabled.value)).subscribe((on) => {
            this.isOn.set(on);
            if (on && !day.value) day.setValue(dayOfIso(this.launchDate()));
          }),
          day.valueChanges.pipe(startWith(day.value)).subscribe((d) => this.dayValue.set(d)),
          end.valueChanges.pipe(startWith(end.value)).subscribe((fim) => this.fimIso.set(fim)),
        ];
        onCleanup(() => subs.forEach((s) => s.unsubscribe()));
      });
    });
  }

  toggleFim(on: boolean): void {
    this.end().setValue(on ? defaultEndMonthIso(this.launchDate()) : null);
  }

  setFim(ano: number, mes: number): void {
    if (ano && mes) this.end().setValue(monthIso(ano, mes));
  }
}
