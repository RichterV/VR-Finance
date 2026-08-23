import { Component, OnInit, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonSelect,
  IonSelectOption,
  IonText,
  IonTextarea,
  IonTitle,
  IonToolbar,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { close } from 'ionicons/icons';

import { ServiceType, ServicosVeiculosService } from '../../services/servicos-veiculos.service';
import { Vehicle, VeiculosService } from '../../services/veiculos.service';
import { formatCurrencyValue, parseCentsInput } from '../../shared/currency-mask';

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  peca: 'Peça',
  peca_mao_de_obra: 'Peça + Mão de obra',
  peca_mao_de_obra_propria: 'Peça e mão de obra própria',
};

@Component({
  selector: 'app-adicionar-servico-modal',
  templateUrl: './adicionar-servico-modal.component.html',
  styleUrls: ['./adicionar-servico-modal.component.scss'],
  imports: [
    ReactiveFormsModule,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonIcon,
    IonTitle,
    IonContent,
    IonItem,
    IonSelect,
    IonSelectOption,
    IonInput,
    IonTextarea,
    IonText,
  ],
})
export class AdicionarServicoModalComponent implements OnInit {
  readonly vehicles = signal<Vehicle[]>([]);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly valorDisplay = signal('');
  private readonly savedAny = signal(false);

  readonly serviceTypes = Object.entries(SERVICE_TYPE_LABELS) as [ServiceType, string][];

  readonly form = this.fb.nonNullable.group({
    vehicleId: this.fb.control<number | null>(null, Validators.required),
    description: this.fb.nonNullable.control('', Validators.required),
    notes: this.fb.nonNullable.control(''),
    value: this.fb.control<number | null>(null, [Validators.required, Validators.min(0)]),
    serviceType: this.fb.control<ServiceType | null>(null),
    mileage: this.fb.control<number | null>(null),
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly veiculosService: VeiculosService,
    private readonly servicosService: ServicosVeiculosService,
    private readonly toastCtrl: ToastController,
    private readonly modalCtrl: ModalController,
  ) {
    addIcons({ close });
  }

  ngOnInit(): void {
    this.veiculosService.list().subscribe((vehicles) => this.vehicles.set(vehicles));
  }

  onValorInput(ev: CustomEvent): void {
    const reais = parseCentsInput(String((ev.detail as { value?: string })?.value ?? ''));
    this.valorDisplay.set(reais === 0 ? '' : formatCurrencyValue(reais));
    this.form.controls.value.setValue(reais);
  }

  async submit(): Promise<void> {
    this.errorMessage.set(null);
    const { vehicleId, description, notes, value, serviceType, mileage } = this.form.getRawValue();

    if (!vehicleId || !description || value == null) {
      this.errorMessage.set('Preencha o veículo, a descrição e o valor.');
      return;
    }

    this.saving.set(true);
    this.servicosService
      .create({
        vehicle_id: vehicleId,
        description,
        notes: notes || undefined,
        value,
        service_type: serviceType ?? undefined,
        mileage: mileage ?? undefined,
      })
      .subscribe({
        next: async () => {
          this.saving.set(false);
          this.savedAny.set(true);
          const toast = await this.toastCtrl.create({ message: 'Serviço salvo.', duration: 2000, color: 'success' });
          await toast.present();
          this.resetForm();
        },
        error: async () => {
          this.saving.set(false);
          const toast = await this.toastCtrl.create({ message: 'Erro ao salvar o serviço.', duration: 2500, color: 'danger' });
          await toast.present();
        },
      });
  }

  dismiss(): void {
    this.modalCtrl.dismiss(null, this.savedAny() ? 'saved' : 'cancel');
  }

  private resetForm(): void {
    const vehicleId = this.form.getRawValue().vehicleId;
    this.form.reset({
      vehicleId,
      description: '',
      notes: '',
      value: null,
      serviceType: null,
      mileage: null,
    });
    this.valorDisplay.set('');
  }
}
