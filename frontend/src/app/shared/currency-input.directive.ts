import { Directive, ElementRef, effect, inject, input } from '@angular/core';
import { AbstractControl } from '@angular/forms';

import { formatCurrencyValue, parseCentsInput } from './currency-mask';

/**
 * Campo de valor em dinheiro (R$/US$): máscara de centavos da direita pra esquerda ("100" -> 1,00)
 * e teclado numérico no celular. Uso: `<ion-input [appCurrencyInput]="form.controls.value">`.
 *
 * Recebe o FormControl em vez de ser um ControlValueAccessor porque o ion-input já tem o próprio
 * value accessor -- dois no mesmo elemento dariam conflito. O controle guarda o número (0 = vazio);
 * qualquer mudança nele (reset, patchValue de um modal de edição) reaparece formatada no campo.
 */
@Directive({
  selector: 'ion-input[appCurrencyInput]',
  host: {
    inputmode: 'numeric',
    '(ionInput)': 'onInput($event)',
  },
})
export class CurrencyInputDirective {
  readonly control = input.required<AbstractControl<number | null>>({ alias: 'appCurrencyInput' });

  private readonly el = inject(ElementRef<HTMLIonInputElement>).nativeElement as HTMLIonInputElement;

  constructor() {
    effect((onCleanup) => {
      const control = this.control();
      this.render(control.value);
      const subscription = control.valueChanges.subscribe((value) => this.render(value));
      onCleanup(() => subscription.unsubscribe());
    });
  }

  onInput(event: Event): void {
    const raw = String((event as CustomEvent<{ value?: string | null }>).detail?.value ?? '');
    const value = parseCentsInput(raw);
    this.control().setValue(value);
    this.render(value);
  }

  private render(value: number | null | undefined): void {
    const text = value ? formatCurrencyValue(value) : '';
    if (this.el.value !== text) this.el.value = text;
  }
}
