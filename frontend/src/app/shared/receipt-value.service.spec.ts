import { FormControl } from '@angular/forms';

import { ReceiptValueAutofill, ReceiptValueService } from './receipt-value.service';

function reader(values: (number | null)[], delay?: Promise<void>): ReceiptValueService {
  const queue = [...values];
  return {
    canRead: (f: File) => f.type === 'application/pdf',
    readValue: async () => {
      await delay;
      return queue.shift() ?? null;
    },
  } as unknown as ReceiptValueService;
}

const pdf = (name = 'a.pdf') => new File(['%PDF'], name, { type: 'application/pdf' });

describe('ReceiptValueAutofill', () => {
  it('preenche o campo vazio e avisa', async () => {
    const control = new FormControl<number | null>(null);
    const autofill = new ReceiptValueAutofill(reader([187.45]), control);
    await autofill.onFilesAdded([pdf()]);
    expect(control.value).toBe(187.45);
    expect(autofill.filled()).toBe(187.45);
    expect(autofill.reading()).toBe(false);
  });

  it('não mexe num valor já digitado', async () => {
    const control = new FormControl<number | null>(10);
    const autofill = new ReceiptValueAutofill(reader([187.45]), control);
    await autofill.onFilesAdded([pdf()]);
    expect(control.value).toBe(10);
    expect(autofill.filled()).toBeNull();
  });

  it('não sobrescreve o que foi digitado durante a leitura', async () => {
    let release!: () => void;
    const control = new FormControl<number | null>(null);
    const autofill = new ReceiptValueAutofill(reader([187.45], new Promise<void>((r) => (release = r))), control);
    const done = autofill.onFilesAdded([pdf()]);
    control.setValue(30);
    release();
    await done;
    expect(control.value).toBe(30);
  });

  it('tenta o próximo arquivo quando o primeiro não tem valor', async () => {
    const control = new FormControl<number | null>(null);
    const autofill = new ReceiptValueAutofill(reader([null, 42]), control);
    await autofill.onFilesAdded([pdf('1.pdf'), pdf('2.pdf')]);
    expect(control.value).toBe(42);
  });

  it('ignora o que não sabe ler e tira o aviso quando o valor muda', async () => {
    const control = new FormControl<number | null>(null);
    const autofill = new ReceiptValueAutofill(reader([99]), control);
    await autofill.onFilesAdded([new File(['x'], 'f.png', { type: 'image/png' })]);
    expect(control.value).toBeNull();

    await autofill.onFilesAdded([pdf()]);
    expect(autofill.filled()).toBe(99);
    control.setValue(100);
    expect(autofill.filled()).toBeNull();
  });
});
