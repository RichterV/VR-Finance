import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { IonInput, provideIonicAngular } from '@ionic/angular';

import { UppercaseInputDirective } from './uppercase-input.directive';

@Component({
  imports: [IonInput, ReactiveFormsModule, UppercaseInputDirective],
  template: `<ion-input appUppercase [formControl]="control"></ion-input>`,
})
class HostComponent {
  readonly control = new FormControl<string>('');
}

describe('UppercaseInputDirective', () => {
  function setup() {
    TestBed.configureTestingModule({ providers: [provideIonicAngular()] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('ion-input') as HTMLIonInputElement;
    return { input, control: fixture.componentInstance.control };
  }

  it('asks the mobile keyboard for capital letters', () => {
    const { input } = setup();
    expect(input.getAttribute('autocapitalize')).toBe('characters');
  });

  it('stores and shows the typed text in uppercase', () => {
    const { input, control } = setup();
    input.value = 'bbas3f';
    input.dispatchEvent(new CustomEvent('ionInput', { detail: { value: 'bbas3f' } }));
    expect(control.value).toBe('BBAS3F');
    expect(input.value).toBe('BBAS3F');
  });

  it('uppercases values set from code (patchValue of the edit modal)', () => {
    const { input, control } = setup();
    control.setValue('ivvb11');
    expect(control.value).toBe('IVVB11');
    expect(input.value).toBe('IVVB11');
  });
});
