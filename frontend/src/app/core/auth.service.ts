import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import { ModuleKey } from './modules';
import { renameSavedCredentials, updateSavedPassword } from './saved-credentials';

export interface CurrentUser {
  id: number;
  username: string;
  role: 'master' | 'user';
  first_name: string;
  last_name: string;
  /** Módulos opcionais habilitados (master sempre recebe todos do backend). */
  modules: ModuleKey[];
  /** Senha definida pelo master (criação/reset) -- precisa trocar antes de usar o app. */
  must_change_password: boolean;
}

export interface UserPayload {
  username: string;
  first_name: string;
  last_name: string;
  password?: string;
  modules: ModuleKey[];
}

interface ProfileUpdateResponse {
  access_token: string;
  token_type: string;
  user: CurrentUser;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
}

const TOKEN_KEY = 'vrfinance_token';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly currentUserSignal = signal<CurrentUser | null>(null);
  readonly currentUser = this.currentUserSignal.asReadonly();

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router,
  ) {}

  get token(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  get isMaster(): boolean {
    return this.currentUserSignal()?.role === 'master';
  }

  hasModule(key: ModuleKey): boolean {
    return this.currentUserSignal()?.modules.includes(key) ?? false;
  }

  login(username: string, password: string): Observable<TokenResponse> {
    const body = new URLSearchParams();
    body.set('username', username);
    body.set('password', password);

    return this.http
      .post<TokenResponse>(`${environment.apiUrl}/auth/login`, body.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
      .pipe(tap((res) => localStorage.setItem(TOKEN_KEY, res.access_token)));
  }

  loadCurrentUser(): Observable<CurrentUser> {
    return this.http
      .get<CurrentUser>(`${environment.apiUrl}/auth/me`)
      .pipe(tap((user) => this.currentUserSignal.set(user)));
  }

  changePassword(currentPassword: string, newPassword: string): Observable<{ detail: string }> {
    return this.http
      .put<{ detail: string }>(`${environment.apiUrl}/auth/me/password`, {
        current_password: currentPassword,
        new_password: newPassword,
      })
      .pipe(
        tap(() => {
          const user = this.currentUserSignal();
          if (!user) return;
          void updateSavedPassword(user.username, newPassword);
          if (user.must_change_password) {
            this.currentUserSignal.set({ ...user, must_change_password: false });
          }
        }),
      );
  }

  /**
   * Usuário logado editando a própria conta. O JWT carrega o username, então trocar o username
   * invalida o token antigo -- o backend já devolve um novo, que substitui o guardado aqui.
   */
  updateProfile(username: string, firstName: string, lastName: string): Observable<ProfileUpdateResponse> {
    const oldUsername = this.currentUserSignal()?.username;
    return this.http
      .put<ProfileUpdateResponse>(`${environment.apiUrl}/auth/me`, {
        username,
        first_name: firstName,
        last_name: lastName,
      })
      .pipe(
        tap((res) => {
          localStorage.setItem(TOKEN_KEY, res.access_token);
          this.currentUserSignal.set(res.user);
          if (oldUsername) void renameSavedCredentials(oldUsername, res.user.username);
        }),
      );
  }

  createUser(payload: UserPayload): Observable<CurrentUser> {
    return this.http.post<CurrentUser>(`${environment.apiUrl}/auth/users`, payload);
  }

  listUsers(): Observable<CurrentUser[]> {
    return this.http.get<CurrentUser[]>(`${environment.apiUrl}/auth/users`);
  }

  updateUser(id: number, payload: UserPayload): Observable<CurrentUser> {
    return this.http.put<CurrentUser>(`${environment.apiUrl}/auth/users/${id}`, {
      ...payload,
      password: payload.password || undefined,
    });
  }

  deleteUser(id: number): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/auth/users/${id}`);
  }

  switchToTeste(): Observable<TokenResponse> {
    return this.http
      .post<TokenResponse>(`${environment.apiUrl}/auth/switch-to-teste`, {})
      .pipe(tap((res) => localStorage.setItem(TOKEN_KEY, res.access_token)));
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    this.currentUserSignal.set(null);
    this.router.navigateByUrl('/login');
  }
}
