import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import {
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToolbar,
  ModalController,
  PopoverController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  addCircleOutline,
  attachOutline,
  briefcaseOutline,
  createOutline,
  documentsOutline,
  settingsOutline,
  swapHorizontalOutline,
  trashOutline,
} from 'ionicons/icons';
import { firstValueFrom } from 'rxjs';

import { isDesktopViewport, slideInFromRight, slideOutToRight, SIDE_MODAL_CSS_CLASS } from '../../modals/side-modal.animations';
import { Attachment, AttachmentsService } from '../../services/attachments.service';
import { Empresa, EmpresaService, LimiteMei, LimiteSituacao, NotaFiscal } from '../../services/empresa.service';
import { formatCnpj, formatDocumento } from '../../shared/cnpj';
import { LoadingStateComponent } from '../../shared/loading-state.component';
import { MESES_COMPLETOS } from '../../shared/months';
import { ResetPeriodButtonComponent } from '../../shared/reset-period-button.component';
import { DEFAULT_SORT_KEY, SortOption, SortState, sortItems, toggleSortState, UNSORTED } from '../../shared/sortable';
import { SortSelectComponent } from '../../shared/sort-select.component';
import { SortThComponent } from '../../shared/sort-th.component';
import { UndoDeleteService } from '../../shared/undo-delete.service';

const PAGE_SIZE = 25;

const SITUACAO_TEXTO: Record<LimiteSituacao, string> = {
  ok: 'Dentro do limite do MEI.',
  atencao: 'Atenção: já passou de 80% do limite do ano.',
  excedido_ate_20:
    'Passou do limite em até 20%: paga imposto sobre o excesso na declaração anual (DASN-SIMEI) e deixa de ser MEI a partir de janeiro do ano seguinte.',
  excedido_acima_20:
    'Passou mais de 20% do limite: o desenquadramento do MEI vale desde janeiro (ou desde a abertura). Vale procurar um contador.',
};

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Módulo Empresa (MEI): dados da empresa e documentos, limite de faturamento do ano e notas
 * fiscais de serviço. Nota substituída fica na lista (com o selo), mas não conta no limite nem na soma.
 */
@Component({
  selector: 'app-empresa',
  templateUrl: './empresa.page.html',
  styleUrls: ['./empresa.page.scss'],
  imports: [
    CurrencyPipe,
    DatePipe,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonButton,
    IonTitle,
    IonContent,
    IonIcon,
    IonInput,
    IonSelect,
    IonSelectOption,
    SortThComponent,
    SortSelectComponent,
    LoadingStateComponent,
    ResetPeriodButtonComponent,
  ],
})
export class EmpresaPage {
  private readonly undoDelete = inject(UndoDeleteService);
  readonly meses = MESES_COMPLETOS;
  readonly formatCnpj = formatCnpj;
  readonly formatDocumento = formatDocumento;

  readonly carregando = signal(true);
  readonly empresa = signal<Empresa | null>(null);
  readonly documentos = signal<Attachment[]>([]);

  readonly limiteAno = signal(new Date().getFullYear());
  readonly limite = signal<LimiteMei | null>(null);
  readonly anosLimite = computed(() => {
    const empresa = this.empresa();
    const atual = new Date().getFullYear();
    const inicio = empresa ? Number(empresa.data_abertura.slice(0, 4)) : atual;
    return Array.from({ length: atual - inicio + 1 }, (_, i) => atual - i);
  });
  readonly situacaoTexto = computed(() => {
    const limite = this.limite();
    return limite ? SITUACAO_TEXTO[limite.situacao] : '';
  });
  readonly proporcionalTexto = computed(() => {
    const empresa = this.empresa();
    const limite = this.limite();
    if (!empresa || !limite?.proporcional) return '';
    const mes = Number(empresa.data_abertura.slice(5, 7));
    const meses = 12 - mes + 1;
    return `Ano de abertura: limite proporcional de R$ 6.750 por mês, de ${MESES_COMPLETOS[mes - 1].toLowerCase()} a dezembro (${meses} ${meses === 1 ? 'mês' : 'meses'}).`;
  });
  /** Largura da barra -- até 100%; o excesso aparece no texto e na cor. */
  readonly barraPct = computed(() => Math.min(this.limite()?.pct ?? 0, 100));

  readonly busca = signal('');
  readonly mes = signal<number | null>(null);
  readonly ano = signal<number | null>(null);
  readonly notas = signal<NotaFiscal[]>([]);
  readonly total = signal(0);
  readonly somaValor = signal(0);
  readonly notasComAnexo = signal<Set<string>>(new Set());
  readonly anosFiltro: number[];

  readonly sort = signal<SortState>(UNSORTED);
  readonly sortOptions: readonly SortOption[] = [
    { value: DEFAULT_SORT_KEY, label: 'Mais recentes' },
    { value: 'emissao:asc', label: 'Mais antigas' },
    { value: 'valor:desc', label: 'Maior valor' },
    { value: 'numero:desc', label: 'Número' },
    { value: 'tomador:asc', label: 'Tomador (A–Z)' },
  ];
  readonly sortedNotas = computed(() => sortItems(this.notas(), this.sort(), (n, column) => this.sortValue(n, column)));

  constructor(
    private readonly empresaService: EmpresaService,
    private readonly attachmentsService: AttachmentsService,
    private readonly modalCtrl: ModalController,
    private readonly popoverCtrl: PopoverController,
  ) {
    addIcons({ addCircleOutline, attachOutline, briefcaseOutline, createOutline, documentsOutline, settingsOutline, swapHorizontalOutline, trashOutline });
    const atual = new Date().getFullYear();
    this.anosFiltro = Array.from({ length: 6 }, (_, i) => atual - i);
  }

