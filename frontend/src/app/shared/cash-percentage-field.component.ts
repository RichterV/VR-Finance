import { Component, forwardRef, signal } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { IonIcon, IonRange } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { addOutline, removeOutline } from 'ionicons/icons';

/** Valores de toque rápido — os percentuais de caixa mais comuns. */
export const CASH_PERCENTAGE_PRESETS = [0, 10, 20, 30, 50] as const;

/** Arredonda e limita a 0–100; texto vazio ou inválido devolve null. */
export function parseCashPercentage(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/**
 * "% para caixa" de Adicionar/Editar Receita e Editar Recorrência (`formControlName`, 0–100).
 * O slider sozinho era difícil de acertar num valor exato (1% ≈ 3px no celular), então ele anda
 * de 5 em 5 e o ajuste fino fica nos botões −/+ (1 em 1), no campo digitável e nos atalhos.
 */
@Component({
  selector: 'app-cash-percentage-field',
  standalone: true,
  imports: [IonRange, IonIcon],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CashPercentageFieldComponent), multi: true }],
  template: `
    <div class="cash-card-row cash-pct-head">
      <label class="cash-card-label" [for]="inputId">% para caixa:</label>
      <span class="cash-pct-input-wrap">
        <input
          [id]="inputId"
          class="cash-pct-input"
          type="text"
          inputmode="numeric"
          maxlength="3"
          [value]="value()"
          [disabled]="disabled()"
          (input)="onTyped($any($event.target))"
          (blur)="onTypedBlur($any($event.target))"
          (keydown.enter)="$any($event.target).blur(); $event.preventDefault()"
        />%
      </span>
    </div>
    <div class="cash-pct-slider">
      <button
        type="button"
        class="cash-pct-step"
        aria-label="Diminuir 1%"
        title="Diminuir 1%"
        [disabled]="disabled() || value() <= 0"
        (click)="set(value() - 1)"
      >
        <ion-icon name="remove-outline"></ion-icon>
      </button>
      <ion-range
        aria-label="Percentual para caixa"
        [min]="0"
        [max]="100"
        [step]="5"
        [ticks]="true"
        [snaps]="true"
        [pin]="true"
        [value]="value()"
        [disabled]="disabled()"
        (ionInput)="set($any($event.detail.value))"
        (ionBlur)="onTouched()"
      ></ion-range>
      <button
        type="button"
        class="cash-pct-step"
        aria-label="Aumentar 1%"
        title="Aumentar 1%"
        [disabled]="disabled() || value() >= 100"
        (click)="set(value() + 1)"
      >
        <ion-icon name="add-outline"></ion-icon>
      </button>
    </div>
    <div class="cash-pct-presets">
      @for (p of presets; track p) {
        <button
          type="button"
          class="cash-pct-preset"
          [class.active]="value() === p"
          [disabled]="disabled()"
          (click)="set(p)"
        >
          {{ p }}%
        </button>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .cash-pct-head {
        align-items: center;
      }
      .cash-pct-input-wrap {
        display: inline-flex;
        align-items: center;
        gap: 2px;
        font-weight: 600;
        color: var(--app-text-primary);
      }
      .cash-pct-input {
        width: 3.2em;
        height: 32px;
        padding: 0 6px;
        text-align: right;
        font: inherit;
        color: inherit;
        background: var(--app-surface);
        border: 1px solid var(--app-field-border);
        border-radius: var(--r-sm);
      }
      .cash-pct-input:focus {
        outline: none;
        border-color: var(--ion-color-primary);
      }
      .cash-pct-slider {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      ion-range {
        flex: 1;
        --knob-size: 26px;
        padding-inline: 8px;
      }
      .cash-pct-step {
        flex: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        font-size: 1.1rem;
        color: var(--ion-color-primary);
        background: var(--app-surface-hover);
        border: none;
        border-radius: var(--r-pill);
        cursor: pointer;
      }
      .cash-pct-step:disabled {
        opacity: 0.4;
        cursor: default;
      }
      .cash-pct-presets {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin: 2px 0 8px;
      }
      .cash-pct-preset {
        font: inherit;
        font-size: var(--fs-xs);
        min-height: 28px;
        padding: 2px 12px;
        color: var(--app-text-secondary);
        background: transparent;
        border: 1px solid var(--app-surface-border);
        border-radius: var(--r-pill);
        cursor: pointer;
      }
      .cash-pct-preset.active {
        color: var(--ion-color-primary);
        border-color: var(--ion-color-primary);
        background: var(--app-tint-positive);
        font-weight: 600;
      }
    `,
  ],
})
export class CashPercentageFieldComponent implements ControlValueAccessor {
  private static nextId = 0;
  readonly inputId = `cash-pct-${CashPercentageFieldComponent.nextId++}`;
  readonly presets = CASH_PERCENTAGE_PRESETS;
  readonly value = signal(0);
  readonly disabled = signal(false);

  private onChange: (v: number) => void = () => {};
  onTouched: () => void = () => {};

  constructor() {
    addIcons({ addOutline, removeOutline });
  }

  set(raw: number | string | null): void {
    const v = parseCashPercentage(raw);
    if (v === null || v === this.value()) return;
    this.value.set(v);
    this.onChange(v);
  }

  onTyped(input: HTMLInputElement): void {
    const digits = input.value.replace(/\D/g, '');
    if (digits !== input.value) input.value = digits;
    // Vazio enquanto digita: espera o blur pra não pular pra 0 no meio da edição.
    if (digits !== '') this.set(digits);
    if (Number(digits) > 100) input.value = String(this.value());
  }

  onTypedBlur(input: HTMLInputElement): void {
    input.value = String(this.value());
    this.onTouched();
  }

  writeValue(v: number | null): void {
    this.value.set(parseCashPercentage(v) ?? 0);
  }

  registerOnChange(fn: (v: number) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }
}
