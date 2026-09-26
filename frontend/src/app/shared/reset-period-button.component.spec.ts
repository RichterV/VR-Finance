import { TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular';

import { ResetPeriodButtonComponent } from './reset-period-button.component';

function setup(disabled: boolean) {
  TestBed.configureTestingModule({ providers: [provideIonicAngular()] });
  const fixture = TestBed.createComponent(ResetPeriodButtonComponent);
  fixture.componentInstance.disabled = disabled;
  fixture.detectChanges();
  const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
  return { fixture, button };
}

describe('ResetPeriodButtonComponent', () => {
  it('emits reset when clicked', () => {
    const { fixture, button } = setup(false);
    const spy = vi.fn();
    fixture.componentInstance.reset.subscribe(spy);
    button.click();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('is disabled and does not emit when the period is already at its default', () => {
    const { fixture, button } = setup(true);
    const spy = vi.fn();
    fixture.componentInstance.reset.subscribe(spy);
    expect(button.disabled).toBe(true);
    button.click();
    expect(spy).not.toHaveBeenCalled();
  });
});
