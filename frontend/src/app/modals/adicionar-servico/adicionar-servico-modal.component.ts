import { Component, OnInit, ViewChild, signal } from '@angular/core';
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
import { AttachmentPickerComponent } from '../../shared/attachment-picker.component';
import { extractHttpErrorMessage } from '../../shared/attachment-types';
import { CurrencyInputDirective } from '../../shared/currency-input.directive';
import { AutofocusDirective } from '../../shared/autofocus.directive';
import { commitAttachments } from '../../shared/save-with-attachments';

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
    AutofocusDirective,
    CurrencyInputDirective,
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
    AttachmentPickerComponent,
  ],
})
export class AdicionarServicoModalComponent implements OnInit {
  @ViewChild(AttachmentPickerComponent) attachmentPicker!: AttachmentPickerComponent;

  /** Foto sendo processada / anexo subindo -- salvar agora gravaria o registro sem o anexo. */
  get attachmentBusy(): boolean {
    return this.attachmentPicker?.uploading() ?? false;
  }

  readonly vehicles = signal<Vehicle[]>([]);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  private readonly savedAny = signal(false);

  readonly serviceTypes = Object.entries(SERVICE_TYPE_LABELS) as [ServiceType, string][];

  readonly form = this.fb.nonNullable.group({
    vehicleId: this.fb.control<number | null>(null, Validators.required),
    description: this.fb.nonNullable.control('', Validators.required),
    notes: this.fb.nonNullable.control(''),
    value: this.fb.control<number | null>(null, [Validators.required, Validators.min(0)]),
    serviceType: this.fb.control<ServiceType | null>(null),
    mileage: this.fb.control<number | null>(null, [Validators.required, Validators.min(0)]),
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

  async submit(): Promise<void> {
    if (this.attachmentBusy) return;
    this.errorMessage.set(null);
    const { vehicleId, description, notes, value, serviceType, mileage } = this.form.getRawValue();

    if (!vehicleId || !description || value == null || mileage == null) {
      this.errorMessage.set('Preencha o veículo, a descrição, o valor e a quilometragem.');
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
        mileage,
      })
      .subscribe({
        next: (servico) => {
          this.savedAny.set(true);
          void commitAttachments({
            commit: this.attachmentPicker.commit(servico.id),
            toastCtrl: this.toastCtrl,
            successMessage: 'Serviço salvo.',
            savedLabel: 'Serviço salvo',
          }).then(() => {
            this.saving.set(false);
            this.resetForm();
          });
        },
        error: (err) => {
          this.saving.set(false);
          this.errorMessage.set(`Erro ao salvar o serviço: ${extractHttpErrorMessage(err)}`);
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
    this.attachmentPicker.reset();
  }
}
