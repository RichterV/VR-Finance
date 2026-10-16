import { AfterViewInit, Directive, ElementRef, OnDestroy, inject } from '@angular/core';

/**
 * Foca o ion-input assim que o modal termina de abrir (ionModalDidPresent) -- antes disso o foco
 * não "pega" (o modal ainda está animando). Fora de modal, foca no próximo ciclo.
 */
@Directive({ selector: 'ion-input[appAutofocus]' })
export class AutofocusDirective implements AfterViewInit, OnDestroy {
  private readonly el = inject(ElementRef<HTMLIonInputElement>).nativeElement as HTMLIonInputElement;
  private modal: HTMLElement | null = null;
  private readonly focus = () => void this.el.setFocus?.();

  ngAfterViewInit(): void {
    this.modal = this.el.closest('ion-modal');
    if (this.modal) {
      this.modal.addEventListener('ionModalDidPresent', this.focus, { once: true });
    } else {
      setTimeout(this.focus);
    }
  }

  ngOnDestroy(): void {
    this.modal?.removeEventListener('ionModalDidPresent', this.focus);
  }
}
