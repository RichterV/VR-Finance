import { Component, Input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, ModalController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmarkDoneOutline, chevronForward, close, documentTextOutline, notificationsOffOutline, statsChartOutline } from 'ionicons/icons';

import { ModalLauncherService } from '../../core/modal-launcher.service';
import { Notificacao, NotificacoesService } from '../../services/notificacoes.service';

/** Central de notificações (sino da Home): resumos mensais e avisos de relatório anual, mais novo primeiro. */
@Component({
  selector: 'app-notificacoes-modal',
  templateUrl: './notificacoes-modal.component.html',
  styleUrls: ['./notificacoes-modal.component.scss'],
  imports: [DatePipe, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent],
})
export class NotificacoesModalComponent {
  @Input() valoresOcultos = false;

  constructor(
    readonly notificacoes: NotificacoesService,
    private readonly modalCtrl: ModalController,
    private readonly modals: ModalLauncherService,
  ) {
    addIcons({ close, chevronForward, checkmarkDoneOutline, documentTextOutline, statsChartOutline, notificationsOffOutline });
  }

  dismiss(): void {
    this.modalCtrl.dismiss();
  }

  markAllRead(): void {
    this.notificacoes.markAllRead().subscribe();
  }

  open(n: Notificacao): void {
    if (n.tipo === 'relatorio_anual') {
      // Abre a geração do PDF já no ano que passou (decisão do usuário).
      if (!n.lida) this.notificacoes.markRead(n.id).subscribe();
      void this.modals.relatorioAnual(n.ano);
      return;
    }
    void this.modals.resumoMensal(n, this.valoresOcultos);
  }
}
