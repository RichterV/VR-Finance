import { ToastController } from '@ionic/angular';
import { firstValueFrom } from 'rxjs';

import { Attachment, AttachmentsService } from '../services/attachments.service';
import { extractHttpErrorMessage } from './attachment-types';
import { DownloadFileService } from './download-file.service';

/** Salva um Blob já obtido (ex: o mesmo usado pra pré-visualização) via DownloadFileService, com os toasts de feedback padrão. */
export async function saveAttachmentBlob(
  blob: Blob,
  filename: string,
  downloadFileService: DownloadFileService,
  toastCtrl: ToastController,
): Promise<void> {
  try {
    const result = await downloadFileService.trigger(blob, filename);
    if (result.savedNatively) {
      const toast = await toastCtrl.create({
        message: `"${filename}" salvo em Documentos.`,
        duration: 3000,
        color: 'success',
      });
      await toast.present();
    }
  } catch (err) {
    console.error('Erro ao salvar anexo', err);
    const toast = await toastCtrl.create({
      message: 'Erro ao salvar o anexo baixado.',
      duration: 4000,
      color: 'danger',
    });
    await toast.present();
  }
}

/** Baixa um anexo do zero (busca o blob via API) e salva, com os toasts de feedback padrão. */
export async function downloadAttachment(
  file: Attachment,
  attachmentsService: AttachmentsService,
  downloadFileService: DownloadFileService,
  toastCtrl: ToastController,
): Promise<void> {
  let blob: Blob;
  try {
    blob = await firstValueFrom(attachmentsService.downloadBlob(file.id));
  } catch (err) {
    console.error('Erro ao baixar anexo', err);
    const toast = await toastCtrl.create({
      message: `Erro ao baixar anexo: ${extractHttpErrorMessage(err)}`,
      duration: 4000,
      color: 'danger',
    });
    await toast.present();
    return;
  }
  await saveAttachmentBlob(blob, file.original_filename, downloadFileService, toastCtrl);
}
