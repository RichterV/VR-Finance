import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular';
import { of } from 'rxjs';

import { Attachment, AttachmentsService } from '../../services/attachments.service';
import { DropdownOptionsService } from '../../services/dropdown-options.service';
import { Gasto, GastosService } from '../../services/gastos.service';
import { AdicionarGastoModalComponent } from './adicionar-gasto-modal.component';

function gasto(overrides: Partial<Gasto>): Gasto {
  return {
    id: 1,
    priority: 'essencial',
    item_id: 1,
    item_name: 'Casa',
    value: 100,
    description: null,
    is_installment: false,
    installment_count: null,
    installment_number: null,
    installment_group_id: null,
    date: '2026-01-01',
    created_at: '2026-01-01',
    ...overrides,
  };
}

function makeFile(): File {
  return new File([new Uint8Array(10)], 'comprovante.pdf', { type: 'application/pdf' });
}

function fileEvent(files: File[]): Event {
  return { target: { files, value: '' } } as unknown as Event;
}

describe('AdicionarGastoModalComponent (anexos)', () => {
  let fixture: ComponentFixture<AdicionarGastoModalComponent>;
  let component: AdicionarGastoModalComponent;
  let createSpy: ReturnType<typeof vi.fn>;
  let uploadSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createSpy = vi.fn();
    uploadSpy = vi.fn(() => of({ id: 99 } as Attachment));

    TestBed.configureTestingModule({
      providers: [
        provideIonicAngular(),
        { provide: DropdownOptionsService, useValue: { list: () => of([]) } },
        { provide: GastosService, useValue: { create: createSpy } },
        { provide: AttachmentsService, useValue: { upload: uploadSpy, list: () => of([]), remove: () => of(undefined) } },
      ],
    });
    fixture = TestBed.createComponent(AdicionarGastoModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    component.attachmentPicker.onFilesSelected(fileEvent([makeFile()]));
  });

  it('uploads the staged attachment linked to the installment_group_id when parcelado', async () => {
    createSpy.mockReturnValue(
      of([
        gasto({ id: 1, is_installment: true, installment_count: 3, installment_group_id: 'grupo-abc' }),
        gasto({ id: 2, is_installment: true, installment_count: 3, installment_group_id: 'grupo-abc' }),
        gasto({ id: 3, is_installment: true, installment_count: 3, installment_group_id: 'grupo-abc' }),
      ]),
    );
    component.form.patchValue({ itemId: 1, value: 50, isInstallment: true, installmentCount: 3 });

    await component.submit();

    expect(uploadSpy).toHaveBeenCalledWith('gasto', 'grupo-abc', expect.any(File));
  });

  it('uploads the staged attachment linked to the gasto id when not parcelado', async () => {
    createSpy.mockReturnValue(of([gasto({ id: 7, installment_group_id: null })]));
    component.form.patchValue({ itemId: 1, value: 50 });

    await component.submit();

    expect(uploadSpy).toHaveBeenCalledWith('gasto', 7, expect.any(File));
  });
});
