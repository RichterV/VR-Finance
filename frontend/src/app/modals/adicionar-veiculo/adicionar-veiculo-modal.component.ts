import { Component, signal } from '@angular/core';
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

import { VeiculosService } from '../../services/veiculos.service';

@Component({
  selector: 'app-adicionar-veiculo-modal',
  templateUrl: './adicionar-veiculo-modal.component.html',
  styleUrls: ['./adicionar-veiculo-modal.component.scss'],
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
export class AdicionarVeiculoModalComponent {
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  private readonly savedAny = signal(false);

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

  async submit(): Promise<void> {
    this.errorMessage.set(null);
    const { name, year } = this.form.getRawValue();

    if (!name || !year) {
      this.errorMessage.set('Preencha o nome e o ano do veículo.');
      return;
    }

    this.saving.set(true);
    this.veiculosService.create({ name, year }).subscribe({
      next: async () => {
        this.saving.set(false);
        this.savedAny.set(true);
        const toast = await this.toastCtrl.create({ message: 'Veículo salvo.', duration: 2000, color: 'success' });
        await toast.present();
        this.form.reset({ name: '', year: null });
      },
      error: async () => {
        this.saving.set(false);
        const toast = await this.toastCtrl.create({ message: 'Erro ao salvar o veículo.', duration: 2500, color: 'danger' });
        await toast.present();
      },
    });
  }

  dismiss(): void {
    this.modalCtrl.dismiss(null, this.savedAny() ? 'saved' : 'cancel');
  }
}
