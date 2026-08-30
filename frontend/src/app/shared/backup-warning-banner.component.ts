import { Component, OnInit, computed, signal } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { warningOutline } from 'ionicons/icons';

import { AuthService } from '../core/auth.service';
import { BackupStatusService } from '../services/backup-status.service';

export const BACKUP_WARNING_THRESHOLD_DAYS = 30;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Aviso fixo no topo da tela lembrando de fazer backup do servidor -- só aparece pro usuário
 * master (admin), quando já se passaram 30+ dias desde o último backup registrado. O
 * timestamp vem de `GET /backup-status`, que lê um arquivo gravado pelo menu.bat (opção 4) via
 * SSH direto no servidor logo após um backup bem-sucedido -- é assim que o aviso "some" e o
 * contador reinicia, sem o menu.bat precisar de login na API.
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
        position: sticky;
        top: 0;
        z-index: 1000;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        padding: 10px 16px;
        background: linear-gradient(90deg, #b45309, #dc2626);
        color: #fff;
        font-size: 0.85rem;
        font-weight: 600;
        text-align: center;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
      }
      .backup-warning ion-icon {
        font-size: 1.1rem;
        flex-shrink: 0;
      }
    `,
  ],
})
export class BackupWarningBannerComponent implements OnInit {
  private readonly checked = signal(false);
  /** null só é válido depois de checked()=true -- significa "nunca fez backup" (não "ainda não checou"). */
  private readonly daysSince = signal<number | null>(null);

  readonly visible = computed(() => {
    if (!this.checked()) return false;
    const days = this.daysSince();
    return days === null || days >= BACKUP_WARNING_THRESHOLD_DAYS;
  });

  readonly message = computed(() => {
    const days = this.daysSince();
    if (days === null) {
      return 'Nenhum backup do servidor foi registrado ainda. Rode o backup pelo menu.bat (opção 4) o quanto antes.';
    }
    return `Já se passaram ${days} dias desde o último backup do servidor. Rode o backup pelo menu.bat (opção 4).`;
  });

  constructor(
    private readonly auth: AuthService,
    private readonly backupStatusService: BackupStatusService,
  ) {
    addIcons({ warningOutline });
  }

  ngOnInit(): void {
    if (!this.auth.isMaster) return;
    this.backupStatusService.check().subscribe((status) => {
      this.daysSince.set(
        status.last_backup_at ? Math.floor((Date.now() - new Date(status.last_backup_at).getTime()) / MS_PER_DAY) : null,
      );
      this.checked.set(true);
    });
  }
}
