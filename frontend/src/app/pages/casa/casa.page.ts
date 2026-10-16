import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import {
  AlertController,
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
  ToastController,
} from '@ionic/angular';
import { BaseChartDirective } from 'ng2-charts';
import { addIcons } from 'ionicons';
import {
  addCircleOutline,
  attachOutline,
  businessOutline,
  closeOutline,
  colorPaletteOutline,
  constructOutline,
  createOutline,
  documentTextOutline,
  exitOutline,
  flashOutline,
  homeOutline,
  leafOutline,
  peopleOutline,
  receiptOutline,
  shieldCheckmarkOutline,
  sparklesOutline,
  trashOutline,
  tvOutline,
  waterOutline,
} from 'ionicons/icons';
import { firstValueFrom, forkJoin } from 'rxjs';

import { onSharedAttached, onSharedFiles } from '../../core/share-intake.service';
import { isDesktopViewport, slideInFromRight, slideOutToRight, SIDE_MODAL_CSS_CLASS } from '../../modals/side-modal.animations';
import { AttachmentsService } from '../../services/attachments.service';
import {
  CASA_CATEGORIA_ICONS,
  CASA_CATEGORIA_LABELS,
  CASA_SERVICE_TYPE_LABELS,
  CasaCategoria,
  CasaResumo,
  CasaService,
  garantiaVigente,
  Imovel,
  MeuNivel,
  nivelPermite,
  ServicoCasa,
  SHARE_NIVEL_LABELS,
} from '../../services/casa.service';
import { httpErrorMessage } from '../../shared/http-error';
import { todayIso } from '../../shared/launch-date';
import { LoadingStateComponent } from '../../shared/loading-state.component';
import { MESES_COMPLETOS } from '../../shared/months';
import { ResetPeriodButtonComponent } from '../../shared/reset-period-button.component';
import { DEFAULT_SORT_KEY, SortOption, SortState, sortItems, toggleSortState, UNSORTED } from '../../shared/sortable';
import { SortSelectComponent } from '../../shared/sort-select.component';
import { SortThComponent } from '../../shared/sort-th.component';
import { UndoDeleteService } from '../../shared/undo-delete.service';
import { buildCasaChartData, casaChartOptions, categoriaBarPct } from './casa-chart';

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const PAGE_SIZE = 25;

/**
 * Manutenção Casa (`/casa`, módulo `manutencao_casa`): mesmo desenho de Manutenção Veículos --
 * cartões por imóvel, gráfico mensal, imóveis e serviços -- com categoria, prestador e garantia.
 * Separado das finanças pessoais (serviço da casa não vira gasto).
 */
@Component({
  selector: 'app-casa',
  templateUrl: './casa.page.html',
  styleUrls: ['./casa.page.scss'],
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
    BaseChartDirective,
    SortThComponent,
    SortSelectComponent,
    LoadingStateComponent,
    ResetPeriodButtonComponent,
  ],
})
export class CasaPage {
  private readonly undoDelete = inject(UndoDeleteService);
  private readonly casaService = inject(CasaService);
  private readonly attachmentsService = inject(AttachmentsService);
  private readonly modalCtrl = inject(ModalController);
  private readonly popoverCtrl = inject(PopoverController);
  private readonly alertCtrl = inject(AlertController);
  private readonly toastCtrl = inject(ToastController);

  readonly meses = MESES_COMPLETOS;
  readonly anos: number[];
  readonly categoriaLabels = CASA_CATEGORIA_LABELS;
  readonly categoriaIcons = CASA_CATEGORIA_ICONS;
  readonly categorias = Object.entries(CASA_CATEGORIA_LABELS) as [CasaCategoria, string][];
  readonly hoje = todayIso();

  /** Verdadeiro até a primeira carga de imóveis+resumo+serviços terminar. */
  readonly initialLoading = signal(true);

