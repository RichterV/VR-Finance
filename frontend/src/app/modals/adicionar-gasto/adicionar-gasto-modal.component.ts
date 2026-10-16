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
  IonToggle,
  IonToolbar,
  AlertController,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { close } from 'ionicons/icons';

import { HomeRefreshService } from '../../core/home-refresh.service';
import { DropdownOption, DropdownOptionsService, Priority } from '../../services/dropdown-options.service';
import { GastosService } from '../../services/gastos.service';
import { AttachmentPickerComponent } from '../../shared/attachment-picker.component';
import { ReceiptValueHintComponent } from '../../shared/receipt-value-hint.component';
import { ReceiptValueAutofill, ReceiptValueService } from '../../shared/receipt-value.service';

import { LaunchDateFieldComponent } from '../../shared/launch-date-field.component';
import { todayIso } from '../../shared/launch-date';
import { CATEGORY_SELECT_POPOVER_OPTIONS } from '../../shared/select-popover';
import { CategoryQuickAddComponent, NEW_CATEGORY_OPTION, insertSorted, sortByName } from '../../shared/category-quick-add.component';
import { httpErrorMessage } from '../../shared/http-error';
import { CurrencyInputDirective } from '../../shared/currency-input.directive';
import { AutofocusDirective } from '../../shared/autofocus.directive';
import { commitAttachments } from '../../shared/save-with-attachments';
import { confirmIfAnomalous } from '../../shared/anomaly-check';
import { RecurrenceFieldComponent } from '../../shared/recurrence-field.component';
import { isEndMonthValid } from '../../shared/recurrence';

@Component({
  selector: 'app-adicionar-gasto-modal',
  templateUrl: './adicionar-gasto-modal.component.html',
  styleUrls: ['./adicionar-gasto-modal.component.scss'],
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
    IonSegment,
    IonSegmentButton,
    IonLabel,
    IonItem,
    IonSelect,
    IonSelectOption,
    IonInput,
    IonToggle,
    IonTextarea,
    IonText,
    AttachmentPickerComponent,
    CategoryQuickAddComponent,
    ReceiptValueHintComponent,
    LaunchDateFieldComponent,
    RecurrenceFieldComponent,
  ],
})
export class AdicionarGastoModalComponent implements OnInit {
  readonly categorySelectOptions = CATEGORY_SELECT_POPOVER_OPTIONS;
  readonly newCategoryOption = NEW_CATEGORY_OPTION;
  /** "+ Nova categoria" escolhido: o select vira o campo de criar categoria. */
  readonly creatingCategory = signal(false);
  /** Categoria de antes do "+ Nova categoria" -- volta pra ela ao cancelar. */
  private previousItemId: number | null = null;
  /** Anexos já na fila ao abrir (arquivo compartilhado de outro app). */
  @Input() initialFiles: File[] = [];
  @ViewChild(AttachmentPickerComponent) attachmentPicker!: AttachmentPickerComponent;

  /** Foto sendo processada / anexo subindo -- salvar agora gravaria o registro sem o anexo. */
  get attachmentBusy(): boolean {
    return this.attachmentPicker?.uploading() ?? false;
  }

  readonly items = signal<DropdownOption[]>([]);
  readonly saving = signal(false);
  /** Conferindo se o valor é fora do comum pra categoria (antes de salvar). */
  readonly checking = signal(false);
  readonly errorMessage = signal<string | null>(null);
  private readonly savedAny = signal(false);

