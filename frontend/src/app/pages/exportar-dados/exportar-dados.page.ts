import { Component, computed, signal } from '@angular/core';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { downloadOutline } from 'ionicons/icons';

import { AuthService } from '../../core/auth.service';
import { ModuleKey } from '../../core/modules';
import { extractHttpErrorMessage } from '../../shared/attachment-types';
import { DownloadFileService } from '../../shared/download-file.service';
import { ExportModulo, ExportService } from '../../services/export.service';

interface ModuloExport {
  chave: ExportModulo;
  label: string;
  descricao: string;
  /** Módulo opcional que precisa estar habilitado; ausente = do Início, sempre disponível. */
  requer?: ModuleKey;
}

const MODULOS: ModuloExport[] = [
  { chave: 'gastos', label: 'Gastos', descricao: 'Todos os gastos lançados, com os comprovantes anexados.' },
  { chave: 'receitas', label: 'Receitas', descricao: 'Todas as receitas lançadas, com os comprovantes anexados.' },
  {
    chave: 'veiculos',
    requer: 'veiculos',
    label: 'Manutenção Veículos',
    descricao: 'Veículos cadastrados e serviços de manutenção, com os comprovantes anexados aos serviços.',
  },
  {
    chave: 'operacoes_bolsa',
    requer: 'operacoes_bolsa',
    label: 'Operações Bolsa',
    descricao: 'Operações na bolsa de valores, com os comprovantes anexados.',
  },
  {
    chave: 'devedores',
    requer: 'devedores',
    label: 'Devedores',
    descricao: 'Parcelas de dívidas de terceiros, com os comprovantes anexados.',
  },
  {
    chave: 'empresa',
    requer: 'empresa',
    label: 'Empresa',
    descricao: 'Dados da empresa, notas fiscais (com XML e PDF) e os documentos da empresa.',
  },
  {
    chave: 'categorias',
    label: 'Categorias',
    descricao: 'Categorias cadastradas (essenciais e não essenciais), ativas e inativas.',
  },
];

/**
 * Página de exportação de dados -- um zip por módulo (CSV com ; e encoding latin-1, pra abrir
 * direto no Excel-BR, + pasta anexos/ com os comprovantes vinculados aos registros daquele
 * módulo). Sempre por usuário -- o backend nunca aceita um user_id do cliente, só o do token.
 */
@Component({
  selector: 'app-exportar-dados',
  templateUrl: './exportar-dados.page.html',
  styleUrls: ['./exportar-dados.page.scss'],
  imports: [IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonButton, IonIcon, IonSpinner],
})
export class ExportarDadosPage {
  /** Só os módulos que o usuário tem habilitados (o backend também barra os demais). */
  readonly modulos = computed(() => MODULOS.filter((m) => !m.requer || this.auth.hasModule(m.requer)));
  readonly baixando = signal<ExportModulo | null>(null);

  constructor(
    private readonly auth: AuthService,
    private readonly exportService: ExportService,
    private readonly downloadFileService: DownloadFileService,
    private readonly toastCtrl: ToastController,
  ) {
    addIcons({ downloadOutline });
  }

  baixar(modulo: ExportModulo): void {
    this.baixando.set(modulo);
    this.exportService.download(modulo).subscribe({
      next: async (blob) => {
        try {
          const nomeArquivo = `export_${modulo}_${this.hojeParaNomeArquivo()}.zip`;
          await this.downloadFileService.shareFile(blob, nomeArquivo);
        } catch (err) {
          console.error('Erro ao salvar exportação', err);
          const toast = await this.toastCtrl.create({
            message: 'Erro ao salvar o arquivo baixado.',
            duration: 4000,
            color: 'danger',
          });
          await toast.present();
        } finally {
          this.baixando.set(null);
        }
      },
      error: async (err) => {
        this.baixando.set(null);
        console.error('Erro ao exportar dados', err);
        const toast = await this.toastCtrl.create({
          message: `Erro ao exportar: ${extractHttpErrorMessage(err)}`,
          duration: 4000,
          color: 'danger',
        });
        await toast.present();
      },
    });
  }

  private hojeParaNomeArquivo(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  }
}
