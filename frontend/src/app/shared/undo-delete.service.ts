import { Injectable } from '@angular/core';
import { ToastController } from '@ionic/angular';
import { Observable } from 'rxjs';

import { httpErrorMessage } from './http-error';

/** Quanto tempo o "Desfazer" fica disponível antes da exclusão de verdade. */
export const UNDO_WINDOW_MS = 5000;

export interface UndoDeleteRequest {
  /** Texto do toast, ex: "Gasto excluído." */
  message: string;
  /** Tira o item da tela na hora. */
  hide: () => void;
  /** Devolve o item -- se o usuário desfizer ou se o DELETE falhar. */
  restore: () => void;
  /** O DELETE de verdade, chamado só depois da janela de desfazer. */
  commit: () => Observable<unknown>;
  /** Depois que o DELETE deu certo (recarregar totais, avisar a Home etc.). */
  onCommitted?: () => void;
  /** Mensagem genérica se o DELETE falhar (o detalhe do backend tem prioridade). */
  errorMessage?: string;
}

interface Pending extends UndoDeleteRequest {
  timer: ReturnType<typeof setTimeout>;
  toast?: HTMLIonToastElement;
}

/**
 * Exclusão com "Desfazer" no lugar do alerta de confirmação: o item some da tela na hora e o DELETE
 * só vai pro servidor depois de 5s. Falha segura: se o app for fechado antes, o item NÃO é excluído
 * (nunca o contrário) -- e sair da página ou mandar o app pro segundo plano confirma na hora.
 */
@Injectable({ providedIn: 'root' })
export class UndoDeleteService {
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;

  constructor(private readonly toastCtrl: ToastController) {
    window.addEventListener('pagehide', () => this.flushAll());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.flushAll();
    });
  }

  schedule(request: UndoDeleteRequest): void {
    const id = this.nextId++;
    request.hide();
    const timer = setTimeout(() => this.commitNow(id), UNDO_WINDOW_MS);
    this.pending.set(id, { ...request, timer });
    void this.showToast(id, request.message);
  }

  /** Confirma na hora todas as exclusões pendentes (ao sair da página). */
  flushAll(): void {
    for (const id of [...this.pending.keys()]) this.commitNow(id);
  }

  get hasPending(): boolean {
    return this.pending.size > 0;
  }

  private async showToast(id: number, message: string): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: UNDO_WINDOW_MS,
      cssClass: 'undo-toast',
      buttons: [{ text: 'Desfazer', role: 'cancel', handler: () => this.undo(id) }],
    });
    const entry = this.pending.get(id);
    if (!entry) return; // já confirmado/desfeito enquanto o toast era criado
    entry.toast = toast;
    await toast.present();
  }

  private undo(id: number): void {
    const entry = this.pending.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(id);
    entry.restore();
  }

  private commitNow(id: number): void {
    const entry = this.pending.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.pending.delete(id);
    void entry.toast?.dismiss();
    entry.commit().subscribe({
      next: () => entry.onCommitted?.(),
      error: async (err: unknown) => {
        entry.restore();
        const toast = await this.toastCtrl.create({
          message: httpErrorMessage(err, entry.errorMessage ?? 'Não foi possível excluir.'),
          duration: 3000,
          color: 'danger',
        });
        await toast.present();
      },
    });
  }
}
