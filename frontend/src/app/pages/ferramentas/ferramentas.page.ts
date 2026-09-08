import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { Component, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonSegment,
  IonSegmentButton,
  IonText,
  IonTitle,
  IonToggle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { chevronDownOutline, chevronUpOutline } from 'ionicons/icons';

import { formatCurrencyValue, parseCentsInput } from '../../shared/currency-mask';
import {
  calcularJurosCompostos,
  calcularVistaVsPrazo,
  JurosCompostosResultado,
  VistaVsPrazoResultado,
} from './calculators';

type Ferramenta = 'juros-compostos' | 'vista-prazo';

@Component({
  selector: 'app-ferramentas',
  templateUrl: './ferramentas.page.html',
  styleUrls: ['./ferramentas.page.scss'],
  imports: [
    ReactiveFormsModule,
    CurrencyPipe,
    DecimalPipe,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonItem,
    IonInput,
    IonButton,
    IonIcon,
    IonToggle,
    IonText,
  ],
})
export class FerramentasPage {
  readonly tab = signal<Ferramenta>('juros-compostos');

  readonly valorInicialDisplay = signal('');
  readonly aporteDisplay = signal('');
  readonly jurosResultado = signal<JurosCompostosResultado | null>(null);
  readonly jurosErro = signal<string | null>(null);

  readonly valorAVistaDisplay = signal('');
  readonly valorAPrazoDisplay = signal('');
  readonly vistaResultado = signal<VistaVsPrazoResultado | null>(null);
  readonly vistaErro = signal<string | null>(null);
  readonly mostrarTabelaMensal = signal(false);

  readonly jurosForm = this.fb.nonNullable.group({
    valorInicial: this.fb.control<number | null>(0, [Validators.required, Validators.min(0)]),
    taxaAnualPct: this.fb.control<number | null>(null, [Validators.required, Validators.min(0)]),
    aporteMensalInicial: this.fb.control<number | null>(0, [Validators.required, Validators.min(0)]),
    crescimentoAnualAportePct: this.fb.nonNullable.control(0, [Validators.min(0)]),
    anos: this.fb.control<number | null>(null, [Validators.required, Validators.min(1)]),
  });

  readonly vistaForm = this.fb.nonNullable.group({
    valorAVista: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.01)]),
    valorAPrazo: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.01)]),
    numeroParcelas: this.fb.control<number | null>(null, [Validators.required, Validators.min(1)]),
    cdiAnualPct: this.fb.control<number | null>(null, [Validators.required, Validators.min(0)]),
    aliquotaManual: this.fb.nonNullable.control(false),
    aliquotaManualPct: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(100)]),
  });

  constructor(private readonly fb: FormBuilder) {
    addIcons({ chevronDownOutline, chevronUpOutline });
  }

  onTabChange(value: Ferramenta): void {
    this.tab.set(value);
  }

  onValorInicialInput(ev: CustomEvent): void {
    const reais = parseCentsInput(String((ev.detail as { value?: string })?.value ?? ''));
    this.valorInicialDisplay.set(reais === 0 ? '' : formatCurrencyValue(reais));
    this.jurosForm.controls.valorInicial.setValue(reais);
  }

  onAporteInput(ev: CustomEvent): void {
    const reais = parseCentsInput(String((ev.detail as { value?: string })?.value ?? ''));
    this.aporteDisplay.set(reais === 0 ? '' : formatCurrencyValue(reais));
    this.jurosForm.controls.aporteMensalInicial.setValue(reais);
  }

  calcularJuros(): void {
    this.jurosErro.set(null);
    if (this.jurosForm.invalid) {
      this.jurosErro.set('Preencha os campos obrigatórios com valores válidos.');
      this.jurosResultado.set(null);
      return;
    }
    const { valorInicial, taxaAnualPct, aporteMensalInicial, crescimentoAnualAportePct, anos } =
      this.jurosForm.getRawValue();
    this.jurosResultado.set(
      calcularJurosCompostos({
        valorInicial: valorInicial ?? 0,
        taxaAnualPct: taxaAnualPct ?? 0,
        aporteMensalInicial: aporteMensalInicial ?? 0,
        crescimentoAnualAportePct: crescimentoAnualAportePct,
        anos: anos ?? 0,
      }),
    );
  }

  onValorAVistaInput(ev: CustomEvent): void {
    const reais = parseCentsInput(String((ev.detail as { value?: string })?.value ?? ''));
    this.valorAVistaDisplay.set(reais === 0 ? '' : formatCurrencyValue(reais));
    this.vistaForm.controls.valorAVista.setValue(reais);
  }

  onValorAPrazoInput(ev: CustomEvent): void {
    const reais = parseCentsInput(String((ev.detail as { value?: string })?.value ?? ''));
    this.valorAPrazoDisplay.set(reais === 0 ? '' : formatCurrencyValue(reais));
    this.vistaForm.controls.valorAPrazo.setValue(reais);
  }

  toggleAliquotaManual(): void {
    this.vistaForm.controls.aliquotaManual.setValue(!this.vistaForm.controls.aliquotaManual.value);
    if (!this.vistaForm.controls.aliquotaManual.value) {
      this.vistaForm.controls.aliquotaManualPct.setValue(null);
    }
  }

  calcularVista(): void {
    this.vistaErro.set(null);
    const { valorAVista, valorAPrazo, numeroParcelas, cdiAnualPct, aliquotaManual, aliquotaManualPct } =
      this.vistaForm.getRawValue();

    if (this.vistaForm.controls.valorAVista.invalid || this.vistaForm.controls.valorAPrazo.invalid ||
      this.vistaForm.controls.numeroParcelas.invalid || this.vistaForm.controls.cdiAnualPct.invalid) {
      this.vistaErro.set('Preencha os campos obrigatórios com valores válidos.');
      this.vistaResultado.set(null);
      return;
    }
    if (aliquotaManual && (aliquotaManualPct === null || this.vistaForm.controls.aliquotaManualPct.invalid)) {
      this.vistaErro.set('Informe uma alíquota manual entre 0 e 100%, ou desligue o modo manual.');
      this.vistaResultado.set(null);
      return;
    }

    this.mostrarTabelaMensal.set(false);
    this.vistaResultado.set(
      calcularVistaVsPrazo({
        valorAVista: valorAVista ?? 0,
        valorAPrazo: valorAPrazo ?? 0,
        numeroParcelas: Math.round(numeroParcelas ?? 0),
        cdiAnualPct: cdiAnualPct ?? 0,
        aliquotaManualPct: aliquotaManual ? aliquotaManualPct : null,
      }),
    );
  }

  toggleTabelaMensal(): void {
    this.mostrarTabelaMensal.update((v) => !v);
  }
}
