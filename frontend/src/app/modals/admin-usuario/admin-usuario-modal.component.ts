import { Component, Input, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonText,
  IonTitle,
  IonToggle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { close, pulseOutline } from 'ionicons/icons';

import { AuthService, CurrentUser, UserPayload } from '../../core/auth.service';
import { ModuleKey, OPTIONAL_MODULES } from '../../core/modules';
import { httpErrorMessage } from '../../shared/http-error';

/**
 * Criar (sem `user`) ou editar (com `user`) uma conta pelo painel de Administração. Novo usuário
 * começa sem nenhum módulo opcional marcado -- só Início, que é sempre habilitado.
 */
@Component({
  selector: 'app-admin-usuario-modal',
  templateUrl: './admin-usuario-modal.component.html',
  styleUrls: ['./admin-usuario-modal.component.scss'],
  imports: [
    ReactiveFormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonContent,
    IonItem,
    IonInput,
    IonList,
    IonLabel,
    IonToggle,
    IonText,
  ],
})
export class AdminUsuarioModalComponent implements OnInit {
  @Input() user?: CurrentUser;

  readonly optionalModules = OPTIONAL_MODULES;
  readonly selectedModules = signal<Set<ModuleKey>>(new Set());
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    username: this.fb.nonNullable.control('', Validators.required),
    firstName: this.fb.nonNullable.control('', Validators.required),
    lastName: this.fb.nonNullable.control('', Validators.required),
    password: this.fb.nonNullable.control(''),
    confirmPassword: this.fb.nonNullable.control(''),
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly auth: AuthService,
    private readonly modalCtrl: ModalController,
  ) {
    addIcons({ close, pulseOutline });
  }

  get isEdit(): boolean {
    return this.user != null;
  }

  get isMasterUser(): boolean {
    return this.user?.role === 'master';
  }

  /**
   * O JWT carrega o username -- trocar o próprio username por aqui invalidaria a sessão atual
   * sem reemitir o token. Pra própria conta, o username é trocado pelo Perfil (PUT /auth/me).
   */
  get isSelf(): boolean {
    return this.user != null && this.user.id === this.auth.currentUser()?.id;
  }

  ngOnInit(): void {
    if (this.user) {
      this.form.reset({
        username: this.user.username,
        firstName: this.user.first_name,
        lastName: this.user.last_name,
        password: '',
        confirmPassword: '',
      });
      this.selectedModules.set(new Set(this.user.modules));
    }
    if (this.isSelf) {
      this.form.controls.username.disable();
    }
  }

  isModuleSelected(key: ModuleKey): boolean {
    return this.isMasterUser || this.selectedModules().has(key);
  }

  toggleModule(key: ModuleKey, checked: boolean): void {
    this.selectedModules.update((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }

  dismiss(): void {
    this.modalCtrl.dismiss();
  }

  submit(): void {
    this.errorMessage.set(null);
    const { username, firstName, lastName, password, confirmPassword } = this.form.getRawValue();
    if (!username.trim() || !firstName.trim() || !lastName.trim()) {
      this.errorMessage.set('Preencha usuário, nome e sobrenome.');
      return;
    }
    if (!this.isEdit && !password) {
      this.errorMessage.set('Defina uma senha inicial.');
      return;
    }
    if (password && password.length < 6) {
      this.errorMessage.set('A senha precisa ter no mínimo 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      this.errorMessage.set('As senhas não coincidem.');
      return;
    }

    const payload: UserPayload = {
      username: username.trim(),
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      password: password || undefined,
      // Na ordem do registro, pra ficar estável independente da ordem em que foram marcados
      modules: OPTIONAL_MODULES.map((m) => m.key).filter((key) => this.selectedModules().has(key)),
    };

    this.saving.set(true);
    const request = this.user ? this.auth.updateUser(this.user.id, payload) : this.auth.createUser(payload);
    request.subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.modalCtrl.dismiss(saved, 'saved');
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMessage.set(
          err?.status === 400 ? 'Esse nome de usuário já existe.' : httpErrorMessage(err, 'Erro ao salvar usuário.'),
        );
      },
    });
  }
}
