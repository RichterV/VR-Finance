import { Component, Input, OnInit, ViewChild, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
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
  IonSpinner,
  IonText,
  IonTextarea,
  IonTitle,
  IonToolbar,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { close, codeDownloadOutline, swapHorizontalOutline, warningOutline } from 'ionicons/icons';
import { firstValueFrom } from 'rxjs';

import { markExpectedExternalActivity } from '../../core/expected-exit';
import { EmpresaService, NotaFiscal, NotaFiscalPayload, NotaXmlLida } from '../../services/empresa.service';
import { AttachmentPickerComponent } from '../../shared/attachment-picker.component';
import { CurrencyInputDirective } from '../../shared/currency-input.directive';
import { httpErrorMessage } from '../../shared/http-error';
import { toIsoDate } from '../../shared/launch-date';
import { MESES_COMPLETOS } from '../../shared/months';
import { commitAttachments } from '../../shared/save-with-attachments';

/**
 * Adicionar/editar nota fiscal do módulo Empresa. No cadastro, "Importar do XML" manda o XML da
 * NFS-e pro servidor, que devolve os campos lidos (nada é gravado ainda) -- o formulário é
 * preenchido, o XML já entra na fila de anexos e a pessoa só confere e salva. O PDF da nota vai
 * pelo mesmo seletor de anexos.
 */
@Component({
  selector: 'app-nota-fiscal-modal',
  templateUrl: './nota-fiscal-modal.component.html',
  styleUrls: ['./nota-fiscal-modal.component.scss'],
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
    IonItem,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonTextarea,
    IonText,
    AttachmentPickerComponent,
  ],
})
export class NotaFiscalModalComponent implements OnInit {
  /** Ausente = cadastro. */
  @Input() nota: NotaFiscal | null = null;

  @ViewChild(AttachmentPickerComponent) attachmentPicker!: AttachmentPickerComponent;

  readonly meses = MESES_COMPLETOS;
  readonly anos: number[];
  readonly saving = signal(false);
  readonly lendoXml = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly avisos = signal<string[]>([]);
  /** Chave da nota que esta substitui (vem do XML); só informativa no formulário. */
  readonly substituiChave = signal<string | null>(null);
  private chaveAcesso: string | null = null;
  private readonly savedAny = signal(false);

  readonly form = this.fb.nonNullable.group({
    numero: this.fb.nonNullable.control(''),
    dataEmissao: this.fb.nonNullable.control(toIsoDate(new Date())),
    competenciaMes: this.fb.nonNullable.control(new Date().getMonth() + 1),
    competenciaAno: this.fb.nonNullable.control(new Date().getFullYear()),
    tomadorNome: this.fb.nonNullable.control(''),
    tomadorDocumento: this.fb.nonNullable.control(''),
    valor: this.fb.control<number | null>(null),
    descricao: this.fb.nonNullable.control(''),
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly empresaService: EmpresaService,
    private readonly toastCtrl: ToastController,
    private readonly modalCtrl: ModalController,
  ) {
    addIcons({ close, codeDownloadOutline, warningOutline, swapHorizontalOutline });
    const atual = new Date().getFullYear();
    this.anos = Array.from({ length: 7 }, (_, i) => atual + 1 - i);
  }

  get isEdit(): boolean {
    return this.nota !== null;
  }

  get attachmentBusy(): boolean {
    return this.attachmentPicker?.uploading() ?? false;
  }

  ngOnInit(): void {
    if (this.nota) this.preencher(this.nota);
  }

  private preencher(dados: NotaFiscal | NotaXmlLida): void {
    const [ano, mes] = dados.competencia.split('-').map(Number);
    this.form.patchValue({
      numero: dados.numero,
      dataEmissao: dados.data_emissao,
      competenciaMes: mes,
      competenciaAno: ano,
      tomadorNome: dados.tomador_nome,
      tomadorDocumento: dados.tomador_documento ?? '',
      valor: dados.valor,
      descricao: dados.descricao ?? '',
    });
    if (!this.anos.includes(ano)) this.anos.push(ano);
    this.chaveAcesso = dados.chave_acesso;
    this.substituiChave.set(dados.substitui_chave);
  }

  escolherXml(input: HTMLInputElement): void {
    markExpectedExternalActivity();
    input.click();
  }

  async onXmlEscolhido(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.errorMessage.set(null);
    this.lendoXml.set(true);
    try {
      const lida = await firstValueFrom(this.empresaService.lerXml(file));
      this.preencher(lida);
      this.avisos.set(lida.avisos);
      this.attachmentPicker.addPendingFiles([file]);
    } catch (err) {
      this.avisos.set([]);
      this.errorMessage.set(httpErrorMessage(err, 'Não foi possível ler o XML.'));
    } finally {
      this.lendoXml.set(false);
    }
  }

  submit(): void {
    if (this.attachmentBusy || this.saving()) return;
    this.errorMessage.set(null);
    const v = this.form.getRawValue();
    if (!v.numero.trim()) return this.errorMessage.set('Informe o número da nota.');
    if (!v.dataEmissao) return this.errorMessage.set('Informe a data de emissão.');
    if (!v.tomadorNome.trim()) return this.errorMessage.set('Informe o tomador (cliente).');
    if (!v.valor || v.valor <= 0) return this.errorMessage.set('Informe o valor.');

    const payload: NotaFiscalPayload = {
      numero: v.numero.trim(),
      chave_acesso: this.chaveAcesso,
      data_emissao: v.dataEmissao,
      competencia: `${v.competenciaAno}-${String(v.competenciaMes).padStart(2, '0')}-01`,
      tomador_nome: v.tomadorNome.trim(),
      tomador_documento: v.tomadorDocumento.trim() || null,
      valor: v.valor,
      descricao: v.descricao.trim() || null,
      substitui_chave: this.substituiChave(),
    };

    this.saving.set(true);
    const request = this.nota
      ? this.empresaService.updateNota(this.nota.id, payload)
      : this.empresaService.createNota(payload);
    request.subscribe({
      next: async (nota) => {
        this.savedAny.set(true);
        if (this.nota) {
          this.saving.set(false);
          const toast = await this.toastCtrl.create({ message: 'Nota atualizada.', duration: 2000, color: 'success' });
          await toast.present();
          await this.modalCtrl.dismiss(null, 'saved');
          return;
        }
        await commitAttachments({
          commit: this.attachmentPicker.commit(nota.id),
          toastCtrl: this.toastCtrl,
          successMessage: `Nota ${nota.numero} salva.`,
          savedLabel: `Nota ${nota.numero} salva`,
        });
        this.saving.set(false);
        this.resetForm();
      },
      error: async (err: unknown) => {
        this.saving.set(false);
        this.errorMessage.set(httpErrorMessage(err, 'Erro ao salvar a nota.'));
      },
    });
  }

  dismiss(): void {
    this.modalCtrl.dismiss(null, this.savedAny() ? 'saved' : 'cancel');
  }

  private resetForm(): void {
    const hoje = new Date();
    this.form.reset({
      numero: '',
      dataEmissao: toIsoDate(hoje),
      competenciaMes: hoje.getMonth() + 1,
      competenciaAno: hoje.getFullYear(),
      tomadorNome: '',
      tomadorDocumento: '',
      valor: null,
      descricao: '',
    });
    this.chaveAcesso = null;
    this.substituiChave.set(null);
    this.avisos.set([]);
    this.attachmentPicker.reset();
  }
}
