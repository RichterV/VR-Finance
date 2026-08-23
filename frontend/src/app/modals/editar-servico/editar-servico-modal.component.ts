import { Component, Input, OnInit, signal } from '@angular/core';
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

import { SERVICE_TYPE_LABELS } from '../adicionar-servico/adicionar-servico-modal.component';
import { ServiceType, ServicoVeiculo, ServicosVeiculosService } from '../../services/servicos-veiculos.service';
import { Vehicle, VeiculosService } from '../../services/veiculos.service';
import { formatCurrencyValue, parseCentsInput } from '../../shared/currency-mask';

@Component({
  selector: 'app-editar-servico-modal',
  templateUrl: './editar-servico-modal.component.html',
  styleUrls: ['./editar-servico-modal.component.scss'],
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
export class EditarServicoModalComponent implements OnInit {
  @Input({ required: true }) servico!: ServicoVeiculo;

  readonly vehicles = signal<Vehicle[]>([]);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly valorDisplay = signal('');

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
    this.form.patchValue({
      vehicleId: this.servico.vehicle_id,
      description: this.servico.description,
      notes: this.servico.notes ?? '',
      value: this.servico.value,
      serviceType: this.servico.service_type,
      mileage: this.servico.mileage,
    });
    this.valorDisplay.set(formatCurrencyValue(this.servico.value));
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
      .update(this.servico.id, {
        vehicle_id: vehicleId,
        description,
        notes: notes || undefined,
        value,
        service_type: serviceType ?? undefined,
        mileage: mileage ?? undefined,
      })
      .subscribe({
        next: async (updated) => {
          this.saving.set(false);
          const toast = await this.toastCtrl.create({ message: 'Serviço atualizado.', duration: 2000, color: 'success' });
          await toast.present();
          this.modalCtrl.dismiss(updated, 'saved');
        },
        error: async () => {
          this.saving.set(false);
          const toast = await this.toastCtrl.create({ message: 'Erro ao atualizar o serviço.', duration: 2500, color: 'danger' });
          await toast.present();
        },
      });
  }

  dismiss(): void {
    this.modalCtrl.dismiss(null, 'cancel');
  }
}
