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
  IonText,
  IonTitle,
  IonToolbar,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { close } from 'ionicons/icons';

import { Vehicle, VeiculosService } from '../../services/veiculos.service';

@Component({
  selector: 'app-editar-veiculo-modal',
  templateUrl: './editar-veiculo-modal.component.html',
  styleUrls: ['./editar-veiculo-modal.component.scss'],
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
    IonInput,
    IonText,
  ],
})
export class EditarVeiculoModalComponent implements OnInit {
  @Input({ required: true }) vehicle!: Vehicle;

  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    name: this.fb.nonNullable.control('', Validators.required),
    year: this.fb.control<number | null>(null, [Validators.required, Validators.min(1900), Validators.max(2100)]),
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly veiculosService: VeiculosService,
    private readonly toastCtrl: ToastController,
    private readonly modalCtrl: ModalController,
  ) {
    addIcons({ close });
  }

  ngOnInit(): void {
    this.form.patchValue({ name: this.vehicle.name, year: this.vehicle.year });
  }

  async submit(): Promise<void> {
    this.errorMessage.set(null);
    const { name, year } = this.form.getRawValue();

    if (!name || !year) {
      this.errorMessage.set('Preencha o nome e o ano do veículo.');
      return;
    }

    this.saving.set(true);
    this.veiculosService.update(this.vehicle.id, { name, year }).subscribe({
      next: async (updated) => {
        this.saving.set(false);
        const toast = await this.toastCtrl.create({ message: 'Veículo atualizado.', duration: 2000, color: 'success' });
        await toast.present();
        this.modalCtrl.dismiss(updated, 'saved');
      },
      error: async () => {
        this.saving.set(false);
        const toast = await this.toastCtrl.create({ message: 'Erro ao atualizar o veículo.', duration: 2500, color: 'danger' });
        await toast.present();
      },
    });
  }

  dismiss(): void {
    this.modalCtrl.dismiss(null, 'cancel');
  }
}
