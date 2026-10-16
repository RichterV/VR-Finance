import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

import { environment } from '../../environments/environment';

/**
 * Escolha do endereço do servidor no app Android: tenta primeiro o IP da rede local
 * (`environment.localApiUrl`, HTTP direto no nginx do servidor) e, se não responder, cai pro
 * endereço padrão (`environment.apiUrl`, HTTPS via Tailscale). Os services continuam montando as
 * URLs com `environment.apiUrl` — o interceptor abaixo só troca o prefixo quando a rede local
 * está em uso. Sem `localApiUrl` (build web/dev), nada disso roda.
 */

const PROBE_TIMEOUT_MS = 1500;

let currentBase = environment.apiUrl;
let probing: Promise<void> | null = null;

/** Testa o `/health` da rede local; decide o endereço usado pelas próximas requisições. */
export function probeLocalServer(): Promise<void> {
  const local = environment.localApiUrl;
  if (!local) {
    return Promise.resolve();
  }
  probing ??= (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      const res = await fetch(`${local}/health`, { signal: controller.signal, cache: 'no-store' });
      currentBase = res.ok ? local : environment.apiUrl;
    } catch {
      currentBase = environment.apiUrl;
    } finally {
      clearTimeout(timer);
      probing = null;
    }
  })();
  return probing;
}

/**
 * Roda no startup (espera no máximo PROBE_TIMEOUT_MS) e de novo sempre que o app volta pro
 * primeiro plano ou a rede muda — é quando o celular costuma entrar/sair do Wi-Fi de casa.
 */
export function initServerSelection(): Promise<void> {
  if (!environment.localApiUrl) {
    return Promise.resolve();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void probeLocalServer();
    }
  });
  window.addEventListener('online', () => void probeLocalServer());
  return probeLocalServer();
}

export const apiBaseInterceptor: HttpInterceptorFn = (req, next) => {
  const local = environment.localApiUrl;
  if (!local || currentBase !== local || !req.url.startsWith(environment.apiUrl)) {
    return next(req);
  }
  const path = req.url.slice(environment.apiUrl.length);
  return next(req.clone({ url: local + path })).pipe(
    catchError((err: unknown) => {
      // status 0 = não chegou no servidor (saiu do Wi-Fi de casa): passa pro Tailscale. Só
      // repete sozinho leitura — um POST/PUT/DELETE pode ter chegado a ser gravado antes da
      // conexão cair, e repetir criaria duplicata; esses devolvem o erro (a próxima tentativa já
      // vai pelo Tailscale).
      if (err instanceof HttpErrorResponse && err.status === 0) {
        currentBase = environment.apiUrl;
        if (req.method === 'GET' || req.method === 'HEAD') {
          return next(req);
        }
      }
      return throwError(() => err);
    }),
  );
};
