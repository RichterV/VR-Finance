import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { IonInput, provideIonicAngular } from '@ionic/angular';

import { CurrencyInputDirective } from './currency-input.directive';

@Component({
  imports: [IonInput, ReactiveFormsModule, CurrencyInputDirective],
  template: `<ion-input [appCurrencyInput]="control"></ion-input>`,
})
class HostComponent {
  readonly control = new FormControl<number | null>(12.5);
}

describe('CurrencyInputDirective', () => {
  function setup() {
    TestBed.configureTestingModule({ providers: [provideIonicAngular()] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('ion-input') as HTMLIonInputElement;
    return { fixture, input, control: fixture.componentInstance.control };
  }

  it('shows the initial value formatted and asks for the numeric keyboard', () => {
    const { input } = setup();
    expect(input.value).toBe('12,50');
    expect(input.getAttribute('inputmode')).toBe('numeric');
  });

  it('reads typed digits as cents and updates the control', () => {
    const { input, control } = setup();
    input.dispatchEvent(new CustomEvent('ionInput', { detail: { value: '1256' } }));
    expect(control.value).toBe(12.56);
    expect(input.value).toBe('12,56');
  });

  it('clears the field when the control is reset', () => {
    const { input, control } = setup();
    control.reset(null);
    expect(input.value).toBe('');
  });
});
