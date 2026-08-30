import { Component, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { AlertController, IonCheckbox, IonContent, IonItem, IonInput, IonButton, IonText, IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { fingerPrint } from 'ionicons/icons';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { BiometricAuth, BiometryError, BiometryErrorType } from '@aparajita/capacitor-biometric-auth';
import { Capacitor } from '@capacitor/core';
import { timeout } from 'rxjs';

import { AuthService } from '../../core/auth.service';

const LOGIN_TIMEOUT_MS = 15000;
const CREDENTIALS_KEY = 'login_credentials';
/** Chave antiga (texto puro, pre-Secure Storage) -- removida se ainda existir, pra nao deixar senha em texto puro no dispositivo. */
const LEGACY_CREDENTIALS_KEY = 'vrfinance_saved_credentials';
const BIOMETRIC_ENABLED_KEY = 'biometric_login_enabled';

interface SavedCredentials {
  username: string;
  password: string;
}

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  imports: [ReactiveFormsModule, IonContent, IonItem, IonInput, IonButton, IonText, IonCheckbox, IonIcon],
})
export class LoginPage {
  readonly form = this.fb.nonNullable.group({
    username: ['', Validators.required],
    password: ['', Validators.required],
  });

  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly lembrarCredenciais = signal(false);
  /** Quando true, mostra a tela de "toque pra entrar com digital" no lugar do formulário. */
  readonly showBiometricGate = signal(false);
  readonly biometricBusy = signal(false);

  private readonly isNative = Capacitor.isNativePlatform();
  private savedCredentials: SavedCredentials | null = null;

  constructor(
    private readonly fb: FormBuilder,
    private readonly auth: AuthService,
    private readonly alertCtrl: AlertController,
  ) {
    addIcons({ fingerPrint });
  }

  /**
   * O ion-router-outlet mantem a pagina de login viva em cache (pra animacao de voltar) em vez de
   * recria-la -- sem isso, um logout reexibe a mesma instancia com o estado (loading, erro, campos)
   * de antes da ultima tentativa de login.
   */
  ionViewWillEnter(): void {
    this.loading.set(false);
    this.errorMessage.set(null);
    this.biometricBusy.set(false);
    localStorage.removeItem(LEGACY_CREDENTIALS_KEY);
    void this.initLoginState();
  }

  private async initLoginState(): Promise<void> {
    const saved = await this.readSavedCredentials();
    this.savedCredentials = saved;
    this.form.reset({ username: saved?.username ?? '', password: saved?.password ?? '' });
    this.lembrarCredenciais.set(!!saved);

    // O gate por digital só entra em cena se houver credencial salva (é ela que vai ser reenviada
    // pro /auth/login de verdade depois do fingerprint) e o usuário já tiver optado por ativá-lo.
    if (saved && this.isNative && (await this.readBiometricEnabled()) && (await this.checkBiometryAvailable())) {
      this.showBiometricGate.set(true);
      void this.unlockWithBiometrics();
      return;
    }
    this.showBiometricGate.set(false);
  }

  /** Sai do gate por digital e volta pro formulário normal de usuário/senha. */
  useManualLogin(): void {
    this.showBiometricGate.set(false);
    this.errorMessage.set(null);
  }

  async unlockWithBiometrics(): Promise<void> {
    if (this.biometricBusy() || !this.savedCredentials) {
      return;
    }
    this.biometricBusy.set(true);
    this.errorMessage.set(null);

    try {
      await BiometricAuth.authenticate({
        reason: 'Confirme sua digital para entrar no VR Finance',
        cancelTitle: 'Cancelar',
        androidTitle: 'Login por digital',
        androidSubtitle: 'Confirme sua digital para continuar',
      });
      const { username, password } = this.savedCredentials;
      this.doLogin(username, password);
    } catch (err) {
      this.biometricBusy.set(false);
      // Cancelamento do usuário não é erro -- só volta pro botão, sem mensagem em vermelho.
      if (!(err instanceof BiometryError && err.code === BiometryErrorType.userCancel)) {
        this.errorMessage.set('Não foi possível verificar sua digital. Tente novamente ou entre com usuário e senha.');
      }
    }
  }

  submit(): void {
    if (this.form.invalid || this.loading()) {
      return;
    }
    const { username, password } = this.form.getRawValue();
    this.doLogin(username, password);
  }

