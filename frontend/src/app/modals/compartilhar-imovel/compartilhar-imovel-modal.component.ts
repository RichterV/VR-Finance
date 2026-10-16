import { DatePipe } from '@angular/common';
import { Component, Input, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  AlertController,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonSelect,
  IonSelectOption,
  IonText,
  IonTitle,
  IonToolbar,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { close } from 'ionicons/icons';

import {
  CasaService,
  Compartilhamento,
  Imovel,
  SHARE_NIVEL_HINTS,
  SHARE_NIVEL_LABELS,
  ShareNivel,
} from '../../services/casa.service';
import { httpErrorMessage } from '../../shared/http-error';

/**
 * Compartilhar um imóvel meu (Manutenção Casa) com outro usuário: username exato + nível. O
 * convite só vale depois que a pessoa aceita (na central de notificações dela). Embaixo, com quem
 * já está compartilhado: pendente (Cancelar) ou aceito (trocar o nível, Encerrar).
 */
@Component({
  selector: 'app-compartilhar-imovel-modal',
  templateUrl: './compartilhar-imovel-modal.component.html',
  styleUrls: ['./compartilhar-imovel-modal.component.scss'],
  imports: [
    DatePipe,
    ReactiveFormsModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonIcon,
    IonTitle,
    IonContent,
    IonItem,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonText,
  ],
})
export class CompartilharImovelModalComponent implements OnInit {
  @Input({ required: true }) imovel!: Imovel;

  readonly niveis = Object.entries(SHARE_NIVEL_LABELS) as [ShareNivel, string][];
  readonly nivelLabels = SHARE_NIVEL_LABELS;
  readonly nivelHints = SHARE_NIVEL_HINTS;

  readonly compartilhamentos = signal<Compartilhamento[]>([]);
  readonly loading = signal(true);
  readonly sending = signal(false);
  readonly errorMessage = signal<string | null>(null);
  private changed = false;

  readonly form = this.fb.nonNullable.group({
    username: this.fb.nonNullable.control('', Validators.required),
    nivel: this.fb.nonNullable.control<ShareNivel>('cadastro'),
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly casaService: CasaService,
    private readonly modalCtrl: ModalController,
    private readonly toastCtrl: ToastController,
    private readonly alertCtrl: AlertController,
  ) {
    addIcons({ close });
  }

  ngOnInit(): void {
    this.reload();
  }

  private reload(): void {
    this.casaService.listCompartilhamentos(this.imovel.id).subscribe({
      next: (items) => {
        this.compartilhamentos.set(items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  private async toast(message: string, color: 'success' | 'danger' = 'success'): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 2500, color });
    await toast.present();
  }

  enviar(): void {
    this.errorMessage.set(null);
    const { username, nivel } = this.form.getRawValue();
    const nome = username.trim();
    if (!nome) {
      this.errorMessage.set('Digite o usuário de quem vai receber.');
      return;
    }
    this.sending.set(true);
    this.casaService.compartilhar(this.imovel.id, nome, nivel).subscribe({
      next: (share) => {
        this.sending.set(false);
        this.changed = true;
        this.form.reset({ username: '', nivel });
        this.compartilhamentos.update((items) => [...items, share]);
        void this.toast(`Convite enviado para ${share.convidado.nome}.`);
      },
      error: (err: unknown) => {
        this.sending.set(false);
        this.errorMessage.set(httpErrorMessage(err, 'Erro ao enviar o convite.'));
      },
    });
  }

  mudarNivel(share: Compartilhamento, nivel: ShareNivel): void {
    if (nivel === share.nivel) return;
    this.casaService.mudarNivel(share.id, nivel).subscribe({
      next: (updated) => {
        this.changed = true;
        this.compartilhamentos.update((items) => items.map((s) => (s.id === share.id ? updated : s)));
        void this.toast(`Permissão de ${share.convidado.nome} mudou para ${SHARE_NIVEL_LABELS[nivel]}.`);
      },
      error: (err: unknown) => {
        // Volta o select pro nível que valia.
        this.compartilhamentos.update((items) => items.map((s) => (s.id === share.id ? { ...s } : s)));
        void this.toast(httpErrorMessage(err, 'Erro ao mudar a permissão.'), 'danger');
      },
    });
  }

  async encerrar(share: Compartilhamento): Promise<void> {
    const pendente = share.status === 'pendente';
    const alert = await this.alertCtrl.create({
      header: pendente ? 'Cancelar convite?' : 'Encerrar compartilhamento?',
      message: pendente
        ? `${share.convidado.nome} não vai mais poder aceitar o convite.`
        : `${share.convidado.nome} deixa de ver o imóvel "${this.imovel.name}". Os serviços que essa pessoa cadastrou continuam aqui.`,
      buttons: [
        { text: 'Voltar', role: 'cancel' },
        { text: pendente ? 'Cancelar convite' : 'Encerrar', role: 'destructive' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role !== 'destructive') return;
    this.casaService.encerrarCompartilhamento(share.id).subscribe({
      next: () => {
        this.changed = true;
        this.compartilhamentos.update((items) => items.filter((s) => s.id !== share.id));
        void this.toast(pendente ? 'Convite cancelado.' : 'Compartilhamento encerrado.');
      },
      error: (err: unknown) => void this.toast(httpErrorMessage(err, 'Erro ao encerrar.'), 'danger'),
    });
  }

  dismiss(): void {
    this.modalCtrl.dismiss(null, this.changed ? 'saved' : 'cancel');
  }
}
