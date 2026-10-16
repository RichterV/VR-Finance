import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalController, provideIonicAngular } from '@ionic/angular';
import { of, throwError } from 'rxjs';

import { Attachment, AttachmentsService } from '../../services/attachments.service';
import { EmpresaService, NotaFiscal, NotaXmlLida } from '../../services/empresa.service';
import { NotaFiscalModalComponent } from './nota-fiscal-modal.component';

const LIDA: NotaXmlLida = {
  numero: '19',
  chave_acesso: '9'.repeat(50),
  data_emissao: '2026-10-07',
  competencia: '2026-03-01',
  tomador_nome: 'Cliente Exemplo Ltda',
  tomador_documento: '11444777000161',
  valor: 5000,
  descricao: 'Consultoria',
  prestador_documento: '11222333000181',
  substitui_chave: '1'.repeat(50),
  avisos: ['Esta nota substitui a nº 5, que deixa de contar no limite.'],
};

function xmlEvent(file: File): Event {
  return { target: { files: [file], value: '' } } as unknown as Event;
}

describe('NotaFiscalModalComponent', () => {
  let fixture: ComponentFixture<NotaFiscalModalComponent>;
  let component: NotaFiscalModalComponent;
  let lerXml: ReturnType<typeof vi.fn>;
  let createNota: ReturnType<typeof vi.fn>;
  let upload: ReturnType<typeof vi.fn>;
  let dismiss: ReturnType<typeof vi.fn>;

  function setup(nota: NotaFiscal | null = null) {
    lerXml = vi.fn(() => of(LIDA));
    createNota = vi.fn(() => of({ ...LIDA, id: 7 }));
    upload = vi.fn(() => of({ id: 1 } as Attachment));
    dismiss = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideIonicAngular(),
        { provide: EmpresaService, useValue: { lerXml, createNota, updateNota: vi.fn(() => of(nota)) } },
        { provide: AttachmentsService, useValue: { upload, list: () => of([]), remove: () => of(undefined) } },
        { provide: ModalController, useValue: { dismiss } },
      ],
    });
    fixture = TestBed.createComponent(NotaFiscalModalComponent);
    component = fixture.componentInstance;
    component.nota = nota;
    fixture.detectChanges();
  }

  it('fills the form from the XML and queues the XML as an attachment', async () => {
    setup();
    const xml = new File(['<NFSe/>'], 'nota.xml', { type: '' });
    await component.onXmlEscolhido(xmlEvent(xml));

    const v = component.form.getRawValue();
    expect(v.numero).toBe('19');
    expect(v.competenciaMes).toBe(3);
    expect(v.competenciaAno).toBe(2026);
    expect(v.valor).toBe(5000);
    expect(component.avisos()).toEqual(LIDA.avisos);
    expect(component.substituiChave()).toBe(LIDA.substitui_chave);

    component.submit();
    await fixture.whenStable();
    expect(createNota).toHaveBeenCalledWith(
      expect.objectContaining({ numero: '19', competencia: '2026-03-01', chave_acesso: LIDA.chave_acesso, substitui_chave: LIDA.substitui_chave }),
    );
    // XML sem tipo (Android) sobe como application/xml, vinculado à nota criada
    expect(upload).toHaveBeenCalledWith('nota_fiscal', 7, expect.any(File));
    expect((upload.mock.calls[0][2] as File).type).toBe('application/xml');
  });

  it('shows the server message when the XML cannot be read', async () => {
    setup();
    lerXml.mockReturnValue(throwError(() => ({ status: 400, error: { detail: 'Não reconheci este XML como uma NFS-e.' } })));
    await component.onXmlEscolhido(xmlEvent(new File(['x'], 'x.xml')));
    expect(component.errorMessage()).toBe('Não reconheci este XML como uma NFS-e.');
    expect(component.form.getRawValue().numero).toBe('');
  });

  it('requires the main fields before saving', () => {
    setup();
    component.submit();
    expect(component.errorMessage()).toBe('Informe o número da nota.');
    expect(createNota).not.toHaveBeenCalled();
  });
});
