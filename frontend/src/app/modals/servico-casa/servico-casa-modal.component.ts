import { Component, Input, OnInit, ViewChild, inject, signal } from '@angular/core';
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

import {
  CASA_CATEGORIA_LABELS,
  CASA_SERVICE_TYPE_LABELS,
  CasaCategoria,
  CasaService,
  CasaServiceType,
  Imovel,
  nivelPermite,
  ServicoCasa,
  ServicoCasaPayload,
} from '../../services/casa.service';
import { AttachmentPickerComponent } from '../../shared/attachment-picker.component';
import { extractHttpErrorMessage } from '../../shared/attachment-types';
import { AutofocusDirective } from '../../shared/autofocus.directive';
import { CurrencyInputDirective } from '../../shared/currency-input.directive';
import { DateFieldComponent } from '../../shared/date-field.component';
import { todayIso, toIsoDate } from '../../shared/launch-date';
import { ReceiptValueHintComponent } from '../../shared/receipt-value-hint.component';
import { ReceiptValueAutofill, ReceiptValueService } from '../../shared/receipt-value.service';
import { commitAttachments } from '../../shared/save-with-attachments';

/** Atalhos de garantia, contados a partir da data do serviço. */
export const GARANTIA_ATALHOS: { label: string; meses: number }[] = [
  { label: '3 meses', meses: 3 },
  { label: '6 meses', meses: 6 },
  { label: '1 ano', meses: 12 },
  { label: '5 anos', meses: 60 },
];

/** `iso` + n meses; dia que não existe no mês cai no último dia (mesma regra das parcelas). */
export function addMonthsIso(iso: string, meses: number): string {
  const [ano, mes, dia] = iso.split('-').map(Number);
  const ultimoDia = new Date(ano, mes - 1 + meses + 1, 0).getDate();
  return toIsoDate(new Date(ano, mes - 1 + meses, Math.min(dia, ultimoDia)));
}

/** Data mais antiga aceita (espelha MIN_SERVICE_DATE do backend). */
const MIN_SERVICE_DATE = '1950-01-01';

/**
 * Adicionar (sem `servico`) ou editar um serviço de Manutenção Casa. Ao adicionar, a data é
 * escolhida (hoje por padrão, só passado); ao editar, a data não muda (mesma regra de gastos).
 */
@Component({
  selector: 'app-servico-casa-modal',
  templateUrl: './servico-casa-modal.component.html',
  styleUrls: ['./servico-casa-modal.component.scss'],
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
    DateFieldComponent,
    ReceiptValueHintComponent,
  ],
})
export class ServicoCasaModalComponent implements OnInit {
  @Input() servico?: ServicoCasa;
  /** Anexos já na fila ao abrir (arquivo compartilhado de outro app). */
  @Input() initialFiles: File[] = [];
  @ViewChild(AttachmentPickerComponent) attachmentPicker?: AttachmentPickerComponent;

  /** Foto sendo processada / anexo subindo -- salvar agora gravaria o registro sem o anexo. */
  get attachmentBusy(): boolean {
    return this.attachmentPicker?.uploading() ?? false;
  }

  readonly imoveis = signal<Imovel[] | null>(null);
  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  private readonly savedAny = signal(false);

  readonly categorias = Object.entries(CASA_CATEGORIA_LABELS) as [CasaCategoria, string][];
  readonly serviceTypes = Object.entries(CASA_SERVICE_TYPE_LABELS) as [CasaServiceType, string][];
  readonly garantiaAtalhos = GARANTIA_ATALHOS;
  readonly minDate = MIN_SERVICE_DATE;
  readonly maxDate = todayIso();

  readonly form = this.fb.nonNullable.group({
    imovelId: this.fb.control<number | null>(null, Validators.required),
    categoria: this.fb.control<CasaCategoria | null>(null, Validators.required),
    description: this.fb.nonNullable.control('', Validators.required),
    value: this.fb.control<number | null>(null, [Validators.required, Validators.min(0)]),
    date: this.fb.nonNullable.control(todayIso()),
    prestador: this.fb.nonNullable.control(''),
    serviceType: this.fb.control<CasaServiceType | null>(null),
    garantiaAte: this.fb.control<string | null>(null),
    notes: this.fb.nonNullable.control(''),
  });

  /** Valor lido do comprovante anexado (PDF ou foto), só com o campo vazio. */
  readonly valorComprovante = new ReceiptValueAutofill(inject(ReceiptValueService), this.form.controls.value);

