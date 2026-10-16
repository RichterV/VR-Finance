import { Component, DestroyRef, Input, OnInit, ViewChild, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonLabel,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonText,
  IonTextarea,
  IonTitle,
  IonToolbar,
  AlertController,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { close } from 'ionicons/icons';

import { DropdownOption, DropdownOptionsService, Priority } from '../../services/dropdown-options.service';
import { Gasto, GastosService } from '../../services/gastos.service';
import { AttachmentPickerComponent } from '../../shared/attachment-picker.component';

import { CATEGORY_SELECT_POPOVER_OPTIONS } from '../../shared/select-popover';
import { CategoryQuickAddComponent, NEW_CATEGORY_OPTION, insertSorted, sortByName } from '../../shared/category-quick-add.component';
import { httpErrorMessage } from '../../shared/http-error';
import { CurrencyInputDirective } from '../../shared/currency-input.directive';
import { confirmIfAnomalous } from '../../shared/anomaly-check';

@Component({
  selector: 'app-editar-gasto-modal',
  templateUrl: './editar-gasto-modal.component.html',
  styleUrls: ['./editar-gasto-modal.component.scss'],
  imports: [
    CurrencyInputDirective,
    ReactiveFormsModule,
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
    IonItem,
    IonSelect,
    IonSelectOption,
    IonInput,
    IonTextarea,
    IonText,
    AttachmentPickerComponent,
    CategoryQuickAddComponent,
  ],
})
export class EditarGastoModalComponent implements OnInit {
  @ViewChild(AttachmentPickerComponent) attachmentPicker?: AttachmentPickerComponent;

  /** Foto sendo processada / anexo subindo -- salvar agora gravaria o registro sem o anexo. */
  get attachmentBusy(): boolean {
    return this.attachmentPicker?.uploading() ?? false;
  }
  readonly categorySelectOptions = CATEGORY_SELECT_POPOVER_OPTIONS;
  readonly newCategoryOption = NEW_CATEGORY_OPTION;
  /** "+ Nova categoria" escolhido: o select vira o campo de criar categoria. */
  readonly creatingCategory = signal(false);
  /** Categoria de antes do "+ Nova categoria" -- volta pra ela ao cancelar. */
  private previousItemId: number | null = null;
  @Input({ required: true }) gasto!: Gasto;

  get attachmentEntityId(): string | number {
    return this.gasto.installment_group_id ?? this.gasto.id;
  }

  readonly items = signal<DropdownOption[]>([]);
  readonly saving = signal(false);
  /** Conferindo se o valor é fora do comum pra categoria (antes de salvar). */
  readonly checking = signal(false);
  readonly errorMessage = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    priority: this.fb.nonNullable.control<Priority>('essencial', Validators.required),
    itemId: this.fb.control<number | null>(null, Validators.required),
    value: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.01)]),
    description: this.fb.nonNullable.control(''),
  });

  private readonly destroyRef = inject(DestroyRef);

  constructor(
    private readonly fb: FormBuilder,
    private readonly dropdownService: DropdownOptionsService,
    private readonly gastosService: GastosService,
    private readonly toastCtrl: ToastController,
    private readonly alertCtrl: AlertController,
    private readonly modalCtrl: ModalController,
  ) {
    addIcons({ close });
  }

  ngOnInit(): void {
    this.watchNewCategoryOption();
    this.form.patchValue({
      priority: this.gasto.priority,
      itemId: this.gasto.item_id,
      value: this.gasto.value,
      description: this.gasto.description ?? '',
    });
    this.loadItems(this.gasto.priority);
  }

  /** "+ Nova categoria" no select não seleciona nada: abre o campo de criar no lugar dele. */
  private watchNewCategoryOption(): void {
    const { itemId } = this.form.controls;
    itemId.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((id) => {
      if (id === NEW_CATEGORY_OPTION) {
        itemId.setValue(this.previousItemId, { emitEvent: false });
        this.creatingCategory.set(true);
      } else {
        this.previousItemId = id;
      }
    });
  }

  onCategoryCreated(option: DropdownOption): void {
    this.items.update((items) => insertSorted(items, option));
    this.creatingCategory.set(false);
    this.form.controls.itemId.setValue(option.id);
  }

  onPriorityChange(value: Priority): void {
    this.form.patchValue({ priority: value, itemId: null });
    this.loadItems(value);
  }

  private loadItems(priority: Priority): void {
    this.dropdownService.list(priority).subscribe((items) => this.items.set(sortByName(items)));
  }

  async submit(): Promise<void> {
    if (this.attachmentBusy || this.checking() || this.saving()) return;
    this.errorMessage.set(null);
    const { priority, itemId, value, description } = this.form.getRawValue();

    if (!itemId || !value) {
      this.errorMessage.set('Preencha o item e o valor.');
      return;
    }

    if (!this.gasto.is_installment && value !== this.gasto.value) {
      const itemName = this.items().find((i) => i.id === itemId)?.name ?? 'essa categoria';
      this.checking.set(true);
      const confirmado = await confirmIfAnomalous(this.gastosService, this.alertCtrl, { itemId: itemId, value, itemName });
      this.checking.set(false);
      if (!confirmado) return;
    }

    this.saving.set(true);
    this.gastosService
      .update(this.gasto.id, { priority, item_id: itemId, value, description: description || undefined })
      .subscribe({
        next: async (updated) => {
          this.saving.set(false);
          const toast = await this.toastCtrl.create({ message: 'Gasto atualizado.', duration: 2000, color: 'success' });
          await toast.present();
          this.modalCtrl.dismiss(updated, 'saved');
        },
        error: async (err: unknown) => {
          this.saving.set(false);
          const toast = await this.toastCtrl.create({ message: httpErrorMessage(err, 'Erro ao atualizar o gasto.'), duration: 2500, color: 'danger' });
          await toast.present();
        },
      });
  }

  dismiss(): void {
    this.modalCtrl.dismiss(null, 'cancel');
  }
}
