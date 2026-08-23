import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';

import { environment } from '../../environments/environment';

export interface CurrentUser {
  id: number;
  username: string;
  role: 'master' | 'user';
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
    return this.http.put<{ detail: string }>(`${environment.apiUrl}/auth/me/password`, {
      current_password: currentPassword,
      new_password: newPassword,
    });
  }

  createUser(username: string, password: string): Observable<CurrentUser> {
    return this.http.post<CurrentUser>(`${environment.apiUrl}/auth/users`, { username, password });
  }

  listUsers(): Observable<CurrentUser[]> {
    return this.http.get<CurrentUser[]>(`${environment.apiUrl}/auth/users`);
  }

  updateUser(id: number, username: string, password?: string): Observable<CurrentUser> {
    return this.http.put<CurrentUser>(`${environment.apiUrl}/auth/users/${id}`, {
      username,
      password: password || undefined,
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