  private doLogin(username: string, password: string): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    this.auth
      .login(username, password)
      .pipe(timeout(LOGIN_TIMEOUT_MS))
      .subscribe({
        next: () => {
          this.auth
            .loadCurrentUser()
            .pipe(timeout(LOGIN_TIMEOUT_MS))
            .subscribe({
              next: () => {
                void this.afterLoginSuccess(username, password).then(() => {
                  // Navegação "dura" (não via Router) -- garante um boot novo da SPA, sem nenhum
                  // estado (signals, instâncias de página cacheadas pelo IonicRouteStrategy) que
                  // possa ter sobrado de uma conta anterior nesta mesma aba/app (ex: depois de sair
                  // da conta "teste" sem passar pelo reload que "Mudar pra conta teste" já faz).
                  window.location.href = '/home';
                });
              },
              error: (err: unknown) => this.onLoginError(err),
            });
        },
        error: (err: unknown) => this.onLoginError(err),
      });
  }

  private onLoginError(err: unknown): void {
    this.loading.set(false);
    this.biometricBusy.set(false);
    // Uma credencial salva pode ter ficado inválida (senha trocada em outro dispositivo) --
    // volta pro formulário normal em vez de insistir no gate por digital.
    this.showBiometricGate.set(false);
    this.errorMessage.set(this.describeError(err));
  }

  /**
   * Depois de um login bem-sucedido (manual ou via digital): atualiza a credencial lembrada e, se
   * for a primeira vez logando manualmente num aparelho com biometria disponível, oferece ativar o
   * login por digital.
   */
  private async afterLoginSuccess(username: string, password: string): Promise<void> {
    await this.saveOrClearCredentials(username, password);
    if (this.isNative && this.lembrarCredenciais()) {
      await this.maybeOfferBiometricEnrollment();
    }
  }

  private async maybeOfferBiometricEnrollment(): Promise<void> {
    if ((await this.readBiometricEnabled()) || !(await this.checkBiometryAvailable())) {
      return;
    }

    const alert = await this.alertCtrl.create({
      header: 'Login por digital',
      message: 'Deseja usar sua digital para entrar da próxima vez, em vez de digitar usuário e senha?',
      buttons: [
        { text: 'Agora não', role: 'cancel' },
        {
          text: 'Ativar',
          handler: () => {
            void SecureStorage.set(BIOMETRIC_ENABLED_KEY, true);
          },
        },
      ],
    });
    await alert.present();
    await alert.onDidDismiss();
  }

  private async checkBiometryAvailable(): Promise<boolean> {
    if (!this.isNative) {
      return false;
    }
    try {
      const result = await BiometricAuth.checkBiometry();
      return result.isAvailable;
    } catch {
      return false;
    }
  }

  private async readBiometricEnabled(): Promise<boolean> {
    try {
      return (await SecureStorage.get(BIOMETRIC_ENABLED_KEY)) === true;
    } catch {
      return false;
    }
  }

  /**
   * No Android/iOS isso grava no Keystore/Keychain nativo (criptografado); no navegador desktop, o
   * proprio plugin cai de volta pra um localStorage sem criptografia (nao ha keychain de SO na web).
   */
  private async saveOrClearCredentials(username: string, password: string): Promise<void> {
    try {
      if (this.lembrarCredenciais()) {
        await SecureStorage.set(CREDENTIALS_KEY, { username, password } satisfies SavedCredentials);
      } else {
        // Sem credencial lembrada não há o que proteger com digital -- desativa junto.
        await SecureStorage.remove(CREDENTIALS_KEY);
        await SecureStorage.remove(BIOMETRIC_ENABLED_KEY);
      }
    } catch {
      // Falha ao acessar o storage seguro nao deve travar o login -- só significa que a credencial
      // não vai ser lembrada da próxima vez.
    }
  }

  private async readSavedCredentials(): Promise<SavedCredentials | null> {
    try {
      const data = await SecureStorage.get(CREDENTIALS_KEY);
      return (data as SavedCredentials | null) ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Diferencia credencial invalida (401) de servidor fora do ar/travado (status 0 ou timeout do
   * rxjs) -- antes qualquer falha, inclusive um backend travado sem nunca responder, caia no mesmo
   * "Usuário ou senha inválidos", mascarando problemas de infraestrutura como erro de digitação.
   */
  private describeError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 401) {
        return 'Usuário ou senha inválidos';
      }
      if (err.status === 0) {
        return 'Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.';
      }
      if (err.status >= 500) {
        return 'Servidor indisponível no momento. Tente novamente em alguns instantes.';
      }
      return `Erro ao entrar (código ${err.status}). Tente novamente.`;
    }
    return 'O servidor demorou demais para responder. Tente novamente em alguns instantes.';
  }
}