  ionViewWillEnter(): void {
    this.carregarEmpresa();
  }

  ionViewWillLeave(): void {
    this.undoDelete.flushAll();
  }

  private carregarEmpresa(): void {
    this.empresaService.get().subscribe((empresa) => {
      this.empresa.set(empresa);
      this.carregando.set(false);
      if (empresa) {
        this.carregarDocumentos();
        this.carregarLimite();
        this.reload();
      }
    });
  }

  private carregarDocumentos(): void {
    const empresa = this.empresa();
    if (!empresa) return;
    this.attachmentsService.list('empresa', empresa.id).subscribe((docs) => this.documentos.set(docs));
  }

  private carregarLimite(): void {
    this.empresaService.limite(this.limiteAno()).subscribe((limite) => this.limite.set(limite));
  }

  onLimiteAnoChange(ano: number): void {
    this.limiteAno.set(ano);
    this.carregarLimite();
  }

  onBuscaInput(ev: CustomEvent): void {
    this.busca.set(String((ev.detail as { value?: string })?.value ?? '').trim());
    this.reload();
  }

  onMesChange(value: number | null): void {
    this.mes.set(value);
    this.reload();
  }

  onAnoChange(value: number | null): void {
    this.ano.set(value);
    this.reload();
  }

  resetPeriodo(): void {
    this.mes.set(null);
    this.ano.set(null);
    this.reload();
  }

  private listParams() {
    return { busca: this.busca() || undefined, mes: this.mes() ?? undefined, ano: this.ano() ?? undefined };
  }

  private reload(): void {
    this.empresaService.listNotas({ ...this.listParams(), limit: PAGE_SIZE, offset: 0 }).subscribe((page) => {
      this.notas.set(page.items);
      this.total.set(page.total);
      this.somaValor.set(page.soma_valor);
      this.refreshAnexos();
    });
  }

  carregarMais(): void {
    this.empresaService
      .listNotas({ ...this.listParams(), limit: PAGE_SIZE, offset: this.notas().length })
      .subscribe((page) => {
        this.notas.set([...this.notas(), ...page.items]);
        this.total.set(page.total);
        this.refreshAnexos();
      });
  }

  private refreshAnexos(): void {
    const ids = this.notas().map((n) => String(n.id));
    if (!ids.length) {
      this.notasComAnexo.set(new Set());
      return;
    }
    this.attachmentsService
      .exists('nota_fiscal', ids)
      .subscribe((res) => this.notasComAnexo.set(new Set(res.entity_ids_with_attachments)));
  }

  async abrirAnexos(ev: Event, nota: NotaFiscal): Promise<void> {
    const files = await firstValueFrom(this.attachmentsService.list('nota_fiscal', nota.id));
    await this.abrirPopoverArquivos(ev, files);
  }

  async abrirDocumentos(ev: Event): Promise<void> {
    await this.abrirPopoverArquivos(ev, this.documentos());
  }

  private async abrirPopoverArquivos(ev: Event, files: Attachment[]): Promise<void> {
    const { AttachmentsPopoverComponent } = await import('../../shared/attachments-popover.component');
    const popover = await this.popoverCtrl.create({ component: AttachmentsPopoverComponent, componentProps: { files }, event: ev });
    await popover.present();
  }

  private sideModalOptions() {
    return isDesktopViewport()
      ? { cssClass: SIDE_MODAL_CSS_CLASS, enterAnimation: slideInFromRight, leaveAnimation: slideOutToRight }
      : {};
  }

  async abrirConfig(): Promise<void> {
    const { EmpresaConfigModalComponent } = await import('../../modals/empresa-config/empresa-config-modal.component');
    const modal = await this.modalCtrl.create({
      component: EmpresaConfigModalComponent,
      componentProps: { empresa: this.empresa() },
      ...this.sideModalOptions(),
    });
    await modal.present();
    const { role } = await modal.onWillDismiss();
    if (role === 'saved') this.carregarEmpresa();
  }

  async abrirNota(nota: NotaFiscal | null = null): Promise<void> {
    const { NotaFiscalModalComponent } = await import('../../modals/nota-fiscal/nota-fiscal-modal.component');
    const modal = await this.modalCtrl.create({
      component: NotaFiscalModalComponent,
      componentProps: { nota },
      ...this.sideModalOptions(),
    });
    await modal.present();
    const { role } = await modal.onWillDismiss();
    if (role === 'saved') {
      this.reload();
      this.carregarLimite();
    }
  }

  excluirNota(nota: NotaFiscal): void {
    this.undoDelete.schedule({
      message: `Nota ${nota.numero} (${formatBRL(nota.valor)}) excluída.`,
      hide: () => {
        this.notas.update((lista) => lista.filter((n) => n.id !== nota.id));
        this.total.update((n) => n - 1);
      },
      restore: () => this.reload(),
      commit: () => this.empresaService.removeNota(nota.id),
      onCommitted: () => {
        this.reload();
        this.carregarLimite();
      },
      errorMessage: 'Erro ao excluir a nota.',
    });
  }

  toggleSort(column: string): void {
    this.sort.update((s) => toggleSortState(s, column));
  }

  private sortValue(nota: NotaFiscal, column: string): unknown {
    switch (column) {
      case 'emissao':
        return nota.data_emissao;
      case 'competencia':
        return nota.competencia;
      case 'numero':
        return Number(nota.numero) || nota.numero;
      case 'tomador':
        return nota.tomador_nome;
      case 'valor':
        return nota.valor;
      default:
        return null;
    }
  }
}
