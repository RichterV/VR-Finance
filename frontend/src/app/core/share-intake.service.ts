import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { ActionSheetController, ModalController, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addCircleOutline,
  attachOutline,
  briefcaseOutline,
  carSportOutline,
  close,
  hammerOutline,
  peopleOutline,
  receiptOutline,
  removeCircleOutline,
  trendingUpOutline,
} from 'ionicons/icons';

import { ALLOWED_ATTACHMENT_TYPES, MAX_ATTACHMENT_SIZE_BYTES, isXmlFile } from '../shared/attachment-types';
import { shrinkPhoto } from '../shared/camera-photo';
import { AppLockService } from './app-lock.service';
import { AuthService } from './auth.service';
import { ModalLauncherService } from './modal-launcher.service';
import { ModuleKey } from './modules';
import { ShareIntakeBridge } from './share-intake-bridge';
import type { AttachedResult } from '../modals/anexar-existente/anexar-existente-modal.component';
import type { EntityType } from '../services/attachments.service';
import type { RecordRow } from '../shared/record-sources.service';

/** O que dá pra cadastrar com um arquivo compartilhado de outro app. */
export type ShareTarget =
  | 'gasto'
  | 'receita'
  | 'servico_veiculo'
  | 'servico_casa'
  | 'operacao_bolsa'
  | 'devedor'
  | 'nota_fiscal'
  | 'documento_empresa'
  | 'existente';

interface ShareOption {
  target: ShareTarget;
  label: string;
  /** Mesmo ícone do módulo no menu lateral (Gasto/Receita: os do header da Home). */
  icon: string;
  module?: ModuleKey;
  /** Página que abre o modal (os módulos recarregam a própria lista ao salvar); sem rota = modal da Home. */
  route?: string;
}

export const SHARE_OPTIONS: ShareOption[] = [
  { target: 'gasto', label: 'Gasto', icon: 'remove-circle-outline' },
  { target: 'receita', label: 'Receita', icon: 'add-circle-outline' },
  { target: 'servico_veiculo', label: 'Serviço de veículo', icon: 'car-sport-outline', module: 'veiculos', route: '/veiculos' },
  { target: 'servico_casa', label: 'Serviço da casa', icon: 'hammer-outline', module: 'manutencao_casa', route: '/casa' },
  { target: 'nota_fiscal', label: 'Nota fiscal', icon: 'receipt-outline', module: 'empresa', route: '/empresa' },
  { target: 'documento_empresa', label: 'Documento da empresa', icon: 'briefcase-outline', module: 'empresa', route: '/empresa' },
  { target: 'existente', label: 'Anexar a um lançamento existente', icon: 'attach-outline' },
];

const EXTENSION_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  pdf: 'application/pdf',
  xml: 'application/xml',
};

/** Alguns apps mandam o tipo vazio, genérico ou "image/jpg" -- vale a extensão do nome. */
export function normalizeSharedFile(file: File): File {
  if (ALLOWED_ATTACHMENT_TYPES.includes(file.type) || isXmlFile(file)) return file;
  const ext = file.name.match(/\.([a-z0-9]+)$/i)?.[1]?.toLowerCase();
  const type = (ext && EXTENSION_TYPES[ext]) || (file.type === 'image/jpg' ? 'image/jpeg' : null);
  return type ? new File([file], file.name, { type }) : file;
}

export function isSupportedSharedFile(file: File): boolean {
  return ALLOWED_ATTACHMENT_TYPES.includes(file.type) || isXmlFile(file);
}

/** Opções da pergunta "O que você quer cadastrar?": só os módulos do usuário; XML só serve pra nota fiscal. */
export function shareOptionsFor(files: File[], hasModule: (key: ModuleKey) => boolean): ShareOption[] {
  const allXml = files.length > 0 && files.every(isXmlFile);
  return SHARE_OPTIONS.filter((o) => {
    if (o.module && !hasModule(o.module)) return false;
    if (!allXml) return true;
    // XML só vira anexo de nota fiscal: nova ou uma já cadastrada (precisa do módulo Empresa)
    return o.target === 'nota_fiscal' || (o.target === 'existente' && hasModule('empresa'));
  });
}

