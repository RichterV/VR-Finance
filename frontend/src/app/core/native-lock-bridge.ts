import { Injectable } from '@angular/core';
import { BiometricAuth, BiometryError, BiometryErrorType } from '@aparajita/capacitor-biometric-auth';
import { SecureStorage } from '@aparajita/capacitor-secure-storage';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

/** Mesma chave gravada pelo login quando o usuário ativa o login por digital (ver LoginPage). */
export const BIOMETRIC_ENABLED_KEY = 'biometric_login_enabled';

/**
 * Tudo que o bloqueio do app (AppLockService) precisa dos plugins nativos, atrás de uma classe
 * injetável -- as specs trocam por um mock via DI (o test runner do Angular não suporta `vi.mock`).
 */
@Injectable({ providedIn: 'root' })
export class NativeLockBridge {
  isNative(): boolean {
    return Capacitor.isNativePlatform();
  }

  onAppStateChange(listener: (isActive: boolean) => void): void {
    void App.addListener('appStateChange', ({ isActive }) => listener(isActive));
  }

  minimizeApp(): void {
    void App.minimizeApp();
  }

  /** Digital, com o PIN/padrão do Android como plano B. 'cancel' = usuário desistiu (não é erro). */
  async authenticate(): Promise<'ok' | 'cancel'> {
    try {
      await BiometricAuth.authenticate({
        reason: 'Desbloqueie para continuar no VR Finance',
        cancelTitle: 'Cancelar',
        allowDeviceCredential: true,
        androidTitle: 'VR Finance bloqueado',
        androidSubtitle: 'Use sua digital ou o bloqueio de tela',
      });
      return 'ok';
    } catch (err) {
      if (err instanceof BiometryError && err.code === BiometryErrorType.userCancel) {
        return 'cancel';
      }
      throw err;
    }
  }

  /** O aparelho tem alguma trava (digital, PIN, padrão) que dê pra pedir? */
  async canAuthenticate(): Promise<boolean> {
    try {
      const result = await BiometricAuth.checkBiometry();
      return result.isAvailable || result.deviceIsSecure;
    } catch {
      return false;
    }
  }

  async isBiometricLoginEnabled(): Promise<boolean> {
    try {
      return (await SecureStorage.get(BIOMETRIC_ENABLED_KEY)) === true;
    } catch {
      return false;
    }
  }
}
