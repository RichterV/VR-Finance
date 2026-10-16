import { Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { of, switchMap } from 'rxjs';

import { AvatarService } from '../core/avatar.service';

/**
 * Bolinha de foto de perfil. Com foto (`version`), mostra a foto redonda; sem foto, as `initials`
 * (ou nada, se `initials` vier vazio -- ex: lista do admin, que só mostra quem tem foto).
 * `userId` null = a própria conta.
 */
@Component({
  selector: 'app-user-avatar',
  template: `
    @if (src(); as url) {
      <img class="avatar-img" [src]="url" [alt]="alt()" [style.width.px]="size()" [style.height.px]="size()" />
    } @else if (initials()) {
      <span class="avatar-initials" aria-hidden="true" [style.width.px]="size()" [style.height.px]="size()" [style.font-size.px]="fontSize()">{{ initials() }}</span>
    }
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        flex-shrink: 0;
      }
      .avatar-img {
        display: block;
        border-radius: 50%;
        object-fit: cover;
        background: var(--app-surface-raised);
      }
      .avatar-initials {
        display: grid;
        place-items: center;
        border-radius: 50%;
        background: rgba(var(--ion-color-primary-rgb), 0.15);
        color: var(--ion-color-primary);
        font-weight: 600;
        letter-spacing: 0.02em;
      }
    `,
  ],
})
export class UserAvatarComponent {
  readonly userId = input<number | null>(null);
  readonly version = input<number | null | undefined>(null);
  readonly initials = input('');
  readonly size = input(34);
  /** Texto alternativo da foto (ex: "Foto de Ana"); vazio = decorativa, o nome já está ao lado. */
  readonly alt = input('');

  private readonly avatars = inject(AvatarService);
  readonly fontSize = computed(() => Math.max(10, Math.round(this.size() * 0.36)));

  private readonly key = computed(() => ({ userId: this.userId(), version: this.version() ?? null }));
  readonly src = toSignal(
    toObservable(this.key).pipe(
      switchMap(({ userId, version }) => (version === null ? of(null) : this.avatars.url(userId, version))),
    ),
    { initialValue: null },
  );
}
