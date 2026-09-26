import { Component, OnInit, signal } from '@angular/core';
import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonTitle,
  IonToolbar,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { create, personAddOutline, swapHorizontalOutline, trash } from 'ionicons/icons';

import { AuthService, CurrentUser } from '../../core/auth.service';
import { ModuleKey, OPTIONAL_MODULES } from '../../core/modules';
import { isDesktopViewport, slideInFromRight, slideOutToRight, SIDE_MODAL_CSS_CLASS } from '../../modals/side-modal.animations';
import { extractHttpErrorMessage } from '../../shared/attachment-types';

const MODULE_LABELS = new Map(OPTIONAL_MODULES.map((m) => [m.key, m.label]));

/**
 * Painel de Administração (só master): lista de usuários, criar/editar (dados, senha, módulos
 * habilitados), excluir e "Mudar pra conta teste". Mexer na própria conta fica no Perfil.
 */
@Component({
  selector: 'app-admin',
  templateUrl: './admin.page.html',
  styleUrls: ['./admin.page.scss'],
  imports: [IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonButton, IonIcon, IonContent],
})
export class AdminPage implements OnInit {
  readonly users = signal<CurrentUser[]>([]);
  readonly loading = signal(true);

  constructor(
    readonly auth: AuthService,
    private readonly modalCtrl: ModalController,
    private readonly alertCtrl: AlertController,
    private readonly toastCtrl: ToastController,
  ) {
    addIcons({ create, trash, personAddOutline, swapHorizontalOutline });
  }

  ngOnInit(): void {
    this.loadUsers();
  }

  private loadUsers(): void {
    this.auth.listUsers().subscribe({
      next: (users) => {
        this.users.set(users);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  moduleLabel(key: ModuleKey): string {
    return MODULE_LABELS.get(key) ?? key;
  }

  private sideModalOptions() {
    return isDesktopViewport()
      ? { cssClass: SIDE_MODAL_CSS_CLASS, enterAnimation: slideInFromRight, leaveAnimation: slideOutToRight }
      : {};
  }

  async abrirUsuario(user?: CurrentUser): Promise<void> {
    const { AdminUsuarioModalComponent } = await import('../../modals/admin-usuario/admin-usuario-modal.component');
    const modal = await this.modalCtrl.create({
      component: AdminUsuarioModalComponent,
      componentProps: { user },
      ...this.sideModalOptions(),
    });
    await modal.present();
    const { role } = await modal.onWillDismiss();
    if (role === 'saved') {
      this.loadUsers();
      if (user?.id === this.auth.currentUser()?.id) {
        this.auth.loadCurrentUser().subscribe();
      }
      await this.showToast(user ? 'Usuário atualizado.' : 'Usuário criado.', 'success');
    }
  }

  async excluirUsuario(user: CurrentUser): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Excluir usuário',
      message: `Remover o usuário "${user.username}"? Todos os dados dele (gastos, receitas, categorias, veículos, operações, devedores e anexos) serão apagados. Essa ação não pode ser desfeita.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Excluir',
          role: 'destructive',
          handler: () => {
            this.auth.deleteUser(user.id).subscribe({
              next: async () => {
                this.loadUsers();
                await this.showToast('Usuário excluído.', 'success');
              },
              error: async (err) => this.showToast(`Erro ao excluir: ${extractHttpErrorMessage(err)}`, 'danger'),
            });
          },
        },
      ],
    });
    await alert.present();
  }

  async switchToTeste(): Promise<void> {
    const contaAtual = this.auth.currentUser()?.username ?? 'sua conta';
    const alert = await this.alertCtrl.create({
      header: 'Mudar pra conta teste',
      message: `Você vai passar a usar a conta "teste". Não tem como voltar pra "${contaAtual}" sem deslogar e logar de novo. Continuar?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Mudar',
          handler: () => {
            this.auth.switchToTeste().subscribe({
              next: () => window.location.reload(),
              error: async (err) => this.showToast(`Erro: ${extractHttpErrorMessage(err)}`, 'danger'),
            });
          },
        },
      ],
    });
    await alert.present();
  }

  private async showToast(message: string, color: 'success' | 'danger'): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: color === 'danger' ? 4000 : 2000, color });
    await toast.present();
  }
}
