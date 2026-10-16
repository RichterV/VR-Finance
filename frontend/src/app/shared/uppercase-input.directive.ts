import { DestroyRef, Directive, ElementRef, OnInit, inject } from '@angular/core';
import { NgControl } from '@angular/forms';

/**
 * Campo que só faz sentido em maiúsculas (ticker): converte enquanto digita e abre o teclado do
 * celular já em maiúsculas. Uso: `<ion-input appUppercase formControlName="ticker">`.
 *
 * Corrige pelo valueChanges do controle (depois que o value accessor do ion-input gravou o texto),
 * em vez de competir com ele no ionInput. Sem controle (ex: filtro com [value]), só ajusta o campo.
 */
@Directive({
  selector: 'ion-input[appUppercase]',
  host: {
    autocapitalize: 'characters',
    '(ionInput)': 'onInput()',
  },
})
export class UppercaseInputDirective implements OnInit {
  private readonly el = inject(ElementRef<HTMLIonInputElement>).nativeElement as HTMLIonInputElement;
  private readonly ngControl = inject(NgControl, { optional: true, self: true });
  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    const control = this.ngControl?.control;
    if (!control) return;
    const subscription = control.valueChanges.subscribe((value: unknown) => {
      if (typeof value !== 'string') return;
      const upper = value.toUpperCase();
      if (upper !== value) control.setValue(upper, { emitEvent: false });
      this.render(upper);
    });
    this.destroyRef.onDestroy(() => subscription.unsubscribe());
  }

  onInput(): void {
    if (typeof this.el.value === 'string') this.render(this.el.value.toUpperCase());
  }

  private render(text: string): void {
    if (this.el.value !== text) this.el.value = text;
  }
}