  readonly imoveis = signal<Imovel[]>([]);
  readonly resumo = signal<CasaResumo | null>(null);
  readonly services = signal<ServicoCasa[]>([]);
  readonly totalServices = signal(0);
  readonly serviceAttachmentKeys = signal<Set<string>>(new Set());

  // Filtros da lista de serviços
  readonly filtroImovelId = signal<number | null>(null);
  readonly filtroCategoria = signal<CasaCategoria | null>(null);
  readonly filtroGarantia = signal(false);
  readonly busca = signal('');

  /** Filtro de ano/mês dos cartões e de "Por categoria" -- sem valor por padrão (mostra tudo). Não
   * afeta a lista de serviços (tem os próprios filtros) nem o gráfico (sempre os últimos 12 meses),
   * mesma regra de Manutenção Veículos. */
  readonly mesResumo = signal<number | null>(null);
  readonly anoResumo = signal<number | null>(null);

  readonly imoveisSort = signal<SortState>(UNSORTED);
  readonly servicesSort = signal<SortState>(UNSORTED);

  readonly servicesSortOptions: readonly SortOption[] = [
    { value: DEFAULT_SORT_KEY, label: 'Mais recentes' },
    { value: 'date:asc', label: 'Mais antigos' },
    { value: 'value:desc', label: 'Maior valor' },
    { value: 'value:asc', label: 'Menor valor' },
    { value: 'categoria:asc', label: 'Categoria (A–Z)' },
    { value: 'imovel:asc', label: 'Imóvel (A–Z)' },
  ];

  readonly sortedImoveis = computed(() =>
    sortItems(this.imoveis(), this.imoveisSort(), (i, column) => (column === 'name' ? i.name : null)),
  );
  readonly sortedServices = computed(() =>
    sortItems(this.services(), this.servicesSort(), (s, column) => this.serviceSortValue(s, column)),
  );

  readonly totalPeriodo = computed(() => (this.resumo()?.imoveis ?? []).reduce((acc, i) => acc + i.total_gasto, 0));
  readonly maiorCategoria = computed(() => Math.max(0, ...(this.resumo()?.categorias ?? []).map((c) => c.total)));

  readonly chartData = computed(() => buildCasaChartData(this.resumo()));
  readonly chartOptions = computed(() => casaChartOptions(this.resumo()?.series.length ?? 0));
  /** Texto do gráfico pra leitor de tela. */
  readonly chartLabel = computed(() => {
    const resumo = this.resumo();
    const nomes = resumo?.imoveis.map((i) => i.imovel_name).join(', ') ?? '';
    return `Gráfico de colunas: gasto mensal com manutenção da casa nos últimos ${resumo?.meses.length ?? 12} meses${nomes ? ` (${nomes})` : ''}.`;
  });

  /** Coluna/dado "Imóvel" só quando há mais de um (inclusive serviço de imóvel já excluído). */
  readonly mostrarImovel = computed(() => {
    const ids = new Set(this.imoveis().map((i) => i.id));
    return ids.size > 1 || this.services().some((s) => !ids.has(s.imovel_id));
  });

  // --- Compartilhamento: o que cada imóvel deixa fazer ---

  nivelLabel(imovel: Imovel): string {
    return imovel.meu_nivel && imovel.meu_nivel !== 'dono' ? SHARE_NIVEL_LABELS[imovel.meu_nivel] : '';
  }

  private readonly imovelPorId = computed(() => new Map(this.imoveis().map((i) => [i.id, i])));

  /** Serviço de imóvel meu já excluído não está na lista -- é meu, então "dono". */
  private nivelDoImovel(imovelId: number): MeuNivel {
    return this.imovelPorId().get(imovelId)?.meu_nivel ?? 'dono';
  }

  podeEditar(servico: ServicoCasa): boolean {
    return nivelPermite(this.nivelDoImovel(servico.imovel_id), 'edicao');
  }

  podeExcluir(servico: ServicoCasa): boolean {
    return nivelPermite(this.nivelDoImovel(servico.imovel_id), 'total');
  }

