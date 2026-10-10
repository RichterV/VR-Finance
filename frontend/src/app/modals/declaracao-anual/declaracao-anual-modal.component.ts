import { Component, Input, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonSelect,
  IonSelectOption,
  IonText,
  IonTitle,
  IonToggle,
  IonToolbar,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { close } from 'ionicons/icons';
import { firstValueFrom } from 'rxjs';

import { Empresa, EmpresaService } from '../../services/empresa.service';
import { CurrencyInputDirective } from '../../shared/currency-input.directive';
import { DownloadFileService } from '../../shared/download-file.service';
import { httpBlobErrorMessage } from '../../shared/http-error';

/** Ano padrão: o que se declara agora (o anterior), se a empresa já existia nele. */
export function anoPadraoDeclaracao(aberturaAno: number, hoje = new Date()): number {
  return Math.max(hoje.getFullYear() - 1, aberturaAno);
}

/**
 * "Exportar declaração anual": pede o ano (e o que o app não sabe -- empregado e receita sem nota)
 * e baixa o PDF com os campos da DASN-SIMEI, montado no backend a partir das notas do ano.
 */
@Component({
  selector: 'app-declaracao-anual-modal',
  templateUrl: './declaracao-anual-modal.component.html',
  imports: [
    ReactiveFormsModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonIcon,
    IonTitle,
    IonContent,
    IonItem,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonToggle,
    IonText,
    CurrencyInputDirective,
  ],
  styles: [
    `
      .form-hint {
        margin: 4px 4px 12px;
        font-size: var(--fs-xs);
        color: var(--app-text-secondary);
      }
    `,
  ],
})
export class DeclaracaoAnualModalComponent implements OnInit {
  @Input({ required: true }) empresa!: Empresa;

  readonly gerando = signal(false);
  readonly errorMessage = signal<string | null>(null);
  anos: number[] = [];

  readonly form = this.fb.nonNullable.group({
    ano: this.fb.nonNullable.control(new Date().getFullYear()),
    empregado: this.fb.nonNullable.control(false),
    outrasReceitas: this.fb.control<number | null>(null),
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly empresaService: EmpresaService,
    private readonly downloadFileService: DownloadFileService,
    private readonly toastCtrl: ToastController,
    private readonly modalCtrl: ModalController,
  ) {
    addIcons({ close });
  }

  ngOnInit(): void {
    const abertura = Number(this.empresa.data_abertura.slice(0, 4));
    const atual = new Date().getFullYear();
    this.anos = Array.from({ length: atual - abertura + 1 }, (_, i) => atual - i);
    this.form.controls.ano.setValue(anoPadraoDeclaracao(abertura));
  }

  async gerar(): Promise<void> {
    if (this.gerando()) return;
    this.errorMessage.set(null);
    const { ano, empregado, outrasReceitas } = this.form.getRawValue();
    this.gerando.set(true);
    try {
      const blob = await firstValueFrom(
        this.empresaService.declaracaoAnual({ ano, empregado, outrasReceitas: outrasReceitas ?? 0 }),
      );
      await this.downloadFileService.shareFile(blob, `declaracao-anual-mei-${ano}.pdf`);
      const toast = await this.toastCtrl.create({ message: `Declaração de ${ano} gerada.`, duration: 2000, color: 'success' });
      await toast.present();
      await this.modalCtrl.dismiss(null, 'done');
    } catch (err) {
      this.errorMessage.set(await httpBlobErrorMessage(err, 'Erro ao gerar a declaração.'));
    } finally {
      this.gerando.set(false);
    }
  }

  dismiss(): void {
    this.modalCtrl.dismiss(null, 'cancel');
  }
}
