import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, shareReplay } from 'rxjs';

import { environment } from '../../environments/environment';

/**
 * Foto de perfil como `blob:` URL. O endpoint exige o token (`<img src>` não manda o header), então a
 * imagem vem pelo HttpClient, como os anexos. Uma requisição por usuário + versão: a versão muda a
 * cada foto nova, e a URL da versão anterior do mesmo usuário é liberada.
 */
@Injectable({ providedIn: 'root' })
export class AvatarService {
  private readonly http = inject(HttpClient);
  /** chave "me" ou id do usuário -> versão carregada e a URL dela. */
  private readonly cache = new Map<string, { version: number; url$: Observable<string | null>; url?: string }>();

  /** `userId` null = a própria foto (`/auth/me/avatar`); outro id = só o master (`/auth/users/{id}/avatar`). */
  url(userId: number | null, version: number): Observable<string | null> {
    const key = userId === null ? 'me' : String(userId);
    const hit = this.cache.get(key);
    if (hit && hit.version === version) return hit.url$;
    if (hit?.url) URL.revokeObjectURL(hit.url);

    const path = userId === null ? '/auth/me/avatar' : `/auth/users/${userId}/avatar`;
    const entry: { version: number; url$: Observable<string | null>; url?: string } = { version, url$: of(null) };
    entry.url$ = this.http.get(`${environment.apiUrl}${path}`, { responseType: 'blob' }).pipe(
      map((blob) => {
        entry.url = URL.createObjectURL(blob);
        return entry.url;
      }),
      // Sem foto (404) ou falha de rede: quem mostra cai nas iniciais.
      catchError(() => of(null)),
      shareReplay(1),
    );
    this.cache.set(key, entry);
    return entry.url$;
  }
}
