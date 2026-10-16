import { TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular';

import { CashPercentageFieldComponent, parseCashPercentage } from './cash-percentage-field.component';

describe('parseCashPercentage', () => {
  it('arredonda e limita a 0–100', () => {
    expect(parseCashPercentage('37')).toBe(37);
    expect(parseCashPercentage('12,6')).toBe(13);
    expect(parseCashPercentage(150)).toBe(100);
    expect(parseCashPercentage(-3)).toBe(0);
  });

  it('devolve null pra vazio ou inválido', () => {
    expect(parseCashPercentage('')).toBeNull();
    expect(parseCashPercentage('abc')).toBeNull();
    expect(parseCashPercentage(null)).toBeNull();
  });
});

describe('CashPercentageFieldComponent', () => {
  function create() {
    TestBed.configureTestingModule({ imports: [CashPercentageFieldComponent], providers: [provideIonicAngular()] });
    const fixture = TestBed.createComponent(CashPercentageFieldComponent);
    const changes: number[] = [];
    fixture.componentInstance.registerOnChange((v) => changes.push(v));
    fixture.componentInstance.writeValue(50);
    fixture.detectChanges();
    return { fixture, cmp: fixture.componentInstance, changes };
  }

  it('botões −/+ andam de 1 em 1', () => {
    const { fixture, cmp, changes } = create();
    const [minus, plus] = fixture.nativeElement.querySelectorAll('.cash-pct-step') as NodeListOf<HTMLButtonElement>;
    plus.click();
    plus.click();
    minus.click();
    expect(cmp.value()).toBe(51);
    expect(changes).toEqual([51, 52, 51]);
  });

  it('atalho define o valor e fica marcado', () => {
    const { fixture, cmp } = create();
    const preset = [...fixture.nativeElement.querySelectorAll('.cash-pct-preset')].find(
      (b: HTMLButtonElement) => b.textContent?.trim() === '20%',
    ) as HTMLButtonElement;
    preset.click();
    fixture.detectChanges();
    expect(cmp.value()).toBe(20);
    expect(preset.classList).toContain('active');
  });

  it('campo digitável aceita valor exato e corrige acima de 100', () => {
    const { fixture, cmp } = create();
    const input = fixture.nativeElement.querySelector('.cash-pct-input') as HTMLInputElement;
    input.value = '37';
    input.dispatchEvent(new Event('input'));
    expect(cmp.value()).toBe(37);
    input.value = '250';
    input.dispatchEvent(new Event('input'));
    expect(cmp.value()).toBe(100);
    input.dispatchEvent(new Event('blur'));
    expect(input.value).toBe('100');
  });
});
