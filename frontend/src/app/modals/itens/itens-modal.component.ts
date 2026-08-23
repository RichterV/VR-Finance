import { Component, OnInit, signal } from '@angular/core';
import {
  AlertController,
  IonButton,
  IonButtons,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonLabel,
  IonList,
  IonSegment,
  IonSegmentButton,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { add, close, create, trash } from 'ionicons/icons';

import { DropdownOption, DropdownOptionsService, Priority } from '../../services/dropdown-options.service';

@Component({
  selector: 'app-itens-modal',
  templateUrl: './itens-modal.component.html',
  styleUrls: ['./itens-modal.component.scss'],
  imports: [
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonIcon,
    IonTitle,
    IonContent,
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonList,
    IonItem,
    IonItemSliding,
    IonItemOptions,
    IonItemOption,
    IonFab,
    IonFabButton,
  ],
})
export class ItensModalComponent implements OnInit {
  readonly priority = signal<Priority>('essencial');
  readonly items = signal<DropdownOption[]>([]);

  constructor(
    private readonly service: DropdownOptionsService,
    private readonly alertCtrl: AlertController,
    private readonly modalCtrl: ModalController,
  ) {
    addIcons({ add, create, trash, close });
  }

  ngOnInit(): void {
    this.reload();
  }

  onPriorityChange(value: Priority): void {
    this.priority.set(value);
    this.reload();
  }

  reload(): void {
    this.service.list(this.priority()).subscribe((items) => this.items.set(items));
  }

  dismiss(): void {
    this.modalCtrl.dismiss();
  }

  async addItem(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Nova categoria',
      inputs: [{ name: 'name', type: 'text', placeholder: 'Nome da categoria' }],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Salvar',
          handler: (data) => {
            const name = (data.name ?? '').trim();
            if (!name) {
              return false;
            }
            this.service.create(this.priority(), name).subscribe(() => this.reload());
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  async editItem(item: DropdownOption, slidingItem: IonItemSliding): Promise<void> {
    await slidingItem.close();
    const alert = await this.alertCtrl.create({
      header: 'Editar categoria',
      inputs: [{ name: 'name', type: 'text', value: item.name }],
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Salvar',
          handler: (data) => {
            const name = (data.name ?? '').trim();
            if (!name) {
              return false;
            }
            this.service.update(item.id, name).subscribe(() => this.reload());
            return true;
          },
        },
      ],
    });
    await alert.present();
  }

  async deleteItem(item: DropdownOption, slidingItem: IonItemSliding): Promise<void> {
    await slidingItem.close();
    const alert = await this.alertCtrl.create({
      header: 'Excluir categoria',
      message: `Remover "${item.name}"? Gastos já lançados com essa categoria continuam válidos.`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Excluir',
          role: 'destructive',
          handler: () => {
            this.service.remove(item.id).subscribe(() => this.reload());
          },
        },
      ],
    });
    await alert.present();
  }
}
