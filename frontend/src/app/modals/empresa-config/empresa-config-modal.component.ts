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
  IonText,
  IonTitle,
  IonToolbar,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { close } from 'ionicons/icons';

import { Empresa, EmpresaService } from '../../services/empresa.service';
import { AttachmentPickerComponent } from '../../shared/attachment-picker.component';
import { formatCnpj, isValidCnpj, onlyDigits } from '../../shared/cnpj';
import { httpErrorMessage } from '../../shared/http-error';
import { commitAttachments } from '../../shared/save-with-attachments';

/**
 * Cadastro/edição da empresa (uma por usuário) + documentos dela (CCMEI, contratos, declarações),
 * guardados como anexos do tipo "empresa". No primeiro cadastro os documentos esperam a empresa
 * ser salva; depois sobem na hora.
 */
@Component({
  selector: 'app-empresa-config-modal',
  templateUrl: './empresa-config-modal.component.html',
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
    AttachmentPickerComponent,
  ],
  styles: [
    `
      .form-hint {
        margin: 4px 4px 12px;
        font-size: 0.8rem;
        color: var(--app-text-secondary);
      }
      .section-label {
        margin: 24px 4px 0;
        font-size: 1rem;
      }
    `,
  ],
})
export class EmpresaConfigModalComponent implements OnInit {
  @Input() empresa: Empresa | null = null;

  @ViewChild(AttachmentPickerComponent) attachmentPicker!: AttachmentPickerComponent;

  readonly saving = signal(false);
  readonly errorMessage = signal<string | null>(null);
  private documentosMudaram = false;

  readonly form = this.fb.nonNullable.group({
    nome: this.fb.nonNullable.control(''),
    cnpj: this.fb.nonNullable.control(''),
    dataAbertura: this.fb.nonNullable.control(''),
  });

  constructor(
    private readonly fb: FormBuilder,
    private readonly empresaService: EmpresaService,
    private readonly toastCtrl: ToastController,
    private readonly modalCtrl: ModalController,
  ) {
    addIcons({ close });
  }

  get attachmentBusy(): boolean {
    return this.attachmentPicker?.uploading() ?? false;
  }

  ngOnInit(): void {
    if (this.empresa) {
      this.form.setValue({
        nome: this.empresa.nome,
        cnpj: formatCnpj(this.empresa.cnpj),
        dataAbertura: this.empresa.data_abertura,
      });
    }
  }

  onCnpjInput(ev: CustomEvent): void {
    const formatted = formatCnpj(String((ev.detail as { value?: string })?.value ?? ''));
    this.form.controls.cnpj.setValue(formatted);
    (ev.target as HTMLIonInputElement).value = formatted;
  }

  onDocumentosChanged(): void {
    this.documentosMudaram = true;
  }

  submit(): void {
    if (this.saving() || this.attachmentBusy) return;
    this.errorMessage.set(null);
    const { nome, cnpj, dataAbertura } = this.form.getRawValue();
    if (!nome.trim()) return this.errorMessage.set('Informe o nome da empresa.');
    if (!isValidCnpj(onlyDigits(cnpj))) return this.errorMessage.set('CNPJ inválido.');
    if (!dataAbertura) return this.errorMessage.set('Informe a data de abertura.');

    this.saving.set(true);
    this.empresaService.save({ nome: nome.trim(), cnpj: onlyDigits(cnpj), data_abertura: dataAbertura }).subscribe({
      next: async (empresa) => {
        if (!this.empresa) {
          await commitAttachments({
            commit: this.attachmentPicker.commit(empresa.id),
            toastCtrl: this.toastCtrl,
            successMessage: 'Empresa cadastrada.',
            savedLabel: 'Empresa cadastrada',
          });
        } else {
          const toast = await this.toastCtrl.create({ message: 'Empresa atualizada.', duration: 2000, color: 'success' });
          await toast.present();
        }
        this.saving.set(false);
        await this.modalCtrl.dismiss(empresa, 'saved');
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.errorMessage.set(httpErrorMessage(err, 'Erro ao salvar a empresa.'));
      },
    });
  }

  dismiss(): void {
    // Documento adicionado/excluído já foi gravado -- a página precisa recarregar a lista.
    this.modalCtrl.dismiss(null, this.documentosMudaram ? 'saved' : 'cancel');
  }
}
