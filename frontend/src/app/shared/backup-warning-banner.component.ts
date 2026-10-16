import { Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { warningOutline } from 'ionicons/icons';

import { AuthService } from '../core/auth.service';
import { BackupStatusService } from '../services/backup-status.service';

export const BACKUP_WARNING_THRESHOLD_DAYS = 30;
export const BACKUP_WARNING_DURATION_MS = 5000;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Nível de módulo (não do componente): o layout principal é recriado a cada login, mas o aviso
 * só deve aparecer uma vez por abertura do app (carregamento da página/APK).
 */
let shownThisAppSession = false;

/** Só pra testes: volta ao estado de "app recém-aberto". */
export function resetBackupWarningSession(): void {
  shownThisAppSession = false;
}

/**
 * Aviso flutuante lembrando de fazer backup do servidor -- só aparece pro usuário master
 * (admin), quando já se passaram 30+ dias desde o último backup registrado. Aparece uma vez
 * só, ao abrir o app, e some sozinho depois de 5s. Fica sobreposto (position: fixed, embaixo) e
 * não captura toque/clique, pra nunca cobrir nem travar os botões do header no celular. O
 * timestamp vem de `GET /backup-status`, que lê um arquivo gravado pelo menu.sh (opção 4) via
 * SSH direto no servidor logo após um backup bem-sucedido -- é assim que o aviso "some" e o
 * contador reinicia, sem o menu.sh precisar de login na API.
 */
@Component({
  selector: 'app-backup-warning-banner',
  standalone: true,
  imports: [IonIcon],
  template: `
    @if (visible()) {
      <div class="backup-warning" role="alert">
        <ion-icon name="warning-outline"></ion-icon>
        <span>{{ message() }}</span>
      </div>
    }
  `,
  styles: [
    `
      .backup-warning {
        position: fixed;
        left: 50%;
        bottom: calc(16px + env(safe-area-inset-bottom, 0px));
        transform: translateX(-50%);
        width: max-content;
        max-width: calc(100vw - 32px);
        z-index: 30000;
        pointer-events: none;
        border-radius: var(--r-md);
        animation: backup-warning-life 5s ease forwards;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        padding: 10px 16px;
        background: linear-gradient(90deg, var(--ion-color-warning-shade), var(--ion-color-danger));
        color: var(--ion-color-danger-contrast);
        font-size: var(--fs-sm);
        font-weight: 600;
        text-align: center;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
      }
      @keyframes backup-warning-life {
        0% { opacity: 0; transform: translate(-50%, 12px); }
        6%, 90% { opacity: 1; transform: translate(-50%, 0); }
        100% { opacity: 0; transform: translate(-50%, 0); }
      }
      .backup-warning ion-icon {
        font-size: 1.1rem;
        flex-shrink: 0;
      }
    `,
  ],
})
export class BackupWarningBannerComponent implements OnInit, OnDestroy {
  private readonly checked = signal(false);
  private readonly expired = signal(false);
  private hideTimer?: ReturnType<typeof setTimeout>;
  /** null só é válido depois de checked()=true -- significa "nunca fez backup" (não "ainda não checou"). */
  private readonly daysSince = signal<number | null>(null);

  readonly visible = computed(() => {
    if (!this.checked() || this.expired()) return false;
    const days = this.daysSince();
    return days === null || days >= BACKUP_WARNING_THRESHOLD_DAYS;
  });

  readonly message = computed(() => {
    const days = this.daysSince();
    if (days === null) {
      return 'Nenhum backup do servidor foi registrado ainda. Rode o backup pelo menu.sh (opção 4) o quanto antes.';
    }
    return `Já se passaram ${days} dias desde o último backup do servidor. Rode o backup pelo menu.sh (opção 4).`;
  });

  constructor(
    private readonly auth: AuthService,
    private readonly backupStatusService: BackupStatusService,
  ) {
    addIcons({ warningOutline });
  }

  ngOnInit(): void {
    if (!this.auth.isMaster || shownThisAppSession) return;
    this.backupStatusService.check().subscribe((status) => {
      this.daysSince.set(
        status.last_backup_at ? Math.floor((Date.now() - new Date(status.last_backup_at).getTime()) / MS_PER_DAY) : null,
      );
      this.checked.set(true);
      if (this.visible()) {
        shownThisAppSession = true;
        this.hideTimer = setTimeout(() => this.expired.set(true), BACKUP_WARNING_DURATION_MS);
      }
    });
  }

  ngOnDestroy(): void {
    clearTimeout(this.hideTimer);
  }
}
