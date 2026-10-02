import { Component, Input, signal } from '@angular/core';
import { IonButton, IonButtons, IonIcon, IonItem, IonLabel, IonList, ModalController, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { documentOutline, downloadOutline, eyeOutline, shareSocialOutline } from 'ionicons/icons';

import { Attachment, AttachmentsService } from '../services/attachments.service';
import { attachmentFormatLabel, formatFileSize } from './attachment-types';
import { downloadAttachment, shareAttachment } from './download-attachment.helper';
import { DownloadFileService } from './download-file.service';

/**
 * Popover com a lista de anexos de um registro, aberto pelo ícone "Baixar anexos" das telas de
 * listagem. Cada linha tem dois botões -- "Visualizar" (abre um modal fullscreen de
 * pré-visualização, `AttachmentPreviewModalComponent`) e "Baixar" (salva o arquivo direto, sem
 * abrir nada) -- em vez do item inteiro ser clicável, já que agora tem duas ações possíveis.
 * No celular (APK ou navegador de toque) aparece um terceiro, "Compartilhar", que abre a folha de
 * compartilhar do sistema pra mandar o arquivo por outro app (WhatsApp etc.). O nome do arquivo
 * fica numa linha só com reticências (o completo aparece no `title` e na pré-visualização) --
 * antes quebrava letra por letra no popover estreito do celular. Embaixo do ícone de arquivo,
 * o formato ("PDF", "PNG"...), já que o nome cortado pode esconder a extensão.
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
            <div slot="start" class="file-type">
              <ion-icon name="document-outline"></ion-icon>
              <span>{{ attachmentFormatLabel(file) }}</span>
            </div>
            <ion-label>
              <h3 [title]="file.original_filename">{{ file.original_filename }}</h3>
              <p>{{ formatFileSize(file.size_bytes) }}</p>
            </ion-label>
            <ion-buttons slot="end">
              <ion-button aria-label="Visualizar" [disabled]="downloadingId() === file.id" (click)="preview(file)">
                <ion-icon slot="icon-only" name="eye-outline"></ion-icon>
              </ion-button>
              <ion-button aria-label="Baixar" [disabled]="downloadingId() === file.id" (click)="download(file)">
                <ion-icon slot="icon-only" name="download-outline"></ion-icon>
              </ion-button>
              @if (canShare) {
                <ion-button [disabled]="downloadingId() === file.id" (click)="share(file)" aria-label="Compartilhar">
                  <ion-icon slot="icon-only" name="share-social-outline"></ion-icon>
                </ion-button>
              }
            </ion-buttons>
          </ion-item>
        }
      </ion-list>
    }
  `,
  styles: [
    `
      .file-type {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        min-width: 32px;
        margin-inline-end: 16px;
      }

      .file-type ion-icon {
        font-size: 1.5rem;
      }

      .file-type span {
        font-size: 0.7rem;
        font-weight: 600;
        letter-spacing: 0.04em;
        color: var(--app-text-secondary);
      }

      ion-label {
        min-width: 0;
      }

      ion-label h3 {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

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
  readonly attachmentFormatLabel = attachmentFormatLabel;
  readonly canShare: boolean;

  constructor(
    private readonly attachmentsService: AttachmentsService,
    private readonly downloadFileService: DownloadFileService,
    private readonly toastCtrl: ToastController,
    private readonly modalCtrl: ModalController,
  ) {
    addIcons({ documentOutline, downloadOutline, eyeOutline, shareSocialOutline });
    this.canShare = downloadFileService.canShareAttachment();
  }

  async share(file: Attachment): Promise<void> {
    this.downloadingId.set(file.id);
    await shareAttachment(file, this.attachmentsService, this.downloadFileService, this.toastCtrl);
    this.downloadingId.set(null);
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
