import { Component, Input } from '@angular/core';
import { DatePipe } from '@angular/common';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, ModalController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { checkmarkDoneOutline, chevronForward, close, notificationsOffOutline, statsChartOutline } from 'ionicons/icons';

import { isDesktopViewport, slideInFromRight, slideOutToRight, SIDE_MODAL_CSS_CLASS } from '../side-modal.animations';
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
  ) {
    addIcons({ close, chevronForward, checkmarkDoneOutline, statsChartOutline, notificationsOffOutline });
  }

  dismiss(): void {
    this.modalCtrl.dismiss();
  }

  markAllRead(): void {
    this.notificacoes.markAllRead().subscribe();
  }

  async open(n: Notificacao): Promise<void> {
    const { ResumoMensalModalComponent } = await import('../resumo-mensal/resumo-mensal-modal.component');
    const modal = await this.modalCtrl.create({
      component: ResumoMensalModalComponent,
      componentProps: { notificacao: n, valoresOcultos: this.valoresOcultos },
      ...(isDesktopViewport()
        ? { cssClass: SIDE_MODAL_CSS_CLASS, enterAnimation: slideInFromRight, leaveAnimation: slideOutToRight }
        : {}),
    });
    await modal.present();
  }
}