  constructor(
    private readonly fb: FormBuilder,
    private readonly casaService: CasaService,
    private readonly toastCtrl: ToastController,
    private readonly modalCtrl: ModalController,
  ) {
    addIcons({ close });
  }

  get editing(): boolean {
    return this.servico != null;
  }

  /** Data do serviço: a escolhida (adicionar) ou a gravada (editar) -- base dos atalhos de garantia. */
  serviceDate(): string {
    return this.servico?.date ?? this.form.controls.date.value;
  }

  ngOnInit(): void {
    this.casaService.listImoveis().subscribe((todos) => {
      // Compartilhados comigo: só os que deixam cadastrar (adicionar) ou editar (editar, e do mesmo
      // dono do serviço -- ele não muda de dono).
      const donoDoServico = this.servico ? todos.find((i) => i.id === this.servico!.imovel_id)?.dono?.id ?? null : null;
      const imoveis = todos.filter((i) =>
        this.servico
          ? nivelPermite(i.meu_nivel, 'edicao') && (i.dono?.id ?? null) === donoDoServico
          : nivelPermite(i.meu_nivel, 'cadastro'),
      );
      this.imoveis.set(imoveis);
      // Um imóvel só (o caso comum): já vem escolhido.
      if (!this.servico && imoveis.length === 1 && this.form.controls.imovelId.value == null) {
        this.form.controls.imovelId.setValue(imoveis[0].id);
      }
    });
    if (this.servico) {
      this.form.patchValue({
        imovelId: this.servico.imovel_id,
        categoria: this.servico.categoria,
        description: this.servico.description,
        value: this.servico.value,
        date: this.servico.date,
        prestador: this.servico.prestador ?? '',
        serviceType: this.servico.service_type,
        garantiaAte: this.servico.garantia_ate,
        notes: this.servico.notes ?? '',
      });
    }
  }

  /** O imóvel do serviço em edição pode ter sido excluído: continua na lista pra não sumir do select. */
  imovelOptions(): { id: number; name: string }[] {
    const list = (this.imoveis() ?? []).map((i) => ({ id: i.id, name: i.dono ? `${i.name} (de ${i.dono.nome})` : i.name }));
    if (this.servico && !list.some((i) => i.id === this.servico!.imovel_id)) {
      return [...list, { id: this.servico.imovel_id, name: `${this.servico.imovel_name} (excluído)` }];
    }
    return list;
  }

  aplicarGarantia(meses: number): void {
    this.form.controls.garantiaAte.setValue(addMonthsIso(this.serviceDate(), meses));
  }

  async submit(): Promise<void> {
    if (this.attachmentBusy) return;
    this.errorMessage.set(null);
    const v = this.form.getRawValue();

    if (!v.imovelId || !v.categoria || !v.description.trim() || v.value == null) {
      this.errorMessage.set('Preencha o imóvel, a categoria, a descrição e o valor.');
      return;
    }
    if (v.garantiaAte && v.garantiaAte < this.serviceDate()) {
      this.errorMessage.set('A garantia não pode terminar antes da data do serviço.');
      return;
    }

    const payload: ServicoCasaPayload = {
      imovel_id: v.imovelId,
      description: v.description.trim(),
      notes: v.notes.trim() || undefined,
      value: v.value,
      categoria: v.categoria,
      service_type: v.serviceType ?? undefined,
      prestador: v.prestador.trim() || undefined,
      garantia_ate: v.garantiaAte,
    };

    this.saving.set(true);
    if (this.servico) {
      this.casaService.updateServico(this.servico.id, payload).subscribe({
        next: async (updated) => {
          this.saving.set(false);
          const toast = await this.toastCtrl.create({ message: 'Serviço atualizado.', duration: 2000, color: 'success' });
          await toast.present();
          this.modalCtrl.dismiss(updated, 'saved');
        },
        error: (err) => {
          this.saving.set(false);
          this.errorMessage.set(`Erro ao atualizar o serviço: ${extractHttpErrorMessage(err)}`);
        },
      });
      return;
    }

    this.casaService.createServico({ ...payload, date: v.date }).subscribe({
      next: (servico) => {
        this.savedAny.set(true);
        void commitAttachments({
          commit: this.attachmentPicker!.commit(servico.id),
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

  /** Depois de salvar, continua aberto pro próximo serviço -- mantém imóvel e data. */
  private resetForm(): void {
    const { imovelId, date } = this.form.getRawValue();
    this.form.reset({
      imovelId,
      categoria: null,
      description: '',
      value: null,
      date,
      prestador: '',
      serviceType: null,
      garantiaAte: null,
      notes: '',
    });
    this.attachmentPicker?.reset();
  }
}
