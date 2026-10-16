import { Injectable, signal } from '@angular/core';
import { AbstractControl } from '@angular/forms';
import { Capacitor, registerPlugin } from '@capacitor/core';

import { shrinkPhoto } from './camera-photo';
import { extractReceiptValue } from './receipt-value';

interface TextRecognitionPlugin {
  recognize(options: { base64: string }): Promise<{ text: string }>;
}

const TextRecognition = registerPlugin<TextRecognitionPlugin>('TextRecognition');

/** Imagem maior que isso é reduzida antes do OCR (menos bytes atravessando a ponte do Capacitor). */
const OCR_MAX_BYTES = 2 * 1024 * 1024;

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/**
 * Lê o valor de um comprovante anexado: PDF pelo texto (pdf.js, web e APK) e imagem por OCR no
 * aparelho (ML Kit, TextRecognitionPlugin -- só no APK; na web, imagem não é lida). Nada sai do
 * aparelho. Nunca lança: qualquer falha (PDF com senha, OCR sem texto) vira null.
 */
@Injectable({ providedIn: 'root' })
export class ReceiptValueService {
  async readValue(file: File): Promise<number | null> {
    try {
      const text = await this.readText(file);
      return text ? extractReceiptValue(text) : null;
    } catch {
      return null;
    }
  }

  canRead(file: File): boolean {
    return file.type === 'application/pdf' || (file.type.startsWith('image/') && Capacitor.isNativePlatform());
  }

  private async readText(file: File): Promise<string | null> {
    if (file.type === 'application/pdf') {
      const { extractPdfText } = await import('./pdf-text');
      return extractPdfText(file);
    }
    if (file.type.startsWith('image/') && Capacitor.isNativePlatform()) {
      const image = file.size > OCR_MAX_BYTES ? await shrinkPhoto(file) : file;
      const { text } = await TextRecognition.recognize({ base64: await blobToBase64(image) });
      return text;
    }
    return null;
  }
}

/**
 * Preenche o campo Valor de um modal de Adicionar com o valor lido do primeiro comprovante
 * anexado -- só se o campo estiver vazio, e nunca por cima do que o usuário digitou enquanto a
 * leitura rodava. `filled` (o valor lido) alimenta o aviso "confira"; some quando o valor muda.
 */
export class ReceiptValueAutofill {
  readonly reading = signal(false);
  readonly filled = signal<number | null>(null);

  constructor(
    private readonly reader: ReceiptValueService,
    private readonly control: AbstractControl<number | null>,
  ) {
    control.valueChanges.subscribe((value) => {
      if (this.filled() !== null && value !== this.filled()) this.filled.set(null);
    });
  }

  async onFilesAdded(files: File[]): Promise<void> {
    if (this.control.value || this.reading()) return;
    const candidates = files.filter((f) => this.reader.canRead(f));
    if (!candidates.length) return;
    this.reading.set(true);
    try {
      for (const file of candidates) {
        const value = await this.reader.readValue(file);
        if (this.control.value) return;
        if (value !== null) {
          this.control.setValue(value);
          this.control.markAsDirty();
          this.filled.set(value);
          return;
        }
      }
    } finally {
      this.reading.set(false);
    }
  }
}
