import { Injectable, effect, inject, untracked } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';

import { DEFAULT_THEME, ThemeKey, activeTheme, isThemeKey } from '../shared/themes';
import { AuthService } from './auth.service';

/** Cópia local do último tema usado no aparelho -- lida também pelo script inline do index.html. */
export const THEME_STORAGE_KEY = 'vrfinance_tema';

/**
 * Tema visual por usuário (Perfil > Aparência). Aplicar = pôr `data-tema` no <html> (os tokens de cor
 * de theme/_temas.scss mudam na hora, sem recarregar) e atualizar o sinal `activeTheme`, que os
 * gráficos leem. A escolha fica salva no backend (vale em qualquer aparelho) e numa cópia local, que
 * o index.html aplica antes do app carregar -- o login e a abertura já saem com as cores certas.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly auth = inject(AuthService);

  readonly current = activeTheme.asReadonly();

  constructor() {
    this.apply(readStoredTheme() ?? DEFAULT_THEME);
    // Usuário carregado (login, abertura com token, troca de conta): passa a valer o tema dele.
    // Logout não muda nada -- o login seguinte mostra o último tema do aparelho.
    effect(() => {
      const theme = this.auth.currentUser()?.theme;
      if (isThemeKey(theme)) untracked(() => this.apply(theme));
    });
  }

  /** Escolha no Perfil: aplica na hora e salva. Se o servidor recusar, volta ao tema anterior. */
  choose(theme: ThemeKey): Observable<void> {
    const anterior = activeTheme();
    this.apply(theme);
    this.auth.patchCurrentUser({ theme });
    return this.auth.updateTheme(theme).pipe(
      map(() => undefined),
      catchError((err) => {
        if (activeTheme() === theme) {
          this.apply(anterior);
          this.auth.patchCurrentUser({ theme: anterior });
        }
        return throwError(() => err);
      }),
    );
  }

  private apply(theme: ThemeKey): void {
    activeTheme.set(theme);
    document.documentElement.setAttribute('data-tema', theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Sem armazenamento local (modo privado etc.): o tema continua valendo nesta sessão.
    }
  }
}

function readStoredTheme(): ThemeKey | null {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeKey(stored) ? stored : null;
  } catch {
    return null;
  }
}
