import { Component, Input, signal } from '@angular/core';
import { IonIcon, IonItem, IonLabel, IonList, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { documentOutline, downloadOutline } from 'ionicons/icons';

import { Attachment, AttachmentsService } from '../services/attachments.service';
import { extractHttpErrorMessage, formatFileSize } from './attachment-types';
import { DownloadFileService } from './download-file.service';

/** Popover simples com um link de download por arquivo, aberto pelo ícone "Baixar anexos" das telas de listagem. */
@Component({
  selector: 'app-attachments-popover',
  standalone: true,
  imports: [IonList, IonItem, IonLabel, IonIcon],
  template: `
    @if (!files.length) {
      <p class="empty">Nenhum anexo.</p>
    } @else {
      <ion-list lines="none">
        @for (file of files; track file.id) {
          <ion-item button [disabled]="downloadingId() === file.id" (click)="download(file)">
            <ion-icon slot="start" name="document-outline"></ion-icon>
            <ion-label>
              <h3>{{ file.original_filename }}</h3>
              <p>{{ formatFileSize(file.size_bytes) }}</p>
            </ion-label>
            <ion-icon slot="end" name="download-outline"></ion-icon>
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
  ) {
    addIcons({ documentOutline, downloadOutline });
  }

  download(file: Attachment): void {
    this.downloadingId.set(file.id);
    this.attachmentsService.downloadBlob(file.id).subscribe({
      next: async (blob) => {
        try {
          const result = await this.downloadFileService.trigger(blob, file.original_filename);
          if (result.savedNatively) {
            const toast = await this.toastCtrl.create({
              message: `"${file.original_filename}" salvo em Documentos.`,
              duration: 3000,
              color: 'success',
            });
            await toast.present();
          }
        } catch (err) {
          console.error('Erro ao salvar anexo', err);
          const toast = await this.toastCtrl.create({
            message: 'Erro ao salvar o anexo baixado.',
            duration: 4000,
            color: 'danger',
          });
          await toast.present();
        } finally {
          this.downloadingId.set(null);
        }
      },
      error: async (err) => {
        this.downloadingId.set(null);
        console.error('Erro ao baixar anexo', err);
        const toast = await this.toastCtrl.create({
          message: `Erro ao baixar anexo: ${extractHttpErrorMessage(err)}`,
          duration: 4000,
          color: 'danger',
        });
        await toast.present();
      },
    });
  }
}
