import { Component, Input, signal } from '@angular/core';
import { IonButton, IonButtons, IonIcon, IonItem, IonLabel, IonList, ModalController, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { documentOutline, downloadOutline, eyeOutline } from 'ionicons/icons';

import { Attachment, AttachmentsService } from '../services/attachments.service';
import { formatFileSize } from './attachment-types';
import { downloadAttachment } from './download-attachment.helper';
import { DownloadFileService } from './download-file.service';

/**
 * Popover com a lista de anexos de um registro, aberto pelo ícone "Baixar anexos" das telas de
 * listagem. Cada linha tem dois botões -- "Visualizar" (abre um modal fullscreen de
 * pré-visualização, `AttachmentPreviewModalComponent`) e "Baixar" (salva o arquivo direto, sem
 * abrir nada) -- em vez do item inteiro ser clicável, já que agora tem duas ações possíveis.
 */
@Component({
  selector: 'app-attachments-popover',
  standalone: true,
  imports: [IonList, IonItem, IonLabel, IonIcon, IonButtons, IonButton],
  template: `
    @if (!files.length) {
      <p class="empty">Nenhum anexo.</p>
    } @else {
      <ion-list lines="none">
        @for (file of files; track file.id) {
          <ion-item>
            <ion-icon slot="start" name="document-outline"></ion-icon>
            <ion-label>
              <h3>{{ file.original_filename }}</h3>
              <p>{{ formatFileSize(file.size_bytes) }}</p>
            </ion-label>
            <ion-buttons slot="end">
              <ion-button [disabled]="downloadingId() === file.id" (click)="preview(file)">
                <ion-icon slot="icon-only" name="eye-outline"></ion-icon>
              </ion-button>
              <ion-button [disabled]="downloadingId() === file.id" (click)="download(file)">
                <ion-icon slot="icon-only" name="download-outline"></ion-icon>
              </ion-button>
            </ion-buttons>
          </ion-item>
        }
      </ion-list>
    }
  `,
  styles: [
    `
      .empty {
        margin: 0;
        padding: 16px;
        font-size: 0.9rem;
        color: var(--app-text-secondary);
      }
    `,
  ],
})
export class AttachmentsPopoverComponent {
  @Input({ required: true }) files: Attachment[] = [];

  readonly downloadingId = signal<number | null>(null);
  readonly formatFileSize = formatFileSize;

  constructor(
    private readonly attachmentsService: AttachmentsService,
    private readonly downloadFileService: DownloadFileService,
    private readonly toastCtrl: ToastController,
    private readonly modalCtrl: ModalController,
  ) {
    addIcons({ documentOutline, downloadOutline, eyeOutline });
  }

  async download(file: Attachment): Promise<void> {
    this.downloadingId.set(file.id);
    await downloadAttachment(file, this.attachmentsService, this.downloadFileService, this.toastCtrl);
    this.downloadingId.set(null);
  }

  async preview(file: Attachment): Promise<void> {
    const { AttachmentPreviewModalComponent } = await import(
      '../modals/attachment-preview/attachment-preview-modal.component'
    );
    const modal = await this.modalCtrl.create({
      component: AttachmentPreviewModalComponent,
      componentProps: { file },
      cssClass: 'fullscreen-modal',
    });
    await modal.present();
  }
}
