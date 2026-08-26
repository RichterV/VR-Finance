import { inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of, timeout } from 'rxjs';

import { AuthService } from './auth.service';

/**
 * Sem isso, com o servidor fora do ar (ex: celular desligado), essa checagem de boot ficava
 * esperando a resposta indefinidamente -- o WebView nunca chegava a ativar nenhuma rota, ficando
 * preso numa tela em branco (o fundo padrão do Android por trás do app, não o tema escuro do
 * próprio app) em vez de mostrar login ou qualquer feedback.
 */
const AUTH_CHECK_TIMEOUT_MS = 10000;

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.token) {
    router.navigateByUrl('/login');
    return false;
  }

  if (auth.currentUser()) {
    return true;
  }

  return auth.loadCurrentUser().pipe(
    timeout(AUTH_CHECK_TIMEOUT_MS),
    map(() => true),
    catchError((err: unknown) => {
      // 401/403 = token inválido/expirado -> desloga de verdade. Qualquer outra coisa (timeout,
      // status 0, 5xx) é o servidor fora do ar, não uma credencial ruim -- mantém o token (pode
      // ainda ser válido) e manda pra tela de erro em vez de forçar login de novo.
      if (err instanceof HttpErrorResponse && (err.status === 401 || err.status === 403)) {
        auth.logout();
      } else {
        router.navigateByUrl('/servidor-indisponivel');
      }
      return of(false);
    }),
  );
};

export const masterGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isMaster) {
    return true;
  }
  router.navigateByUrl('/home');
  return false;
};