  /** "Adicionar serviço" só aparece se algum imóvel deixa cadastrar (ou se ainda não há imóvel nenhum). */
  readonly podeAdicionarServico = computed(
    () => this.imoveis().length === 0 || this.imoveis().some((i) => nivelPermite(i.meu_nivel, 'cadastro')),
  );

  /** Selo do cartão/linha: "de Fulano" (compartilhado comigo). */
  donoDoImovel(imovelId: number): string | null {
    return this.imovelPorId().get(imovelId)?.dono?.nome ?? null;
  }

  /** "Cadastrado por" só faz sentido em imóvel compartilhado (comigo ou meu com alguém). */
  autorDoServico(servico: ServicoCasa): string | null {
    const imovel = this.imovelPorId().get(servico.imovel_id);
    if (!imovel || (!imovel.dono && !imovel.compartilhado_com)) return null;
    return `cadastrado por ${servico.criado_por_nome ?? 'usuário removido'}`;
  }

  readonly temFiltroServicos = computed(
    () => this.filtroImovelId() !== null || this.filtroCategoria() !== null || this.filtroGarantia() || this.busca() !== '',
  );

  constructor() {
    onSharedAttached(['servico_casa'], () => this.reload());
    onSharedFiles('servico_casa', (files) => void this.abrirAdicionarServico(files));
    addIcons({
      addCircleOutline,
      attachOutline,
      businessOutline,
      closeOutline,
      colorPaletteOutline,
      constructOutline,
      createOutline,
      documentTextOutline,
      exitOutline,
      flashOutline,
      homeOutline,
      leafOutline,
      peopleOutline,
      receiptOutline,
      shieldCheckmarkOutline,
      sparklesOutline,
      trashOutline,
      tvOutline,
      waterOutline,
    });
    const currentYear = new Date().getFullYear();
    this.anos = Array.from({ length: 6 }, (_, i) => currentYear - i);
  }

  /** Exclusões com "Desfazer" ainda pendentes são confirmadas ao sair da página. */
  ionViewWillLeave(): void {
    this.undoDelete.flushAll();
  }

  /** ionViewWillEnter (não ngOnInit): o ion-router-outlet reaproveita a instância da página. */
  ionViewWillEnter(): void {
    this.reload();
  }

  // --- Filtros ---

  onMesResumoChange(value: number | null): void {
    this.mesResumo.set(value);
    this.reloadResumo();
  }

  onAnoResumoChange(value: number | null): void {
    this.anoResumo.set(value);
    this.reloadResumo();
  }

  resetPeriodoResumo(): void {
    this.mesResumo.set(null);
    this.anoResumo.set(null);
    this.reloadResumo();
  }

  onFiltroImovelChange(id: number | null): void {
    this.filtroImovelId.set(id);
    this.reloadServices();
  }

  onFiltroCategoriaChange(categoria: CasaCategoria | null): void {
    this.filtroCategoria.set(categoria);
    this.reloadServices();
  }

  /** Tocar numa categoria de "Por categoria" filtra a lista (tocar de novo tira o filtro). */
  filtrarCategoria(categoria: CasaCategoria): void {
    this.onFiltroCategoriaChange(this.filtroCategoria() === categoria ? null : categoria);
  }

  toggleGarantia(): void {
    this.filtroGarantia.update((v) => !v);
    this.reloadServices();
  }

  onBuscaInput(ev: CustomEvent): void {
    this.busca.set(String((ev.detail as { value?: string })?.value ?? '').trim());
    this.reloadServices();
  }

  limparFiltrosServicos(): void {
    this.filtroImovelId.set(null);
    this.filtroCategoria.set(null);
    this.filtroGarantia.set(false);
    this.busca.set('');
    this.reloadServices();
  }

  // --- Carga ---

  private servicesListParams() {
    return {
      imovel_id: this.filtroImovelId() ?? undefined,
      categoria: this.filtroCategoria() ?? undefined,
      garantia_vigente: this.filtroGarantia(),
      busca: this.busca() || undefined,
    };
  }

