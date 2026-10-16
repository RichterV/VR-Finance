import { Component, Input, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonSelect,
  IonSelectOption,
  IonText,
  IonTitle,
  IonToolbar,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { close } from 'ionicons/icons';
import { firstValueFrom } from 'rxjs';

import { RelatoriosService } from '../../services/relatorios.service';
import { DownloadFileService } from '../../shared/download-file.service';
import { httpBlobErrorMessage } from '../../shared/http-error';

/** Ano sugerido: o pedido (vindo da notificação), senão o ano passado se tiver dados, senão o mais recente. */
export function anoPadraoRelatorio(anos: number[], pedido: number | null, hoje = new Date()): number {
  if (pedido != null) return pedido;
  const passado = hoje.getFullYear() - 1;
  return anos.includes(passado) ? passado : (anos[0] ?? hoje.getFullYear());
}

/**
 * Relatório anual de receitas e gastos: pede o ano e baixa o PDF (gráficos, categorias, parcelas,
 * contas fixas, receitas...). Ano em andamento sai parcial, até hoje.
 */
@Component({
  selector: 'app-relatorio-anual-modal',
  templateUrl: './relatorio-anual-modal.component.html',
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
    IonSelect,
    IonSelectOption,
    IonText,
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
export class RelatorioAnualModalComponent implements OnInit {
  /** Ano já escolhido (ex: aberto pela notificação de virada do ano). */
  @Input() ano: number | null = null;

  readonly anos = signal<number[]>([new Date().getFullYear()]);
  readonly gerando = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly anoAtual = new Date().getFullYear();

  readonly form = this.fb.nonNullable.group({ ano: this.fb.nonNullable.control(new Date().getFullYear()) });
  readonly anoSelecionado = toSignal(this.form.controls.ano.valueChanges, { initialValue: this.form.controls.ano.value });

  constructor(
    private readonly fb: FormBuilder,
    private readonly relatorios: RelatoriosService,
    private readonly downloadFileService: DownloadFileService,
    private readonly toastCtrl: ToastController,
    private readonly modalCtrl: ModalController,
  ) {
    addIcons({ close });
  }

  ngOnInit(): void {
    if (this.ano != null) this.form.controls.ano.setValue(this.ano);
    this.relatorios.anosRelatorioAnual().subscribe({
      next: (anos) => {
        const lista = this.ano != null && !anos.includes(this.ano) ? [...anos, this.ano].sort((a, b) => b - a) : anos;
        this.anos.set(lista);
        this.form.controls.ano.setValue(anoPadraoRelatorio(lista, this.ano));
      },
      error: () => undefined, // sem a lista, fica o ano atual
    });
  }

  async gerar(): Promise<void> {
    if (this.gerando()) return;
    this.errorMessage.set(null);
    const { ano } = this.form.getRawValue();
    this.gerando.set(true);
    try {
      const blob = await firstValueFrom(this.relatorios.relatorioAnual(ano));
      await this.downloadFileService.shareFile(blob, `relatorio-anual-${ano}.pdf`);
      const toast = await this.toastCtrl.create({ message: `Relatório de ${ano} gerado.`, duration: 2000, color: 'success' });
      await toast.present();
      await this.modalCtrl.dismiss(null, 'done');
    } catch (err) {
      this.errorMessage.set(await httpBlobErrorMessage(err, 'Erro ao gerar o relatório.'));
    } finally {
      this.gerando.set(false);
    }
  }

  dismiss(): void {
    this.modalCtrl.dismiss(null, 'cancel');
  }
}