/**
 * "Compartilhar" > VR Finance (só no APK): recebe os arquivos do ShareIntakePlugin, espera o
 * usuário estar logado e com o app desbloqueado, pergunta o que cadastrar e abre o formulário de
 * Adicionar já com os arquivos na fila de anexos. Gasto/receita abrem direto (modal da Home); os
 * módulos navegam pra própria página, que pega o pedido com onSharedFiles() e abre o modal dela.
 */
@Injectable({ providedIn: 'root' })
export class ShareIntakeService {
  private readonly bridge = inject(ShareIntakeBridge);
  private readonly auth = inject(AuthService);
  private readonly appLock = inject(AppLockService);
  private readonly launcher = inject(ModalLauncherService);
  private readonly router = inject(Router);
  private readonly actionSheetCtrl = inject(ActionSheetController);
  private readonly toastCtrl = inject(ToastController);
  private readonly modalCtrl = inject(ModalController);

  /** Arquivos recebidos esperando a pergunta (login/desbloqueio pendente, por exemplo). */
  readonly pending = signal<File[]>([]);
  /** Pedido pra uma página de módulo abrir o próprio modal de Adicionar. */
  private readonly request = signal<{ target: ShareTarget; files: File[] } | null>(null);
  /** Último anexo feito num lançamento existente -- as páginas de lista recarregam (onSharedAttached). */
  readonly attached = signal<{ type: EntityType; at: number } | null>(null);
  private initialized = false;
  private prompting = false;

  constructor() {
    addIcons({
      addCircleOutline,
      attachOutline,
      briefcaseOutline,
      carSportOutline,
      close,
      hammerOutline,
      peopleOutline,
      receiptOutline,
      removeCircleOutline,
      trendingUpOutline,
    });
    effect(() => {
      const ready = this.pending().length > 0 && this.canPrompt();
      if (ready) untracked(() => void this.prompt());
    });
  }

  init(): void {
    if (this.initialized || !this.bridge.isNative()) return;
    this.initialized = true;
    this.bridge.onShareReceived(() => void this.pull());
    void this.pull();
  }

  /** Página de módulo: devolve (e consome) os arquivos se o pedido for pra ela. Lido dentro de effect. */
  takeRequest(target: ShareTarget): File[] | null {
    const req = this.request();
    if (!req || req.target !== target) return null;
    this.request.set(null);
    return req.files;
  }

  private canPrompt(): boolean {
    const user = this.auth.currentUser();
    return !!user && !user.must_change_password && !this.appLock.locked();
  }

  private async pull(): Promise<void> {
    let result: Awaited<ReturnType<ShareIntakeBridge['consume']>>;
    try {
      result = await this.bridge.consume();
    } catch {
      return;
    }
    const files: File[] = [];
    let unsupported = result.rejected;
    for (const ref of result.files) {
      try {
        let file = normalizeSharedFile(await this.bridge.readAndDelete(ref));
        if (!isSupportedSharedFile(file)) {
          unsupported++;
          continue;
        }
        // Foto grande da galeria: reduz como a da câmera (senão passaria do limite de 10MB)
        if (file.type.startsWith('image/') && file.size > MAX_ATTACHMENT_SIZE_BYTES) {
          file = await shrinkPhoto(file, new Date(), file.name.replace(/\.[^.]+$/, '') + '.jpg');
        }
        files.push(file);
      } catch {
        unsupported++;
      }
    }
    if (unsupported) {
      void this.toast(
        unsupported === 1
          ? 'Um arquivo não pôde ser usado: o VR Finance aceita imagem, PDF ou XML de nota fiscal (até 10MB).'
          : `${unsupported} arquivos não puderam ser usados: o VR Finance aceita imagem, PDF ou XML de nota fiscal (até 10MB).`,
      );
    }
    if (files.length) this.pending.update((current) => [...current, ...files]);
  }

