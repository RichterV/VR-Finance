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

/** Abre a folha de compartilhar com um Blob já obtido. Cancelar a folha não é erro (sem toast). */
export async function shareAttachmentBlob(
  blob: Blob,
  filename: string,
  downloadFileService: DownloadFileService,
  toastCtrl: ToastController,
): Promise<void> {
  try {
    await downloadFileService.shareAttachment(blob, filename);
  } catch (err) {
    console.error('Erro ao compartilhar anexo', err);
    const toast = await toastCtrl.create({
      message: 'Não foi possível compartilhar o anexo.',
      duration: 4000,
      color: 'danger',
    });
    await toast.present();
  }
}

/** Busca o blob de um anexo via API, com o toast de erro padrão; null se falhar. */
async function fetchAttachmentBlob(
  file: Attachment,
  attachmentsService: AttachmentsService,
  toastCtrl: ToastController,
): Promise<Blob | null> {
  try {
    return await firstValueFrom(attachmentsService.downloadBlob(file.id));
  } catch (err) {
    console.error('Erro ao baixar anexo', err);
    const toast = await toastCtrl.create({
      message: `Erro ao baixar anexo: ${extractHttpErrorMessage(err)}`,
      duration: 4000,
      color: 'danger',
    });
    await toast.present();
    return null;
  }
}

/** Baixa um anexo do zero (busca o blob via API) e abre a folha de compartilhar. */
export async function shareAttachment(
  file: Attachment,
  attachmentsService: AttachmentsService,
  downloadFileService: DownloadFileService,
  toastCtrl: ToastController,
): Promise<void> {
  const blob = await fetchAttachmentBlob(file, attachmentsService, toastCtrl);
  if (!blob) return;
  await shareAttachmentBlob(blob, file.original_filename, downloadFileService, toastCtrl);
}

/** Baixa um anexo do zero (busca o blob via API) e salva, com os toasts de feedback padrão. */
export async function downloadAttachment(
  file: Attachment,
  attachmentsService: AttachmentsService,
  downloadFileService: DownloadFileService,
  toastCtrl: ToastController,
): Promise<void> {
  const blob = await fetchAttachmentBlob(file, attachmentsService, toastCtrl);
  if (!blob) return;
  await saveAttachmentBlob(blob, file.original_filename, downloadFileService, toastCtrl);
}
