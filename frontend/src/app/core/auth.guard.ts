import { inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { catchError, map, of, timeout } from 'rxjs';

import { AuthService, CurrentUser } from './auth.service';
import { ModuleKey } from './modules';

/**
 * Sem isso, com o servidor fora do ar (ex: celular desligado), essa checagem de boot ficava
 * esperando a resposta indefinidamente -- o WebView nunca chegava a ativar nenhuma rota, ficando
 * preso numa tela em branco (o fundo padrão do Android por trás do app, não o tema escuro do
 * próprio app) em vez de mostrar login ou qualquer feedback.
 */
const AUTH_CHECK_TIMEOUT_MS = 10000;

/**
 * Garante o usuário atual carregado (do cache ou via /auth/me) e decide pra onde ir:
 * `onUser` recebe o usuário e devolve true (segue) ou uma URL de redirecionamento.
 */
function withCurrentUser(onUser: (user: CurrentUser) => true | string) {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.token) {
    router.navigateByUrl('/login');
    return false;
  }

  const decide = (user: CurrentUser): boolean => {
    const result = onUser(user);
    if (result === true) return true;
    router.navigateByUrl(result);
    return false;
  };

  const cached = auth.currentUser();
  if (cached) {
    return decide(cached);
  }

  return auth.loadCurrentUser().pipe(
    timeout(AUTH_CHECK_TIMEOUT_MS),
    map((user) => decide(user)),
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
}

/** App principal: exige login e, se a senha foi definida pelo master, manda pra troca obrigatória. */
export const authGuard: CanActivateFn = () =>
  withCurrentUser((user) => (user.must_change_password ? '/trocar-senha' : true));

/** Tela de troca obrigatória de senha: só faz sentido enquanto a troca estiver pendente. */
export const passwordChangeGuard: CanActivateFn = () =>
  withCurrentUser((user) => (user.must_change_password ? true : '/home'));

export const masterGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isMaster) {
    return true;
  }
  router.navigateByUrl('/home');
  return false;
};

/**
 * Bloqueia uma rota de módulo opcional (`data: { module: 'veiculos' }`) pra quem não tem o
 * módulo habilitado -- manda pra Home. Roda depois do authGuard da rota pai, então o usuário
 * atual já está carregado. O backend também barra (403) os endpoints do módulo.
 */
export const moduleGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const module = route.data['module'] as ModuleKey;

  if (auth.hasModule(module)) {
    return true;
  }
  router.navigateByUrl('/home');
  return false;
};
