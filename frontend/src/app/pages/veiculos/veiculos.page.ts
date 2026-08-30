import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import {
  AlertController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
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
import { addCircleOutline, attachOutline, buildOutline, carSportOutline, create, trash } from 'ionicons/icons';
import { firstValueFrom, forkJoin } from 'rxjs';

import { SERVICE_TYPE_LABELS } from '../../modals/adicionar-servico/adicionar-servico-modal.component';
import { isDesktopViewport, slideInFromRight, slideOutToRight, SIDE_MODAL_CSS_CLASS } from '../../modals/side-modal.animations';
import { AttachmentsService } from '../../services/attachments.service';
import { ServiceType, ServicoVeiculo, ServicosVeiculosService } from '../../services/servicos-veiculos.service';
import { Vehicle, VeiculosService, VehiclesResumo } from '../../services/veiculos.service';
import { LoadingStateComponent } from '../../shared/loading-state.component';
import { SortState, sortItems, toggleSortState, UNSORTED } from '../../shared/sortable';
import { SortThComponent } from '../../shared/sort-th.component';
import { buildVeiculosChartData, VEICULOS_CHART_OPTIONS } from './veiculos-chart';

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
    DatePipe,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonButton,
    IonTitle,
    IonContent,
    IonIcon,
    IonSelect,
    IonSelectOption,
    BaseChartDirective,
    SortThComponent,
    LoadingStateComponent,
  ],
})
export class VeiculosPage {
  readonly serviceTypeLabels = SERVICE_TYPE_LABELS;

  /** Verdadeiro até a primeira carga de veículos+resumo+serviços terminar. */
  readonly initialLoading = signal(true);

  readonly vehicles = signal<Vehicle[]>([]);
  readonly resumo = signal<VehiclesResumo | null>(null);
  readonly services = signal<ServicoVeiculo[]>([]);
  readonly totalServices = signal(0);
  readonly filtroVeiculoId = signal<number | null>(null);
  readonly serviceAttachmentKeys = signal<Set<string>>(new Set());

  readonly vehiclesSort = signal<SortState>(UNSORTED);
  readonly servicesSort = signal<SortState>(UNSORTED);

  readonly sortedVehicles = computed(() =>
    sortItems(this.vehicles(), this.vehiclesSort(), (v, column) => this.vehicleSortValue(v, column)),
  );
  readonly sortedServices = computed(() =>
    sortItems(this.services(), this.servicesSort(), (s, column) => this.serviceSortValue(s, column)),
  );

  readonly chartData = computed(() => buildVeiculosChartData(this.resumo()));
  readonly chartOptions = VEICULOS_CHART_OPTIONS;

  constructor(
    private readonly veiculosService: VeiculosService,
    private readonly servicosService: ServicosVeiculosService,
    private readonly attachmentsService: AttachmentsService,
    private readonly alertCtrl: AlertController,
    private readonly toastCtrl: ToastController,
    private readonly modalCtrl: ModalController,
    private readonly popoverCtrl: PopoverController,
  ) {
    addIcons({ addCircleOutline, carSportOutline, buildOutline, create, trash, attachOutline });
  }

  /**
   * O ion-router-outlet mantém a instância da página em cache (mesma razão documentada no login) --
   * usar ionViewWillEnter (não ngOnInit) garante que os dados são recarregados toda vez que a página
   * reaparece, não só na primeira criação da instância. Sem isso, trocar de conta mostrava os dados
   * da conta anterior até um F5 manual.
   */
  ionViewWillEnter(): void {
    this.reload();
  }

  onFiltroVeiculoChange(vehicleId: number | null): void {
    this.filtroVeiculoId.set(vehicleId);
    this.reloadServices();
  }

  private reload(): void {
    const vehicleId = this.filtroVeiculoId() ?? undefined;
    forkJoin([
      this.veiculosService.list(),
      this.veiculosService.resumo(),
      this.servicosService.list({ vehicle_id: vehicleId, limit: PAGE_SIZE, offset: 0 }),
    ]).subscribe(([vehicles, resumo, servicesPage]) => {
      this.vehicles.set(vehicles);
      this.resumo.set(resumo);
      this.services.set(servicesPage.items);
      this.totalServices.set(servicesPage.total);
      this.initialLoading.set(false);
      this.refreshServiceAttachmentKeys();
    });
  }

  private reloadServices(): void {
    const vehicleId = this.filtroVeiculoId() ?? undefined;
    this.servicosService.list({ vehicle_id: vehicleId, limit: PAGE_SIZE, offset: 0 }).subscribe((page) => {
      this.services.set(page.items);
      this.totalServices.set(page.total);
      this.refreshServiceAttachmentKeys();
    });
  }

  carregarMaisServicos(): void {
    const vehicleId = this.filtroVeiculoId() ?? undefined;
    this.servicosService
      .list({ vehicle_id: vehicleId, limit: PAGE_SIZE, offset: this.services().length })
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

  async excluirVeiculo(vehicle: Vehicle): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Excluir veículo',
      message: `Remover o veículo "${vehicle.name}"? O histórico de serviços dele deixa de aparecer, mas não é excluído.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Excluir',
          role: 'destructive',
          handler: () => {
            this.veiculosService.remove(vehicle.id).subscribe(async () => {
              this.reload();
              const toast = await this.toastCtrl.create({ message: 'Veículo excluído.', duration: 2000, color: 'success' });
              await toast.present();
            });
          },
        },
      ],
    });
    await alert.present();
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

  async excluirServico(servico: ServicoVeiculo): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Excluir serviço',
      message: `Remover o serviço "${servico.description}" de ${formatBRL(servico.value)}? Essa ação não pode ser desfeita.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Excluir',
          role: 'destructive',
          handler: () => {
            this.servicosService.remove(servico.id).subscribe(async () => {
              this.reload();
              const toast = await this.toastCtrl.create({ message: 'Serviço excluído.', duration: 2000, color: 'success' });
              await toast.present();
            });
          },
        },
      ],
    });
    await alert.present();
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
