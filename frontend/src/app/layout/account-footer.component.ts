import { Component, computed, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { IonIcon } from '@ionic/angular';

import { CurrentUser } from '../core/auth.service';

/**
 * Rodapé do menu lateral com o que é da conta e da configuração -- separado da lista de módulos,
 * pra nada aqui parecer módulo (pedido do usuário). Cartão do usuário (abre o Perfil) e uma linha de
 * atalhos pequenos: Categorias, Administração (só master) e Sair. Usado no menu do desktop e no do
 * celular.
 */
@Component({
  selector: 'app-account-footer',
  imports: [RouterLink, RouterLinkActive, IonIcon],
  template: `
    @if (user(); as u) {
      <button type="button" class="account-card" (click)="perfil.emit()" title="Abrir o Perfil">
        <span class="avatar" aria-hidden="true">{{ iniciais() }}</span>
        <span class="account-text">
          <span class="account-name">{{ nomeCompleto() }}</span>
          <span class="account-sub">{{ u.username }} · {{ u.role === 'master' ? 'Master' : 'Usuário' }}</span>
        </span>
        <ion-icon name="chevron-forward" class="chevron" aria-hidden="true"></ion-icon>
      </button>
    }
    <div class="account-actions">
      <button type="button" class="account-action" (click)="categorias.emit()">
        <ion-icon name="pricetags-outline" aria-hidden="true"></ion-icon>
        <span>Categorias</span>
      </button>
      @if (user()?.role === 'master') {
        <a class="account-action" routerLink="/admin" routerLinkActive="active" (click)="navegou.emit()">
          <ion-icon name="shield-checkmark-outline" aria-hidden="true"></ion-icon>
          <span>Admin</span>
        </a>
      }
      <button type="button" class="account-action danger" (click)="sair.emit()">
        <ion-icon name="log-out-outline" aria-hidden="true"></ion-icon>
        <span>Sair</span>
      </button>
    </div>
  `,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 12px;
        border-top: 1px solid var(--app-surface-border);
      }

      .account-card {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 8px 10px;
        border: none;
        border-radius: var(--r-md);
        background: transparent;
        color: var(--app-text-primary);
        font: inherit;
        text-align: left;
        cursor: pointer;

        &:hover {
          background: var(--app-surface-hover);
        }
      }

      .avatar {
        flex-shrink: 0;
        width: 34px;
        height: 34px;
        border-radius: 50%;
        display: grid;
        place-items: center;
        background: rgba(var(--ion-color-primary-rgb), 0.15);
        color: var(--ion-color-primary);
        font-size: var(--fs-xs);
        font-weight: 600;
        letter-spacing: 0.02em;
      }

      .account-text {
        display: flex;
        flex-direction: column;
        min-width: 0;
        flex: 1;
      }

      .account-name {
        font-size: var(--fs-sm);
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .account-sub {
        font-size: var(--fs-xs);
        color: var(--app-text-secondary);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .chevron {
        flex-shrink: 0;
        font-size: var(--fs-md);
        color: var(--app-text-secondary);
      }

      .account-actions {
        display: flex;
        gap: 4px;
      }

      .account-action {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 3px;
        padding: 7px 4px;
        border: none;
        border-radius: var(--r-sm);
        background: transparent;
        color: var(--app-text-secondary);
        font: inherit;
        font-size: var(--fs-xs);
        text-decoration: none;
        cursor: pointer;

        ion-icon {
          font-size: 1.05rem;
        }

        &:hover {
          background: var(--app-surface-hover);
          color: var(--app-text-primary);
        }

        &.active {
          color: var(--ion-color-primary);
        }

        &.danger:hover {
          color: var(--ion-color-danger);
        }
      }
    `,
  ],
})
export class AccountFooterComponent {
  readonly user = input<CurrentUser | null>(null);
  readonly perfil = output<void>();
  readonly categorias = output<void>();
  readonly sair = output<void>();
  /** Navegou pra Administração (o menu do celular fecha). */
  readonly navegou = output<void>();

  readonly nomeCompleto = computed(() => {
    const u = this.user();
    return u ? `${u.first_name} ${u.last_name}`.trim() || u.username : '';
  });

  readonly iniciais = computed(() => {
    const u = this.user();
    if (!u) return '';
    const partes = [u.first_name, u.last_name].filter(Boolean);
    const letras = partes.length ? partes.map((p) => p[0]) : [u.username[0]];
    return letras.join('').slice(0, 2).toUpperCase();
  });
}
