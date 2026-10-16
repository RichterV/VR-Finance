import { Component, Input, OnInit, computed, inject, signal } from '@angular/core';
import {
  AlertController,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { close, documentOutline } from 'ionicons/icons';
import { Subscription, firstValueFrom, forkJoin } from 'rxjs';

import { AuthService } from '../../core/auth.service';
import { AttachmentsService } from '../../services/attachments.service';
import { isXmlFile } from '../../shared/attachment-types';
import { httpErrorMessage } from '../../shared/http-error';
import { ReceiptValueService } from '../../shared/receipt-value.service';
import { RecordRow, RecordSource, RecordSourcesService, brl, formatDateBr } from '../../shared/record-sources.service';

const PAGE_SIZE = 25;

/** O que o modal devolve no dismiss ('attached'): onde o arquivo foi parar. */
export interface AttachedResult {
  row: RecordRow;
  count: number;
}

/**
 * "Anexar a um lançamento existente" (arquivo compartilhado de outro app): escolhe o tipo, busca o
 * lançamento e anexa. No topo, "Pode ser este": lançamentos recentes com o mesmo valor lido do
 * comprovante. Anexo de gasto parcelado/devedor vai pro grupo inteiro (RecordRow.entityId).
 */
@Component({
  selector: 'app-anexar-existente-modal',
  imports: [IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonContent, IonInput, IonSelect, IonSelectOption, IonSpinner],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Anexar a um lançamento</ion-title>
        <ion-buttons slot="end">
          <ion-button aria-label="Fechar" title="Fechar" (click)="dismiss()" [disabled]="uploading()">
            <ion-icon slot="icon-only" name="close"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div class="files">
        <ion-icon name="document-outline"></ion-icon>
        <span class="files-name">{{ filesLabel }}</span>
        @if (readingValue()) {
          <span class="files-value muted">lendo valor...</span>
        } @else if (valorLido() !== null) {
          <span class="files-value">{{ brl(valorLido()) }}</span>
        }
      </div>

      @if (uploading()) {
        <div class="state"><ion-spinner name="crescent"></ion-spinner> Anexando...</div>
      } @else {
        @if (suggestions().length) {
          <h2 class="section-title">Pode ser este</h2>
          <p class="section-hint">Mesmo valor do comprovante, lançado nos últimos 60 dias.</p>
          <div class="record-list">
            @for (row of suggestions(); track row.key) {
              <button type="button" class="entry-card record suggestion" (click)="choose(row)">
                <span class="entry-main">
                  <span class="entry-chip">{{ row.source.label }}</span>
                  <span class="entry-title">{{ row.title }}</span>
                  <span class="entry-value">{{ brl(row.value) }}</span>
                </span>
                <span class="entry-meta-text">{{ formatDateBr(row.date) }}{{ row.meta ? ' · ' + row.meta : '' }}</span>
              </button>
            }
          </div>
        }

        <h2 class="section-title">{{ suggestions().length ? 'Outro lançamento' : 'Escolher lançamento' }}</h2>
        <div class="controls" [class.single]="sources.length < 2">
          @if (sources.length > 1) {
            <ion-select
              [value]="active().type"
              (ionChange)="onTipoChange($any($event.detail.value))"
              interface="popover"
              [interfaceOptions]="{ size: 'auto' }"
              fill="outline"
              label="Tipo"
              labelPlacement="floating"
            >
              @for (s of sources; track s.type) {
                <ion-select-option [value]="s.type">{{ s.label }}</ion-select-option>
              }
            </ion-select>
          }
          <ion-input
            fill="outline"
            [placeholder]="searchPlaceholder()"
            [value]="busca()"
            (ionInput)="onBusca($event)"
            [debounce]="300"
          ></ion-input>
        </div>

        @if (loading() && !rows().length) {
          <div class="state"><ion-spinner name="crescent"></ion-spinner></div>
        } @else if (error()) {
          <p class="entry-empty">{{ error() }}</p>
        } @else if (!rows().length) {
          <p class="entry-empty">Nenhum lançamento encontrado.</p>
        } @else {
          <div class="record-list">
            @for (row of rows(); track row.key + row.date) {
              <button type="button" class="entry-card record" (click)="choose(row)">
                <span class="entry-main">
                  <span class="entry-title">{{ row.title }}</span>
                  <span class="entry-value">{{ brl(row.value) }}</span>
                </span>
                <span class="entry-meta-text">{{ formatDateBr(row.date) }}{{ row.meta ? ' · ' + row.meta : '' }}</span>
              </button>
            }
          </div>
          @if (rows().length < total()) {
            <ion-button fill="clear" expand="block" [disabled]="loading()" (click)="loadMore()">Carregar mais</ion-button>
          }
        }
      }
    </ion-content>
  `,
  styles: [
    `
      .files {
        display: flex;
        align-items: center;
        gap: var(--sp-2);
        padding: var(--sp-3);
        border: 1px solid var(--app-surface-border);
        border-radius: var(--r-md);
        background: var(--app-surface);
        font-size: var(--fs-sm);
        color: var(--app-text-secondary);
      }
      .files ion-icon {
        flex-shrink: 0;
        color: var(--ion-color-primary);
      }
      .files-name {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .files-value {
        flex-shrink: 0;
        font-weight: 600;
        color: var(--app-text-primary);
        font-variant-numeric: tabular-nums;
      }
      .files-value.muted {
        font-weight: 400;
        color: var(--app-text-secondary);
      }
      /* Mesmo título de seção do Perfil (.perfil-section) */
      .section-title {
        margin: var(--sp-6) 0 var(--sp-3);
        font-size: var(--fs-md);
        font-weight: 600;
        color: var(--app-text-primary);
      }
      .section-hint {
        margin: calc(-1 * var(--sp-2)) 0 var(--sp-3);
        font-size: var(--fs-xs);
        color: var(--app-text-secondary);
      }
      .record-list {
        display: flex;
        flex-direction: column;
        gap: var(--sp-2);
      }
      .record {
        width: 100%;
        text-align: left;
        font: inherit;
        color: inherit;
        cursor: pointer;
      }
      .record:focus-visible {
        outline: 2px solid var(--ion-color-primary);
        outline-offset: 2px;
      }
      @media (hover: hover) {
        .record:hover {
          border-color: var(--ion-color-primary);
        }
      }
      /* Destaque sem bloco de cor: faixa lateral de 3px (mesmo padrão de ds.app-card-accent) */
      .record.suggestion {
        border-left: 3px solid var(--ion-color-primary);
      }
      .record .entry-meta-text {
        display: block;
      }
      .controls {
        display: grid;
        grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
        gap: var(--sp-2);
        margin-bottom: var(--sp-3);
      }
      .controls.single {
        grid-template-columns: minmax(0, 1fr);
      }
      @media (max-width: 480px) {
        .controls {
          grid-template-columns: minmax(0, 1fr);
        }
      }
      .state {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: var(--sp-2);
        padding: var(--sp-5);
        color: var(--app-text-secondary);
      }
    `,
  ],
})
export class AnexarExistenteModalComponent implements OnInit {
  @Input({ required: true }) files: File[] = [];

  private readonly modalCtrl = inject(ModalController);
  private readonly alertCtrl = inject(AlertController);
  private readonly auth = inject(AuthService);
  private readonly attachments = inject(AttachmentsService);
  private readonly receiptValue = inject(ReceiptValueService);
  private readonly recordSources = inject(RecordSourcesService);

  readonly brl = brl;
  readonly formatDateBr = formatDateBr;

  sources: RecordSource[] = [];
  readonly active = signal<RecordSource>(null as unknown as RecordSource);
  readonly busca = signal('');
  readonly rows = signal<RecordRow[]>([]);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly uploading = signal(false);
  readonly readingValue = signal(false);
  readonly valorLido = signal<number | null>(null);
  readonly suggestions = signal<RecordRow[]>([]);
  private request?: Subscription;

  readonly allXml = computed(() => this.files.length > 0 && this.files.every(isXmlFile));

  constructor() {
    addIcons({ close, documentOutline });
  }

  get filesLabel(): string {
    return this.files.length === 1 ? this.files[0].name : `${this.files.length} arquivos`;
  }

  ngOnInit(): void {
    const allXml = this.allXml();
    this.sources = this.recordSources.all.filter(
      (s) => (!s.module || this.auth.hasModule(s.module)) && (!allXml || s.acceptsXml),
    );
    if (!this.sources.length) return;
    this.active.set(this.sources[0]);
    this.load(true);
    void this.loadSuggestions();
  }

  private async loadSuggestions(): Promise<void> {
    const readable = this.files.filter((f) => this.receiptValue.canRead(f));
    if (!readable.length) return;
    this.readingValue.set(true);
    let value: number | null = null;
    for (const file of readable) {
      value = await this.receiptValue.readValue(file);
      if (value !== null) break;
    }
    this.readingValue.set(false);
    this.valorLido.set(value);
    if (value === null) return;
    this.recordSources.suggestions(this.sources, value).subscribe((rows) => this.suggestions.set(rows));
  }

  /** Texto da busca: Bolsa busca pelo ticker, Devedores pelo nome; o resto pela descrição. */
  searchPlaceholder(): string {
    const type: string = this.active().type;
    if (type === 'servico_casa') return 'Buscar por descrição ou prestador';
    return 'Buscar por descrição';
  }

  onTipoChange(type: string): void {
    const source = this.sources.find((s) => s.type === type);
    if (source) this.selectSource(source);
  }

  selectSource(source: RecordSource): void {
    if (source === this.active()) return;
    this.active.set(source);
    this.load(true);
  }

  onBusca(ev: Event): void {
    this.busca.set(String((ev as CustomEvent<{ value?: string | null }>).detail?.value ?? '').trim());
    this.load(true);
  }

  loadMore(): void {
    this.load(false);
  }

  private load(reset: boolean): void {
    this.request?.unsubscribe();
    if (reset) {
      this.rows.set([]);
      this.total.set(0);
    }
    this.loading.set(true);
    this.error.set(null);
    const offset = reset ? 0 : this.rows().length;
    this.request = this.active()
      .search(this.busca(), offset, PAGE_SIZE)
      .subscribe({
        next: ({ rows, total }) => {
          this.rows.update((current) => [...current, ...rows]);
          this.total.set(total);
          this.loading.set(false);
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(httpErrorMessage(err, 'Não foi possível carregar os lançamentos.'));
        },
      });
  }

  async choose(row: RecordRow): Promise<void> {
    if (this.uploading()) return;
    const files = row.source.acceptsXml ? this.files : this.files.filter((f) => !isXmlFile(f));
    const skipped = this.files.length - files.length;
    if (!files.length) return;
    const what = files.length === 1 ? `"${files[0].name}"` : `${files.length} arquivos`;
    const descricao = [row.title, brl(row.value), formatDateBr(row.date)].filter(Boolean).join(' · ');
    const alert = await this.alertCtrl.create({
      header: 'Anexar',
      message:
        `Anexar ${what} ${row.source.toNoun} ${descricao}?` +
        (skipped ? ' O XML fica de fora: só nota fiscal aceita XML.' : ''),
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Anexar', role: 'confirm' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role !== 'confirm') return;

    this.uploading.set(true);
    try {
      await firstValueFrom(forkJoin(files.map((f) => this.attachments.upload(row.source.type, row.entityId, f))));
      const result: AttachedResult = { row, count: files.length };
      await this.modalCtrl.dismiss(result, 'attached');
    } catch (err) {
      this.uploading.set(false);
      const failed = await this.alertCtrl.create({
        header: 'Não foi possível anexar',
        message: httpErrorMessage(err, 'Erro ao enviar o arquivo.'),
        buttons: ['OK'],
      });
      await failed.present();
    }
  }

  dismiss(): void {
    void this.modalCtrl.dismiss(null, 'cancel');
  }
}
