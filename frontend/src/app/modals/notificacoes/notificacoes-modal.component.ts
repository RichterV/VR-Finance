import { Component, Input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, ModalController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmarkDoneOutline, chevronForward, close, notificationsOffOutline, statsChartOutline } from 'ionicons/icons';

import { ModalLauncherService } from '../../core/modal-launcher.service';
import { Notificacao, NotificacoesService } from '../../services/notificacoes.service';

/** Central de notificações (sino da Home): lista dos resumos mensais, mais novo primeiro. */
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
    addIcons({ close, chevronForward, checkmarkDoneOutline, statsChartOutline, notificationsOffOutline });
  }

  dismiss(): void {
    this.modalCtrl.dismiss();
  }

  markAllRead(): void {
    this.notificacoes.markAllRead().subscribe();
  }

  open(n: Notificacao): void {
    void this.modals.resumoMensal(n, this.valoresOcultos);
  }
}
