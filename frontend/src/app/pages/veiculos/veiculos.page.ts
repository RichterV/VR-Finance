import { CurrencyPipe, DatePipe, DecimalPipe } from '@angular/common';
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
  ToastController,
} from '@ionic/angular';
import { BaseChartDirective } from 'ng2-charts';
import { addIcons } from 'ionicons';
import { addCircleOutline, attachOutline, buildOutline, carSportOutline, createOutline, trashOutline } from 'ionicons/icons';
import { firstValueFrom, forkJoin } from 'rxjs';

import { SERVICE_TYPE_LABELS } from '../../modals/adicionar-servico/adicionar-servico-modal.component';
import { isDesktopViewport, slideInFromRight, slideOutToRight, SIDE_MODAL_CSS_CLASS } from '../../modals/side-modal.animations';
import { AttachmentsService } from '../../services/attachments.service';
import { ServiceType, ServicoVeiculo, ServicosVeiculosService } from '../../services/servicos-veiculos.service';
import { Vehicle, VeiculosService, VehiclesResumo } from '../../services/veiculos.service';
import { LoadingStateComponent } from '../../shared/loading-state.component';
import { ResetPeriodButtonComponent } from '../../shared/reset-period-button.component';
import { MESES_COMPLETOS } from '../../shared/months';
import { DEFAULT_SORT_KEY, SortOption, SortState, sortItems, toggleSortState, UNSORTED } from '../../shared/sortable';
import { SortSelectComponent } from '../../shared/sort-select.component';
import { SortThComponent } from '../../shared/sort-th.component';
import { buildVeiculosChartData, veiculosChartOptions } from './veiculos-chart';
import { UndoDeleteService } from '../../shared/undo-delete.service';

