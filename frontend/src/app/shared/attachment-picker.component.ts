import { Component, EventEmitter, Input, OnInit, Output, computed, signal } from '@angular/core';
import { AlertController, IonIcon, IonLabel, IonText, ToastController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { add, documentOutline, trashOutline } from 'ionicons/icons';
import { Observable, forkJoin, of } from 'rxjs';

import { Attachment, AttachmentsService, EntityType } from '../services/attachments.service';
import {
  ALLOWED_ATTACHMENT_TYPES,
  extractHttpErrorMessage,
  formatFileSize,
  isAllowedAttachmentFile,
} from './attachment-types';

interface DisplayItem {
  key: string;
  name: string;
  sizeLabel: string;
  removable: boolean;
}

/**
 * Seletor de anexos (imagem/PDF) reusado nos modais de Adicionar (mode="create") e Editar
 * (mode="edit") dos 5 módulos com comprovantes. Em modo criação os arquivos ficam "em espera"
 * até o registro pai ser salvo (não existe id ainda) -- o modal pai chama commit(entityId) depois
 * que o create() dele resolve. Em modo edição o entityId já é conhecido, então cada arquivo sobe
 * imediatamente e pode ser removido a qualquer momento.
 */
@Component({
  selector: 'app-attachment-picker',
  standalone: true,
  imports: [IonLabel, IonIcon, IonText],
  template: `
    <div class="attachment-picker">
      <ion-label class="picker-label">Anexos (opcional)</ion-label>

      <button type="button" class="add-attachment-btn" [disabled]="uploading()" (click)="fileInput.click()">
        <ion-icon name="add"></ion-icon>
        <span>{{ uploading() ? 'Enviando...' : 'Adicionar arquivo' }}</span>
      </button>
      <input
        type="file"
        multiple
        [accept]="acceptAttr"
        [disabled]="uploading()"
        (change)="onFilesSelected($event)"
        #fileInput
        hidden
      />

      @if (errorMessage()) {
        <ion-text color="danger">
          <p class="attachment-error">{{ errorMessage() }}</p>
        </ion-text>
      }

      @if (displayItems().length) {
        <ul class="attachment-list">
          @for (item of displayItems(); track item.key) {
            <li>
              <ion-icon name="document-outline"></ion-icon>
              <span class="name">{{ item.name }}</span>
              <span class="size">{{ item.sizeLabel }}</span>
              @if (item.removable) {
                <button type="button" class="remove-btn" (click)="remove(item)" [disabled]="uploading()">
                  <ion-icon name="trash-outline"></ion-icon>
                </button>
              }
            </li>
          }
        </ul>
      }
    </div>
  `,
  styles: [
    `
      .attachment-picker {
        margin-bottom: 14px;
      }
      .picker-label {
        display: block;
        font-size: 0.8rem;
        color: var(--app-text-secondary);
        margin-bottom: 8px;
      }
      .add-attachment-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        border-radius: 20px;
        border: 1px dashed var(--app-surface-border);
        background: var(--app-surface-glass);
        color: var(--ion-color-primary);
        font-size: 0.85rem;
        font-weight: 500;
        cursor: pointer;
        transition: border-color 0.15s ease, background 0.15s ease;
      }
      .add-attachment-btn ion-icon {
        font-size: 1.1rem;
      }
      .add-attachment-btn:hover:not(:disabled) {
        border-color: var(--ion-color-primary);
        border-style: solid;
        background: rgba(99, 102, 241, 0.12);
      }
      .add-attachment-btn:disabled {
        opacity: 0.6;
        cursor: default;
      }
      .attachment-error {
        margin: 8px 0 0;
        font-size: 0.85rem;
      }
      .attachment-list {
        list-style: none;
        margin: 10px 0 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .attachment-list li {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 10px;
        border-radius: 10px;
        background: var(--app-surface-glass);
        border: 1px solid var(--app-surface-border);
        font-size: 0.85rem;
        color: var(--app-text-secondary);
      }
      .attachment-list ion-icon:first-child {
        flex-shrink: 0;
        font-size: 1rem;
        color: var(--ion-color-primary);
      }
      .attachment-list .name {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .attachment-list .size {
        flex-shrink: 0;
        opacity: 0.7;
      }
      .remove-btn {
        border: none;
        background: transparent;
        color: var(--app-text-secondary);
        padding: 4px;
        border-radius: 8px;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
        flex-shrink: 0;
      }
      .remove-btn ion-icon {
        font-size: 1rem;
      }
      .remove-btn:hover:not(:disabled) {
        color: var(--ion-color-danger);
      }
    `,
  ],
})
export class AttachmentPickerComponent implements OnInit {
  @Input({ required: true }) entityType!: EntityType;
  @Input() entityId: string | number | null = null;
  @Input() mode: 'create' | 'edit' = 'create';
  @Output() readonly filesChanged = new EventEmitter<void>();

  readonly acceptAttr = ALLOWED_ATTACHMENT_TYPES.join(',');
  readonly uploading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  private readonly pendingFiles = signal<File[]>([]);
  private readonly existingFiles = signal<Attachment[]>([]);

  readonly displayItems = computed<DisplayItem[]>(() => [
    ...this.existingFiles().map((a) => ({
      key: `existing-${a.id}`,
      name: a.original_filename,
      sizeLabel: formatFileSize(a.size_bytes),
      removable: true,
    })),
    ...this.pendingFiles().map((f, index) => ({
      key: `pending-${index}`,
      name: f.name,
      sizeLabel: formatFileSize(f.size),
      removable: this.mode === 'create',
    })),
  ]);

  constructor(
    private readonly attachmentsService: AttachmentsService,
    private readonly toastCtrl: ToastController,
    private readonly alertCtrl: AlertController,
  ) {
    addIcons({ documentOutline, trashOutline, add });
  }

  ngOnInit(): void {
    if (this.mode === 'edit' && this.entityId != null) {
      this.attachmentsService.list(this.entityType, this.entityId).subscribe((files) => this.existingFiles.set(files));
    }
  }

  onFilesSelected(ev: Event): void {
    this.errorMessage.set(null);
    const input = ev.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) return;

    const valid: File[] = [];
    for (const file of files) {
      if (!isAllowedAttachmentFile(file)) {
        this.errorMessage.set(`"${file.name}" não é um arquivo válido (só imagem ou PDF, até 10MB).`);
        continue;
      }
      valid.push(file);
    }
    if (!valid.length) return;

    if (this.mode === 'create') {
      this.pendingFiles.update((current) => [...current, ...valid]);
      return;
    }

    if (this.entityId == null) return;
    this.uploading.set(true);
    const entityId = this.entityId;
    forkJoin(valid.map((file) => this.attachmentsService.upload(this.entityType, entityId, file))).subscribe({
      next: (uploaded) => {
        this.uploading.set(false);
        this.existingFiles.update((current) => [...current, ...uploaded]);
        this.filesChanged.emit();
      },
      error: async (err) => {
        this.uploading.set(false);
        console.error('Erro ao enviar anexo', err);
        const toast = await this.toastCtrl.create({
          message: `Erro ao enviar anexo: ${extractHttpErrorMessage(err)}`,
          duration: 4000,
          color: 'danger',
        });
        await toast.present();
      },
    });
  }

  async remove(item: DisplayItem): Promise<void> {
    if (item.key.startsWith('pending-')) {
      // Ainda não foi enviado pra nenhum lugar -- só descarta da seleção local, nada irreversível.
      const index = Number(item.key.slice('pending-'.length));
      this.pendingFiles.update((current) => current.filter((_, i) => i !== index));
      return;
    }

    const id = Number(item.key.slice('existing-'.length));
    const alert = await this.alertCtrl.create({
      header: 'Excluir anexo',
      message: `Excluir o anexo "${item.name}"? Essa ação não pode ser desfeita.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Excluir',
          role: 'destructive',
          handler: () => {
            this.attachmentsService.remove(id).subscribe(() => {
              this.existingFiles.update((current) => current.filter((a) => a.id !== id));
              this.filesChanged.emit();
            });
          },
        },
      ],
    });
    await alert.present();
  }

  /** Chamado pelo modal de Adicionar depois que create() resolve e o id/group id já é conhecido. */
  commit(entityId: string | number): Observable<Attachment[]> {
    const files = this.pendingFiles();
    if (!files.length) return of([]);
    return forkJoin(files.map((file) => this.attachmentsService.upload(this.entityType, entityId, file)));
  }

  /** Chamado junto do resetForm() do modal pai (fica aberto pra cadastro rápido em sequência). */
  reset(): void {
    this.pendingFiles.set([]);
    this.errorMessage.set(null);
  }
}
