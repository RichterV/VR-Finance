import { SecureStorage } from '@aparajita/capacitor-secure-storage';

/** Credencial lembrada pelo "Lembrar usuário e senha" do login (ver LoginPage). */
export const CREDENTIALS_KEY = 'login_credentials';

export interface SavedCredentials {
  username: string;
  password: string;
}

/**
 * Depois que o usuário troca o próprio username no Perfil, a credencial lembrada (e o login por
 * digital, que reenvia essa credencial) passaria a falhar com o username antigo -- atualiza só o
 * username, se a credencial guardada for mesmo daquela conta.
 */
export async function renameSavedCredentials(oldUsername: string, newUsername: string): Promise<void> {
  if (oldUsername === newUsername) return;
  try {
    const saved = (await SecureStorage.get(CREDENTIALS_KEY)) as SavedCredentials | null;
    if (saved?.username === oldUsername) {
      await SecureStorage.set(CREDENTIALS_KEY, { ...saved, username: newUsername } satisfies SavedCredentials);
    }
  } catch {
    // Storage indisponível: no pior caso o usuário digita o username novo no próximo login.
  }
}

/** Mesma ideia de renameSavedCredentials, pra quando o usuário troca a própria senha. */
export async function updateSavedPassword(username: string, newPassword: string): Promise<void> {
  try {
    const saved = (await SecureStorage.get(CREDENTIALS_KEY)) as SavedCredentials | null;
    if (saved?.username === username) {
      await SecureStorage.set(CREDENTIALS_KEY, { ...saved, password: newPassword } satisfies SavedCredentials);
    }
  } catch {
    // Storage indisponível: no pior caso o usuário digita a senha nova no próximo login.
  }
}
