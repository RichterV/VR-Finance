import { Component, Input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  checkmarkDoneOutline,
  chevronForward,
  close,
  documentTextOutline,
  notificationsOffOutline,
  peopleOutline,
  statsChartOutline,
} from 'ionicons/icons';
import { Observable } from 'rxjs';

import { ModalLauncherService } from '../../core/modal-launcher.service';
import { CasaService } from '../../services/casa.service';
import {
  isConvitePendente,
  Notificacao,
  NotificacaoCompartilhamento,
  NotificacoesService,
} from '../../services/notificacoes.service';
import { httpErrorMessage } from '../../shared/http-error';

/** Central de notificações (sino da Home): resumos mensais, avisos de relatório anual e de
 * compartilhamento de imóvel (convite com Aceitar/Recusar direto na lista), mais novo primeiro. */
@Component({
  selector: 'app-notificacoes-modal',
  templateUrl: './notificacoes-modal.component.html',
  styleUrls: ['./notificacoes-modal.component.scss'],
  imports: [DatePipe, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent],
})
export class NotificacoesModalComponent {
  @Input() valoresOcultos = false;

  /** Convite com Aceitar/Recusar em andamento (desabilita os botões). */
  readonly respondendo = signal<number | null>(null);
  readonly isConvitePendente = isConvitePendente;

  constructor(
    readonly notificacoes: NotificacoesService,
    private readonly modalCtrl: ModalController,
    private readonly modals: ModalLauncherService,
    private readonly casaService: CasaService,
    private readonly toastCtrl: ToastController,
  ) {
    addIcons({
      close,
      chevronForward,
      checkmarkDoneOutline,
      documentTextOutline,
      statsChartOutline,
      notificationsOffOutline,
      peopleOutline,
    });
  }

  dismiss(): void {
    this.modalCtrl.dismiss();
  }

  markAllRead(): void {
    this.notificacoes.markAllRead().subscribe();
  }

  /** O sino também conta convites pendentes (mesmo lidos); "marcar todas" só faz sentido com não lidas. */
  temNaoLidas(): boolean {
    return this.notificacoes.items().some((n) => !n.lida);
  }

  isCompartilhamento(n: Notificacao): n is NotificacaoCompartilhamento {
    return n.tipo.startsWith('compartilhamento_');
  }

  /** Linha de baixo do convite já respondido (ou que deixou de existir). */
  conviteSituacao(n: NotificacaoCompartilhamento): string {
    switch (n.payload.status) {
      case 'aceito':
        return 'Você aceitou. O imóvel está em Manutenção Casa';
      case 'recusado':
        return 'Você recusou';
      case 'encerrado':
        return 'Compartilhamento encerrado';
      default:
        return 'Este convite não está mais disponível';
    }
  }

  open(n: Notificacao): void {
    if (n.tipo === 'relatorio_anual') {
      // Abre a geração do PDF já no ano que passou (decisão do usuário).
      if (!n.lida) this.notificacoes.markRead(n.id).subscribe();
      void this.modals.relatorioAnual(n.ano);
      return;
    }
    if (n.tipo === 'resumo_mensal') {
      void this.modals.resumoMensal(n, this.valoresOcultos);
      return;
    }
    // Aviso de compartilhamento: só texto -- tocar marca como lido.
    if (!n.lida) this.notificacoes.markRead(n.id).subscribe();
  }

  aceitar(n: NotificacaoCompartilhamento): void {
    this.responder(n, this.casaService.aceitarCompartilhamento(n.payload.compartilhamento_id), 'Compartilhamento aceito. O imóvel já aparece em Manutenção Casa.');
  }

  recusar(n: NotificacaoCompartilhamento): void {
    this.responder(n, this.casaService.recusarCompartilhamento(n.payload.compartilhamento_id), 'Convite recusado.');
  }

  private responder(n: NotificacaoCompartilhamento, request: Observable<unknown>, sucesso: string): void {
    this.respondendo.set(n.id);
    request.subscribe({
      next: () => {
        this.respondendo.set(null);
        void this.toast(sucesso, 'success');
        this.notificacoes.load().subscribe();
      },
      error: (err: unknown) => {
        this.respondendo.set(null);
        void this.toast(httpErrorMessage(err, 'Não foi possível responder o convite.'), 'danger');
        // O convite pode ter sido cancelado ou ter expirado enquanto a lista estava aberta.
        this.notificacoes.load().subscribe();
      },
    });
  }

  private async toast(message: string, color: 'success' | 'danger'): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 3000, color });
    await toast.present();
  }
}
