import { ToastController } from '@ionic/angular';
import { firstValueFrom, Observable } from 'rxjs';

import { extractHttpErrorMessage } from './attachment-types';

export interface CommitAttachmentsOptions {
  /** `attachmentPicker.commit(...)` do modal -- sobe os anexos que estavam esperando o registro existir. */
  commit: Observable<unknown>;
  toastCtrl: ToastController;
  /** Toast de sucesso, ex: "Gasto salvo." */
  successMessage: string;
  /** Início do aviso quando o registro salvou mas os anexos não, ex: "Gasto salvo". */
  savedLabel: string;
}

/**
 * Passo final dos modais de Adicionar com anexo: o registro já foi salvo; sobe os anexos pendentes
 * e avisa (sucesso, ou "salvo, mas os anexos falharam" -- o registro nunca é desfeito por isso).
 * Resolve quando terminou, pra o modal limpar o formulário.
 */
export async function commitAttachments(options: CommitAttachmentsOptions): Promise<void> {
  try {
    await firstValueFrom(options.commit, { defaultValue: null });
    const toast = await options.toastCtrl.create({ message: options.successMessage, duration: 2000, color: 'success' });
    await toast.present();
  } catch (err) {
    console.error(`${options.savedLabel}: erro ao enviar anexos`, err);
    const toast = await options.toastCtrl.create({
      message: `${options.savedLabel}, mas houve erro ao enviar os anexos: ${extractHttpErrorMessage(err)}`,
      duration: 4000,
      color: 'warning',
    });
    await toast.present();
  }
}
