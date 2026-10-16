import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular';

import { FerramentasPage } from './ferramentas.page';

describe('FerramentasPage', () => {
  let component: FerramentasPage;
  let fixture: ComponentFixture<FerramentasPage>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideIonicAngular()] });
    fixture = TestBed.createComponent(FerramentasPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('starts on the juros compostos tab with no result', () => {
    expect(component.tab()).toBe('juros-compostos');
    expect(component.jurosResultado()).toBeNull();
  });

  it('onTabChange switches to vista-prazo', () => {
    component.onTabChange('vista-prazo');
    expect(component.tab()).toBe('vista-prazo');
  });

  it('calcularJuros() refuses to compute with missing required fields', () => {
    component.calcularJuros();
    expect(component.jurosResultado()).toBeNull();
    expect(component.jurosErro()).toContain('obrigatórios');
  });

  it('calcularJuros() computes a result once the form is valid', () => {
    component.jurosForm.setValue({
      valorInicial: 1000,
      taxaAnualPct: 12,
      aporteMensalInicial: 100,
      crescimentoAnualAportePct: 0,
      anos: 1,
    });

    component.calcularJuros();

    expect(component.jurosErro()).toBeNull();
    expect(component.jurosResultado()).not.toBeNull();
    expect(component.jurosResultado()!.totalInvestido).toBeCloseTo(2200, 6);
  });

  it('onValorInicialInput parses the masked currency input into the form control', () => {
    component.onValorInicialInput({ detail: { value: '150000' } } as unknown as CustomEvent);

    expect(component.jurosForm.controls.valorInicial.value).toBeCloseTo(1500, 6);
    expect(component.valorInicialDisplay()).toBe('1.500,00');
  });

  it('calcularVista() refuses to compute with missing required fields', () => {
    component.calcularVista();
    expect(component.vistaResultado()).toBeNull();
    expect(component.vistaErro()).toContain('obrigatórios');
  });

  it('calcularVista() requires a valid manual alíquota when the toggle is on', () => {
    component.vistaForm.setValue({
      valorAVista: 1000,
      valorAPrazo: 1100,
      numeroParcelas: 2,
      cdiAnualPct: 12,
      aliquotaManual: true,
      aliquotaManualPct: null,
    });

    component.calcularVista();

    expect(component.vistaResultado()).toBeNull();
    expect(component.vistaErro()).toContain('alíquota manual');
  });

  it('calcularVista() computes a result once the form is valid, using the automatic rate by default', () => {
    component.vistaForm.setValue({
      valorAVista: 1000,
      valorAPrazo: 1100,
      numeroParcelas: 6,
      cdiAnualPct: 12,
      aliquotaManual: false,
      aliquotaManualPct: null,
    });

    component.calcularVista();

    expect(component.vistaErro()).toBeNull();
    expect(component.vistaResultado()).not.toBeNull();
    expect(component.vistaResultado()!.aliquotaIrPct).toBe(22.5);
  });

  it('toggleAliquotaManual() flips the flag and clears the manual value when turning it off', () => {
    component.vistaForm.controls.aliquotaManual.setValue(true);
    component.vistaForm.controls.aliquotaManualPct.setValue(18);

    component.toggleAliquotaManual();

    expect(component.vistaForm.controls.aliquotaManual.value).toBe(false);
    expect(component.vistaForm.controls.aliquotaManualPct.value).toBeNull();
  });

  it('toggleTabelaMensal() flips the monthly table visibility', () => {
    expect(component.mostrarTabelaMensal()).toBe(false);
    component.toggleTabelaMensal();
    expect(component.mostrarTabelaMensal()).toBe(true);
  });
});
