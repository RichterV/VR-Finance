import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

import { AuthService } from './auth.service';

const TOKEN_KEY = 'vrfinance_token';
/** detail do 403 que o backend devolve enquanto a troca obrigatória de senha estiver pendente. */
export const PASSWORD_CHANGE_REQUIRED_DETAIL = 'Troca de senha obrigatória antes de continuar';

/**
 * Injeta o token e trata, num lugar só, sessão expirada/revogada (401 → logout) e troca de senha
 * pendente (403 → /trocar-senha). Antes o 401 só era percebido ao navegar (authGuard): com a tela
 * parada, as chamadas falhavam em silêncio.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const token = localStorage.getItem(TOKEN_KEY);
  const isLogin = req.url.endsWith('/auth/login');
  const request = token && !isLogin ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(request).pipe(
    catchError((err: unknown) => {
      // Só reage se o token usado ainda é o guardado: depois do primeiro logout (ou de um token novo
      // vindo do Perfil), as outras requisições que voltam com 401 não disparam nada de novo.
      if (err instanceof HttpErrorResponse && token && !isLogin && localStorage.getItem(TOKEN_KEY) === token) {
        if (err.status === 401) {
          auth.logout();
        } else if (err.status === 403 && err.error?.detail === PASSWORD_CHANGE_REQUIRED_DETAIL) {
          void router.navigateByUrl('/trocar-senha');
        }
      }
      return throwError(() => err);
    }),
  );
};