  private resumoRequest() {
    return this.casaService.resumo(12, this.anoResumo() ?? undefined, this.mesResumo() ?? undefined);
  }

  private reload(): void {
    forkJoin([
      this.casaService.listImoveis(),
      this.resumoRequest(),
      this.casaService.listServicos({ ...this.servicesListParams(), limit: PAGE_SIZE, offset: 0 }),
    ]).subscribe(([imoveis, resumo, page]) => {
      this.imoveis.set(imoveis);
      this.resumo.set(resumo);
      this.services.set(page.items);
      this.totalServices.set(page.total);
      this.initialLoading.set(false);
      this.refreshAttachmentKeys();
    });
  }

  private reloadResumo(): void {
    this.resumoRequest().subscribe((resumo) => this.resumo.set(resumo));
  }

  private reloadServices(): void {
    this.casaService.listServicos({ ...this.servicesListParams(), limit: PAGE_SIZE, offset: 0 }).subscribe((page) => {
      this.services.set(page.items);
      this.totalServices.set(page.total);
      this.refreshAttachmentKeys();
    });
  }

  carregarMais(): void {
    this.casaService
      .listServicos({ ...this.servicesListParams(), limit: PAGE_SIZE, offset: this.services().length })
      .subscribe((page) => {
        this.services.set([...this.services(), ...page.items]);
        this.totalServices.set(page.total);
        this.refreshAttachmentKeys();
      });
  }

  // --- Anexos ---

  rowKey(servico: ServicoCasa): string {
    return String(servico.id);
  }

  private refreshAttachmentKeys(): void {
    const keys = Array.from(new Set(this.services().map((s) => this.rowKey(s))));
    if (!keys.length) {
      this.serviceAttachmentKeys.set(new Set());
      return;
    }
    this.attachmentsService
      .exists('servico_casa', keys)
      .subscribe((res) => this.serviceAttachmentKeys.set(new Set(res.entity_ids_with_attachments)));
  }

  async abrirAnexos(ev: Event, servico: ServicoCasa): Promise<void> {
    const { AttachmentsPopoverComponent } = await import('../../shared/attachments-popover.component');
    const files = await firstValueFrom(this.attachmentsService.list('servico_casa', servico.id));
    const popover = await this.popoverCtrl.create({
      component: AttachmentsPopoverComponent,
      componentProps: { files },
      event: ev,
    });
    await popover.present();
  }

  // --- Exibição ---

  serviceTypeLabel(servico: ServicoCasa): string {
    return servico.service_type ? CASA_SERVICE_TYPE_LABELS[servico.service_type] : '';
  }

  garantiaVigente(servico: ServicoCasa): boolean {
    return garantiaVigente(servico.garantia_ate, this.hoje);
  }

  barPct(total: number): number {
    return categoriaBarPct(total, this.maiorCategoria());
  }

  // --- Modais ---

  private sideModalOptions() {
    return isDesktopViewport()
      ? { cssClass: SIDE_MODAL_CSS_CLASS, enterAnimation: slideInFromRight, leaveAnimation: slideOutToRight }
      : {};
  }

  private async openModal(loader: () => Promise<unknown>, componentProps: Record<string, unknown> = {}): Promise<void> {
    const component = await loader();
    const modal = await this.modalCtrl.create({ component: component as never, componentProps, ...this.sideModalOptions() });
    await modal.present();
    const { role } = await modal.onWillDismiss();
    if (role === 'saved') this.reload();
  }

  abrirAdicionarImovel(): Promise<void> {
    return this.openModal(() => import('../../modals/imovel/imovel-modal.component').then((m) => m.ImovelModalComponent));
  }

  editarImovel(imovel: Imovel): Promise<void> {
    return this.openModal(() => import('../../modals/imovel/imovel-modal.component').then((m) => m.ImovelModalComponent), {
      imovel,
    });
  }

