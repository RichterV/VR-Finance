import { Component, OnInit, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import {
  AlertController,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonText,
  IonTitle,
  IonToolbar,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { close, create, logOutOutline, swapHorizontalOutline, trash } from 'ionicons/icons';

import { AuthService, CurrentUser } from '../../core/auth.service';

function passwordsMatchValidator(newControlName: string, confirmControlName: string) {
  return (group: AbstractControl): ValidationErrors | null => {
    const newValue = group.get(newControlName)?.value;
    const confirmValue = group.get(confirmControlName)?.value;
    return newValue === confirmValue ? null : { passwordsMismatch: true };
  };
}

@Component({
  selector: 'app-perfil-modal',
  templateUrl: './perfil-modal.component.html',
  styleUrls: ['./perfil-modal.component.scss'],
  imports: [
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
    IonText,
  ],
})
export class PerfilModalComponent implements OnInit {
  readonly passwordSaving = signal(false);
  readonly passwordError = signal<string | null>(null);

  readonly userSaving = signal(false);
  readonly userError = signal<string | null>(null);

  readonly users = signal<CurrentUser[]>([]);
  readonly editingUserId = signal<number | null>(null);
  readonly editSaving = signal(false);
  readonly editError = signal<string | null>(null);

  readonly editUserForm = this.fb.nonNullable.group({
    username: this.fb.nonNullable.control('', Validators.required),
    password: this.fb.nonNullable.control(''),
  });

  readonly passwordForm = this.fb.nonNullable.group(
    {
      currentPassword: this.fb.nonNullable.control('', Validators.required),
      newPassword: this.fb.nonNullable.control('', [Validators.required, Validators.minLength(6)]),
      confirmPassword: this.fb.nonNullable.control('', Validators.required),
    },
    { validators: passwordsMatchValidator('newPassword', 'confirmPassword') },
  );

  readonly newUserForm = this.fb.nonNullable.group(
    {
      username: this.fb.nonNullable.control('', Validators.required),
      password: this.fb.nonNullable.control('', [Validators.required, Validators.minLength(6)]),
      confirmPassword: this.fb.nonNullable.control('', Validators.required),
    },
    { validators: passwordsMatchValidator('password', 'confirmPassword') },
  );

  constructor(
    private readonly fb: FormBuilder,
    readonly auth: AuthService,
    private readonly toastCtrl: ToastController,
    private readonly alertCtrl: AlertController,
    private readonly modalCtrl: ModalController,
  ) {
    addIcons({ close, logOutOutline, create, trash, swapHorizontalOutline });
  }

  ngOnInit(): void {
    if (this.auth.isMaster) {
      this.loadUsers();
    }
  }

  private loadUsers(): void {
    this.auth.listUsers().subscribe((users) => this.users.set(users));
  }

  dismiss(): void {
    this.modalCtrl.dismiss();
  }

  logout(): void {
    this.modalCtrl.dismiss();
    this.auth.logout();
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
            this.auth.switchToTeste().subscribe(() => {
              this.modalCtrl.dismiss();
              window.location.reload();
            });
          },
        },
      ],
    });
    await alert.present();
  }

  async submitPasswordChange(): Promise<void> {
    this.passwordError.set(null);
    if (this.passwordForm.invalid) {
      this.passwordError.set(
        this.passwordForm.errors?.['passwordsMismatch']
          ? 'As senhas novas não coincidem.'
          : 'Preencha os campos corretamente (mínimo 6 caracteres).',
      );
      return;
    }

    const { currentPassword, newPassword } = this.passwordForm.getRawValue();
    this.passwordSaving.set(true);
    this.auth.changePassword(currentPassword, newPassword).subscribe({
      next: async () => {
        this.passwordSaving.set(false);
        this.passwordForm.reset({ currentPassword: '', newPassword: '', confirmPassword: '' });
        const toast = await this.toastCtrl.create({ message: 'Senha atualizada.', duration: 2000, color: 'success' });
        await toast.present();
      },
      error: async () => {
        this.passwordSaving.set(false);
        this.passwordError.set('Senha atual incorreta.');
      },
    });
  }

  async submitNewUser(): Promise<void> {
    this.userError.set(null);
    if (this.newUserForm.invalid) {
      this.userError.set(
        this.newUserForm.errors?.['passwordsMismatch']
          ? 'As senhas não coincidem.'
          : 'Preencha os campos corretamente (senha com mínimo 6 caracteres).',
      );
      return;
    }

    const { username, password } = this.newUserForm.getRawValue();
    this.userSaving.set(true);
    this.auth.createUser(username, password).subscribe({
      next: async () => {
        this.userSaving.set(false);
        this.newUserForm.reset({ username: '', password: '', confirmPassword: '' });
        this.loadUsers();
        const toast = await this.toastCtrl.create({
          message: `Usuário "${username}" criado.`,
          duration: 2000,
          color: 'success',
        });
        await toast.present();
      },
      error: async (err) => {
        this.userSaving.set(false);
        this.userError.set(err?.status === 400 ? 'Esse usuário já existe.' : 'Erro ao criar usuário.');
      },
    });
  }

  editarUsuario(user: CurrentUser): void {
    this.editError.set(null);
    this.editingUserId.set(user.id);
    this.editUserForm.reset({ username: user.username, password: '' });
  }

  cancelarEdicao(): void {
    this.editingUserId.set(null);
  }

  async salvarEdicaoUsuario(): Promise<void> {
    this.editError.set(null);
    const userId = this.editingUserId();
    if (userId == null || this.editUserForm.invalid) {
      this.editError.set('Preencha o nome de usuário.');
      return;
    }

    const { username, password } = this.editUserForm.getRawValue();
    this.editSaving.set(true);
    this.auth.updateUser(userId, username, password || undefined).subscribe({
      next: async () => {
        this.editSaving.set(false);
        this.editingUserId.set(null);
        this.loadUsers();
        const toast = await this.toastCtrl.create({ message: 'Usuário atualizado.', duration: 2000, color: 'success' });
        await toast.present();
      },
      error: async (err) => {
        this.editSaving.set(false);
        this.editError.set(err?.status === 400 ? 'Esse nome de usuário já existe.' : 'Erro ao atualizar usuário.');
      },
    });
  }

  async excluirUsuario(user: CurrentUser): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Excluir usuário',
      message: `Remover o usuário "${user.username}"? Todos os gastos, receitas, categorias e veículos dele serão apagados. Essa ação não pode ser desfeita.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Excluir',
          role: 'destructive',
          handler: () => {
            this.auth.deleteUser(user.id).subscribe(async () => {
              this.loadUsers();
              const toast = await this.toastCtrl.create({ message: 'Usuário excluído.', duration: 2000, color: 'success' });
              await toast.present();
            });
          },
        },
      ],
    });
    await alert.present();
  }
}