function formatBRL(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const PAGE_SIZE = 25;

@Component({
  selector: 'app-veiculos',
  templateUrl: './veiculos.page.html',
  styleUrls: ['./veiculos.page.scss'],
  imports: [
    CurrencyPipe,
    DecimalPipe,
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
export class VeiculosPage {
  private readonly undoDelete = inject(UndoDeleteService);
  readonly serviceTypeLabels = SERVICE_TYPE_LABELS;
  readonly meses = MESES_COMPLETOS;
  readonly anos: number[];

  /** Verdadeiro até a primeira carga de veículos+resumo+serviços terminar. */
  readonly initialLoading = signal(true);

  readonly vehicles = signal<Vehicle[]>([]);
  readonly resumo = signal<VehiclesResumo | null>(null);
  readonly services = signal<ServicoVeiculo[]>([]);
  readonly totalServices = signal(0);
  readonly filtroVeiculoId = signal<number | null>(null);
  readonly buscaServicos = signal<string>('');
  /** Filtro de ano/mês dos cards de total gasto por veículo -- sem valor por padrão (mostra tudo).
   * Não afeta a tabela de serviços abaixo (tem os próprios filtros) nem o gráfico de evolução
   * (sempre olha a janela rolante dos últimos 12 meses, independente disso). */
  readonly mesResumo = signal<number | null>(null);
  readonly anoResumo = signal<number | null>(null);
  readonly serviceAttachmentKeys = signal<Set<string>>(new Set());

  readonly vehiclesSort = signal<SortState>(UNSORTED);
  readonly servicesSort = signal<SortState>(UNSORTED);

  readonly servicesSortOptions: readonly SortOption[] = [
    { value: DEFAULT_SORT_KEY, label: 'Mais recentes' },
    { value: 'date:asc', label: 'Mais antigos' },
    { value: 'value:desc', label: 'Maior valor' },
    { value: 'value:asc', label: 'Menor valor' },
    { value: 'mileage:desc', label: 'Maior km' },
    { value: 'vehicle:asc', label: 'Veículo (A–Z)' },
  ];

  readonly sortedVehicles = computed(() =>
    sortItems(this.vehicles(), this.vehiclesSort(), (v, column) => this.vehicleSortValue(v, column)),
  );
  readonly sortedServices = computed(() =>
    sortItems(this.services(), this.servicesSort(), (s, column) => this.serviceSortValue(s, column)),
  );

  readonly chartData = computed(() => buildVeiculosChartData(this.resumo()));
  /** Texto do gráfico pra leitor de tela. */
  readonly chartLabel = computed(() => {
    const resumo = this.resumo();
    const nomes = resumo?.veiculos.map((v) => v.vehicle_name).join(', ') ?? '';
    return `Gráfico de colunas: gasto mensal com manutenção por veículo nos últimos ${resumo?.meses.length ?? 12} meses${nomes ? ` (${nomes})` : ''}.`;
  });
  // computed: as cores dos eixos/legenda seguem o tema ativo
  readonly chartOptions = computed(() => veiculosChartOptions());

  constructor(
    private readonly veiculosService: VeiculosService,
    private readonly servicosService: ServicosVeiculosService,
    private readonly attachmentsService: AttachmentsService,
    private readonly toastCtrl: ToastController,
    private readonly modalCtrl: ModalController,
    private readonly popoverCtrl: PopoverController,
  ) {
    addIcons({ addCircleOutline, carSportOutline, buildOutline, createOutline, trashOutline, attachOutline });
    const currentYear = new Date().getFullYear();
    this.anos = Array.from({ length: 6 }, (_, i) => currentYear - i);
  }

  /**
   * O ion-router-outlet mantém a instância da página em cache (mesma razão documentada no login) --
   * usar ionViewWillEnter (não ngOnInit) garante que os dados são recarregados toda vez que a página
   * reaparece, não só na primeira criação da instância. Sem isso, trocar de conta mostrava os dados
   * da conta anterior até um F5 manual.
   */
  /** Exclusões com "Desfazer" ainda pendentes são confirmadas ao sair da página. */
  ionViewWillLeave(): void {
    this.undoDelete.flushAll();
  }

  ionViewWillEnter(): void {
    this.reload();
  }

  onFiltroVeiculoChange(vehicleId: number | null): void {
    this.filtroVeiculoId.set(vehicleId);
    this.reloadServices();
  }

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

  onBuscaServicosInput(ev: CustomEvent): void {
    this.buscaServicos.set(String((ev.detail as { value?: string })?.value ?? '').trim());
    this.reloadServices();
  }

  private servicesListParams() {
    return { vehicle_id: this.filtroVeiculoId() ?? undefined, busca: this.buscaServicos() || undefined };
  }

  private reload(): void {
    forkJoin([
      this.veiculosService.list(),
      this.veiculosService.resumo(12, this.anoResumo() ?? undefined, this.mesResumo() ?? undefined),
      this.servicosService.list({ ...this.servicesListParams(), limit: PAGE_SIZE, offset: 0 }),
    ]).subscribe(([vehicles, resumo, servicesPage]) => {
      this.vehicles.set(vehicles);
      this.resumo.set(resumo);
      this.services.set(servicesPage.items);
      this.totalServices.set(servicesPage.total);
      this.initialLoading.set(false);
      this.refreshServiceAttachmentKeys();
    });
  }

  private reloadResumo(): void {
    this.veiculosService
      .resumo(12, this.anoResumo() ?? undefined, this.mesResumo() ?? undefined)
      .subscribe((resumo) => this.resumo.set(resumo));
  }

  private reloadServices(): void {
    this.servicosService.list({ ...this.servicesListParams(), limit: PAGE_SIZE, offset: 0 }).subscribe((page) => {
      this.services.set(page.items);
      this.totalServices.set(page.total);
      this.refreshServiceAttachmentKeys();
    });
  }

  carregarMaisServicos(): void {
    this.servicosService
      .list({ ...this.servicesListParams(), limit: PAGE_SIZE, offset: this.services().length })
      .subscribe((page) => {
        this.services.set([...this.services(), ...page.items]);
        this.totalServices.set(page.total);
        this.refreshServiceAttachmentKeys();
      });
  }

  rowKeyServico(servico: ServicoVeiculo): string {
    return String(servico.id);
  }

  private refreshServiceAttachmentKeys(): void {
    const keys = Array.from(new Set(this.services().map((s) => this.rowKeyServico(s))));
    if (!keys.length) {
      this.serviceAttachmentKeys.set(new Set());
      return;
    }
    this.attachmentsService
      .exists('servico_veiculo', keys)
      .subscribe((res) => this.serviceAttachmentKeys.set(new Set(res.entity_ids_with_attachments)));
  }

  async abrirAnexosServico(ev: Event, servico: ServicoVeiculo): Promise<void> {
    const { AttachmentsPopoverComponent } = await import('../../shared/attachments-popover.component');
    const files = await firstValueFrom(this.attachmentsService.list('servico_veiculo', servico.id));
    const popover = await this.popoverCtrl.create({
      component: AttachmentsPopoverComponent,
      componentProps: { files },
      event: ev,
    });
    await popover.present();
  }

  serviceTypeLabel(type: ServiceType | null): string {
    return type ? this.serviceTypeLabels[type] : '-';
  }

  private sideModalOptions() {
    return isDesktopViewport()
      ? { cssClass: SIDE_MODAL_CSS_CLASS, enterAnimation: slideInFromRight, leaveAnimation: slideOutToRight }
      : {};
  }

  async abrirAdicionarVeiculo(): Promise<void> {
    const { AdicionarVeiculoModalComponent } = await import(
      '../../modals/adicionar-veiculo/adicionar-veiculo-modal.component'
    );
    const modal = await this.modalCtrl.create({ component: AdicionarVeiculoModalComponent, ...this.sideModalOptions() });
    await modal.present();
    const { role } = await modal.onWillDismiss();
    if (role === 'saved') {
      this.reload();
    }
  }

  async abrirAdicionarServico(): Promise<void> {
    const { AdicionarServicoModalComponent } = await import(
      '../../modals/adicionar-servico/adicionar-servico-modal.component'
    );
    const modal = await this.modalCtrl.create({ component: AdicionarServicoModalComponent, ...this.sideModalOptions() });
    await modal.present();
    const { role } = await modal.onWillDismiss();
    if (role === 'saved') {
      this.reload();
    }
  }

  async editarVeiculo(vehicle: Vehicle): Promise<void> {
    const { EditarVeiculoModalComponent } = await import('../../modals/editar-veiculo/editar-veiculo-modal.component');
    const modal = await this.modalCtrl.create({
      component: EditarVeiculoModalComponent,
      componentProps: { vehicle },
      ...this.sideModalOptions(),
    });
    await modal.present();
    const { role } = await modal.onWillDismiss();
    if (role === 'saved') {
      this.reload();
    }
  }

  excluirVeiculo(vehicle: Vehicle): void {
    this.undoDelete.schedule({
      message: `Veículo "${vehicle.name}" excluído. O histórico de serviços dele fica guardado.`,
      hide: () => this.vehicles.update((lista) => lista.filter((v) => v.id !== vehicle.id)),
      restore: () => this.reload(),
      commit: () => this.veiculosService.remove(vehicle.id),
      // Cards de resumo e gráfico dependem da lista de veículos.
      onCommitted: () => this.reload(),
      errorMessage: 'Erro ao excluir o veículo.',
    });
  }

  async editarServico(servico: ServicoVeiculo): Promise<void> {
    const { EditarServicoModalComponent } = await import('../../modals/editar-servico/editar-servico-modal.component');
    const modal = await this.modalCtrl.create({
      component: EditarServicoModalComponent,
      componentProps: { servico },
      ...this.sideModalOptions(),
    });
    await modal.present();
    const { role } = await modal.onWillDismiss();
    if (role === 'saved') {
      this.reload();
    }
  }

  excluirServico(servico: ServicoVeiculo): void {
    this.undoDelete.schedule({
      message: `Serviço "${servico.description}" de ${formatBRL(servico.value)} excluído.`,
      hide: () => {
        this.services.update((lista) => lista.filter((s) => s.id !== servico.id));
        this.totalServices.update((n) => n - 1);
      },
      restore: () => this.reload(),
      commit: () => this.servicosService.remove(servico.id),
      onCommitted: () => this.reload(),
      errorMessage: 'Erro ao excluir o serviço.',
    });
  }

  toggleVehiclesSort(column: string): void {
    this.vehiclesSort.update((s) => toggleSortState(s, column));
  }

  toggleServicesSort(column: string): void {
    this.servicesSort.update((s) => toggleSortState(s, column));
  }

  private vehicleSortValue(vehicle: Vehicle, column: string): unknown {
    switch (column) {
      case 'name':
        return vehicle.name;
      case 'year':
        return vehicle.year;
      default:
        return null;
    }
  }

  private serviceSortValue(servico: ServicoVeiculo, column: string): unknown {
    switch (column) {
      case 'date':
        return servico.date;
      case 'vehicle':
        return servico.vehicle_name;
      case 'description':
        return servico.description;
      case 'notes':
        return servico.notes ?? '';
      case 'value':
        return servico.value;
      case 'type':
        return this.serviceTypeLabel(servico.service_type);
      case 'mileage':
        return servico.mileage ?? -1;
      default:
        return null;
    }
  }
}