  readonly form = this.fb.nonNullable.group({
    priority: this.fb.nonNullable.control<Priority>('essencial', Validators.required),
    itemId: this.fb.control<number | null>(null, Validators.required),
    value: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.01)]),
    description: this.fb.nonNullable.control(''),
    isInstallment: this.fb.nonNullable.control(false),
    installmentCount: this.fb.control<number | null>(null),
    date: this.fb.nonNullable.control(todayIso()),
    recorrente: this.fb.nonNullable.control(false),
    recorrenciaDia: this.fb.control<number | null>(null),
    recorrenciaFim: this.fb.control<string | null>(null),
  });

  /** Valor lido do comprovante anexado (PDF ou foto), só com o campo vazio. */
  readonly valorComprovante = new ReceiptValueAutofill(inject(ReceiptValueService), this.form.controls.value);

  private readonly destroyRef = inject(DestroyRef);

  constructor(
    private readonly fb: FormBuilder,
    private readonly dropdownService: DropdownOptionsService,
    private readonly gastosService: GastosService,
    private readonly toastCtrl: ToastController,
    private readonly alertCtrl: AlertController,
    private readonly modalCtrl: ModalController,
    private readonly homeRefresh: HomeRefreshService,
  ) {
    addIcons({ close });
  }

  ngOnInit(): void {
    this.loadItems('essencial');
    this.watchNewCategoryOption();
    // Parcelado e recorrente não combinam: ligar um desliga o outro.
    const { isInstallment, recorrente } = this.form.controls;
    isInstallment.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((on) => {
      if (on && recorrente.value) recorrente.setValue(false);
    });
    recorrente.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((on) => {
      if (on && isInstallment.value) isInstallment.setValue(false);
    });
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
    const { priority, itemId, value, description, isInstallment, installmentCount, date, recorrente, recorrenciaDia, recorrenciaFim } =
      this.form.getRawValue();

    if (!itemId || !value) {
      this.errorMessage.set('Preencha o item e o valor.');
      return;
    }

    if (isInstallment && (!installmentCount || installmentCount < 2)) {
      this.errorMessage.set('Informe o número de parcelas (mínimo 2).');
      return;
    }

    const repetir = recorrente && !isInstallment;
    if (repetir && recorrenciaFim && !isEndMonthValid(date, recorrenciaFim)) {
      this.errorMessage.set('O último mês da recorrência precisa ser depois do mês do lançamento.');
      return;
    }

    if (!isInstallment) {
      const itemName = this.items().find((i) => i.id === itemId)?.name ?? 'essa categoria';
      this.checking.set(true);
      const confirmado = await confirmIfAnomalous(this.gastosService, this.alertCtrl, { itemId: itemId, value, itemName });
      this.checking.set(false);
      if (!confirmado) return;
    }

    this.saving.set(true);
    this.gastosService
      .create({
        priority,
        item_id: itemId,
        value,
        description: description || undefined,
        is_installment: isInstallment,
        installment_count: isInstallment ? installmentCount! : undefined,
        date,
        recorrente: repetir,
        recorrencia_dia: repetir ? (recorrenciaDia ?? undefined) : undefined,
        recorrencia_fim: repetir ? (recorrenciaFim ?? undefined) : undefined,
      })
      .subscribe({
        next: (rows) => {
          this.savedAny.set(true);
          // Atualiza a Home na hora (ela continua viva por baixo deste modal) -- nao espera
          // o usuario fechar o modal, que aqui fica aberto de proposito pra permitir salvar
          // varios gastos em sequencia.
          this.homeRefresh.request();
          const entityId = rows[0].installment_group_id ?? rows[0].id;
          void commitAttachments({
            commit: this.attachmentPicker.commit(entityId),
            toastCtrl: this.toastCtrl,
            successMessage: isInstallment
              ? `Gasto parcelado em ${rows.length}x salvo.`
              : recorrente
                ? 'Gasto salvo. Ele vai se repetir todo mês.'
                : 'Gasto salvo.',
            savedLabel: 'Gasto salvo',
          }).then(() => {
            this.saving.set(false);
            this.resetForm();
          });
        },
        error: async (err: unknown) => {
          this.saving.set(false);
          const toast = await this.toastCtrl.create({
            message: httpErrorMessage(err, 'Erro ao salvar o gasto.'),
            duration: 2500,
            color: 'danger',
          });
          await toast.present();
        },
      });
  }

  dismiss(): void {
    this.modalCtrl.dismiss(null, this.savedAny() ? 'saved' : 'cancel');
  }

  private resetForm(): void {
    const priority = this.form.getRawValue().priority;
    this.creatingCategory.set(false);
    this.form.reset({
      priority,
      itemId: null,
      value: null,
      description: '',
      isInstallment: false,
      installmentCount: null,
      date: todayIso(),
      recorrente: false,
      recorrenciaDia: null,
      recorrenciaFim: null,
    });
    this.attachmentPicker.reset();
  }
}