  abrirAdicionarServico(initialFiles: File[] = []): Promise<void> {
    return this.openModal(
      () => import('../../modals/servico-casa/servico-casa-modal.component').then((m) => m.ServicoCasaModalComponent),
      { initialFiles },
    );
  }

  editarServico(servico: ServicoCasa): Promise<void> {
    return this.openModal(
      () => import('../../modals/servico-casa/servico-casa-modal.component').then((m) => m.ServicoCasaModalComponent),
      { servico },
    );
  }

  async compartilharImovel(imovel: Imovel): Promise<void> {
    return this.openModal(
      () =>
        import('../../modals/compartilhar-imovel/compartilhar-imovel-modal.component').then(
          (m) => m.CompartilharImovelModalComponent,
        ),
      { imovel },
    );
  }

  async sairDoCompartilhamento(imovel: Imovel): Promise<void> {
    if (imovel.compartilhamento_id == null) return;
    const alert = await this.alertCtrl.create({
      header: 'Sair do compartilhamento?',
      message: `Você deixa de ver o imóvel "${imovel.name}" de ${imovel.dono?.nome}. Os serviços que você cadastrou continuam lá.`,
      buttons: [
        { text: 'Voltar', role: 'cancel' },
        { text: 'Sair', role: 'destructive' },
      ],
    });
    await alert.present();
    const { role } = await alert.onDidDismiss();
    if (role !== 'destructive') return;
    this.casaService.encerrarCompartilhamento(imovel.compartilhamento_id).subscribe({
      next: async () => {
        if (this.filtroImovelId() === imovel.id) this.filtroImovelId.set(null);
        this.reload();
        const toast = await this.toastCtrl.create({ message: `Você saiu do imóvel "${imovel.name}".`, duration: 2500, color: 'success' });
        await toast.present();
      },
      error: async (err: unknown) => {
        const toast = await this.toastCtrl.create({
          message: httpErrorMessage(err, 'Erro ao sair do compartilhamento.'),
          duration: 3000,
          color: 'danger',
        });
        await toast.present();
      },
    });
  }

  excluirImovel(imovel: Imovel): void {
    this.undoDelete.schedule({
      message: `Imóvel "${imovel.name}" excluído. O histórico de serviços dele fica guardado.`,
      hide: () => this.imoveis.update((lista) => lista.filter((i) => i.id !== imovel.id)),
      restore: () => this.reload(),
      commit: () => this.casaService.removeImovel(imovel.id),
      // Cartões e gráfico dependem da lista de imóveis.
      onCommitted: () => this.reload(),
      errorMessage: 'Erro ao excluir o imóvel.',
    });
  }

  excluirServico(servico: ServicoCasa): void {
    this.undoDelete.schedule({
      message: `Serviço "${servico.description}" de ${formatBRL(servico.value)} excluído.`,
      hide: () => {
        this.services.update((lista) => lista.filter((s) => s.id !== servico.id));
        this.totalServices.update((n) => n - 1);
      },
      restore: () => this.reload(),
      commit: () => this.casaService.removeServico(servico.id),
      onCommitted: () => this.reload(),
      errorMessage: 'Erro ao excluir o serviço.',
    });
  }

  // --- Ordenação ---

  toggleImoveisSort(column: string): void {
    this.imoveisSort.update((s) => toggleSortState(s, column));
  }

  toggleServicesSort(column: string): void {
    this.servicesSort.update((s) => toggleSortState(s, column));
  }

  private serviceSortValue(servico: ServicoCasa, column: string): unknown {
    switch (column) {
      case 'date':
        return servico.date;
      case 'imovel':
        return servico.imovel_name;
      case 'description':
        return servico.description;
      case 'categoria':
        return CASA_CATEGORIA_LABELS[servico.categoria];
      case 'prestador':
        return servico.prestador ?? '';
      case 'value':
        return servico.value;
      case 'garantia':
        return servico.garantia_ate ?? '';
      default:
        return null;
    }
  }
}
