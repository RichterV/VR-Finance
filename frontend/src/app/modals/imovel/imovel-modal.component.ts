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

import { CasaService, Imovel } from '../../services/casa.service';
import { AutofocusDirective } from '../../shared/autofocus.directive';
import { httpErrorMessage } from '../../shared/http-error';

/** Adicionar (sem `imovel`, continua aberto pra cadastrar outro) ou editar um imóvel de Manutenção Casa. */
@Component({
  selector: 'app-imovel-modal',
  templateUrl: './imovel-modal.component.html',
  styleUrls: ['./imovel-modal.component.scss'],
  imports: [
    AutofocusDirective,
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
export class ImovelModalComponent implements OnInit {
  @Input() imovel?: Imovel;

  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  private readonly savedAny = signal(false);

  readonly form = this.fb.nonNullable.group({
    name: this.fb.nonNullable.control('', Validators.required),
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly casaService: CasaService,
    private readonly toastCtrl: ToastController,
    private readonly modalCtrl: ModalController,
  ) {
    addIcons({ close });
  }

  get editing(): boolean {
    return this.imovel != null;
  }

  ngOnInit(): void {
    if (this.imovel) this.form.patchValue({ name: this.imovel.name });
  }

  submit(): void {
    this.errorMessage.set(null);
    const name = this.form.getRawValue().name.trim();
    if (!name) {
      this.errorMessage.set('Dê um nome pro imóvel.');
      return;
    }

    this.saving.set(true);
    const request = this.imovel
      ? this.casaService.updateImovel(this.imovel.id, name)
      : this.casaService.createImovel(name);
    request.subscribe({
      next: async (saved) => {
        this.saving.set(false);
        const toast = await this.toastCtrl.create({
          message: this.editing ? 'Imóvel atualizado.' : 'Imóvel salvo.',
          duration: 2000,
          color: 'success',
        });
        await toast.present();
        if (this.editing) {
          this.modalCtrl.dismiss(saved, 'saved');
        } else {
          this.savedAny.set(true);
          this.form.reset({ name: '' });
        }
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.errorMessage.set(httpErrorMessage(err, 'Erro ao salvar o imóvel.'));
      },
    });
  }

  dismiss(): void {
    this.modalCtrl.dismiss(null, this.savedAny() ? 'saved' : 'cancel');
  }
}