  private async prompt(): Promise<void> {
    if (this.prompting) return;
    this.prompting = true;
    try {
      // Dá tempo do bloqueio do app entrar (o intent pode chegar antes do appStateChange)
      await new Promise((resolve) => setTimeout(resolve, 400));
      if (!this.canPrompt()) return;
      const files = this.pending();
      this.pending.set([]);
      if (!files.length) return;

      const options = shareOptionsFor(files, (key) => this.auth.hasModule(key));
      if (!options.length) {
        void this.toast('Arquivo XML só pode ser cadastrado como nota fiscal, no módulo Empresa.');
        return;
      }
      const sheet = await this.actionSheetCtrl.create({
        header: 'O que você quer cadastrar?',
        subHeader: files.length === 1 ? files[0].name : `${files.length} arquivos como anexo`,
        cssClass: 'share-intake-sheet',
        buttons: [
          ...options.map((o) => ({
            text: o.label,
            icon: o.icon,
            data: o,
            // "Anexar a um existente" é outro tipo de ação: separado dos cadastros novos
            cssClass: o.target === 'existente' ? 'share-existing' : undefined,
          })),
          { text: 'Cancelar', role: 'cancel', icon: 'close' },
        ],
      });
      await sheet.present();
      const { data, role } = await sheet.onDidDismiss<ShareOption>();
      if (role === 'cancel' || role === 'backdrop' || !data) return;
      await this.open(data, files);
    } finally {
      this.prompting = false;
      // Chegou mais coisa enquanto a pergunta estava aberta
      if (this.pending().length && this.canPrompt()) void this.prompt();
    }
  }

  private async open(option: ShareOption, files: File[]): Promise<void> {
    if (option.target === 'gasto') {
      await this.launcher.adicionarGasto(files);
      return;
    }
    if (option.target === 'receita') {
      await this.launcher.adicionarReceita(files);
      return;
    }
    if (option.target === 'existente') {
      await this.attachToExisting(files);
      return;
    }
    this.request.set({ target: option.target, files });
    if (option.route && !this.router.url.startsWith(option.route)) {
      await this.router.navigateByUrl(option.route);
    }
  }

  private async attachToExisting(files: File[]): Promise<void> {
    const { AnexarExistenteModalComponent } = await import('../modals/anexar-existente/anexar-existente-modal.component');
    const modal = await this.modalCtrl.create({
      component: AnexarExistenteModalComponent,
      componentProps: { files },
      ...this.launcher.sideModalOptions(),
    });
    await modal.present();
    const { data, role } = await modal.onDidDismiss<AttachedResult>();
    if (role !== 'attached' || !data) return;
    const row = data.row;
    this.attached.set({ type: row.source.type, at: Date.now() });
    const toast = await this.toastCtrl.create({
      message: `${data.count === 1 ? 'Anexado' : `${data.count} arquivos anexados`} ${row.source.toNoun} ${row.title}.`,
      duration: 6000,
      // Mesmo visual do toast de "Desfazer": cartão do tema com a ação em verde
      cssClass: 'action-toast',
      buttons: [{ text: 'Ver', handler: () => void this.openEditor(row) }],
    });
    await toast.present();
  }

  /** "Ver" do aviso: abre o Editar do lançamento; salvar lá também recarrega a lista aberta. */
  private async openEditor(row: RecordRow): Promise<void> {
    const modal = await row.source.openEditor(row.record);
    const { role } = await modal.onDidDismiss();
    if (role === 'saved') this.attached.set({ type: row.source.type, at: Date.now() });
  }

  private async toast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 5000, color: 'warning' });
    await toast.present();
  }
}

/**
 * Pra página de um módulo: quando o usuário compartilhar um arquivo e escolher este tipo, chama o
 * handler (que abre o modal de Adicionar com os arquivos). Chamar no construtor da página.
 */
export function onSharedFiles(target: ShareTarget, handler: (files: File[]) => void): void {
  const service = inject(ShareIntakeService);
  effect(() => {
    const files = service.takeRequest(target);
    if (files) untracked(() => handler(files));
  });
}

/**
 * Pra página de lista: recarrega quando um arquivo compartilhado foi anexado a um lançamento
 * existente de um destes tipos (o ícone de anexo da linha passa a aparecer). Chamar no construtor.
 */
export function onSharedAttached(types: EntityType[], handler: () => void): void {
  const service = inject(ShareIntakeService);
  let last = untracked(() => service.attached()?.at ?? 0);
  effect(() => {
    const event = service.attached();
    if (!event || event.at === last) return;
    last = event.at;
    if (types.includes(event.type)) untracked(handler);
  });
}
