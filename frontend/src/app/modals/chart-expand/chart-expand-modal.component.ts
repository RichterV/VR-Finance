import { Component, Input, OnInit, computed, signal } from '@angular/core';
import {
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
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { close } from 'ionicons/icons';
import { BaseChartDirective } from 'ng2-charts';

import { buildComboChartData, buildLineChartData, comboChartOptions, lineChartOptions } from '../../home/dashboard-charts';
import { CaixaMes, EvolucaoMes, ResumoService } from '../../services/resumo.service';
import { describeCombo, describeEvolucao } from '../../home/chart-descriptions';

const JANELAS = [12, 24, 36];

@Component({
  selector: 'app-chart-expand-modal',
  templateUrl: './chart-expand-modal.component.html',
  styleUrls: ['./chart-expand-modal.component.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonIcon,
    IonTitle,
    IonContent,
    IonSelect,
    IonSelectOption,
    BaseChartDirective,
  ],
})
export class ChartExpandModalComponent implements OnInit {
  @Input({ required: true }) chartType!: 'line' | 'bar';
  @Input({ required: true }) title!: string;
  @Input({ required: true }) ano!: number;

  readonly janelas = JANELAS;
  readonly meses = signal(12);

  private readonly evolucao = signal<EvolucaoMes[]>([]);
  private readonly caixaPretendidoVsReal = signal<CaixaMes[]>([]);

  readonly lineChartData = computed(() => buildLineChartData(this.evolucao()));
  // computed: as cores dos eixos/legenda seguem o tema ativo
  readonly lineChartOptions = computed(() => lineChartOptions());

  readonly comboChartData = computed(() => buildComboChartData(this.caixaPretendidoVsReal()));
  readonly lineChartLabel = computed(() => describeEvolucao(this.evolucao(), false));
  readonly comboChartLabel = computed(() => describeCombo(this.caixaPretendidoVsReal(), false));
  readonly comboChartOptions = computed(() => comboChartOptions());

  constructor(
    private readonly resumoService: ResumoService,
    private readonly modalCtrl: ModalController,
  ) {
    addIcons({ close });
  }

  ngOnInit(): void {
    this.reload();
  }

  onJanelaChange(value: number): void {
    this.meses.set(value);
    this.reload();
  }

  private reload(): void {
    this.resumoService.anual(this.ano, this.meses()).subscribe((resumo) => {
      this.evolucao.set(resumo.evolucao_12_meses);
      this.caixaPretendidoVsReal.set(resumo.caixa_pretendido_vs_real);
    });
  }

  dismiss(): void {
    this.modalCtrl.dismiss();
  }
}
