import { TestBed } from '@angular/core/testing';
import { AlertController, ModalController, provideIonicAngular } from '@ionic/angular';
import { of } from 'rxjs';

import { AuthService } from '../../core/auth.service';
import { AttachmentsService } from '../../services/attachments.service';
import { ReceiptValueService } from '../../shared/receipt-value.service';
import { RecordRow, RecordSource, RecordSourcesService } from '../../shared/record-sources.service';
import { AnexarExistenteModalComponent } from './anexar-existente-modal.component';

function makeSource(type: RecordSource['type'], extra: Partial<RecordSource> = {}): RecordSource {
  const source: RecordSource = {
    type,
    toNoun: `ao ${type}`,
    label: type,
    acceptsXml: type === 'nota_fiscal',
    search: vi.fn(() => of({ rows: [rowOf(source, 1, 50)], total: 1 })),
    recent: vi.fn(() => of([])),
    openEditor: vi.fn(),
    ...extra,
  };
  return source;
}

function rowOf(source: RecordSource, id: number, value: number): RecordRow {
  return { source, key: `${source.type}-${id}`, entityId: id, date: '2026-10-11', title: `item ${id}`, meta: '', value, record: { id } };
}

describe('AnexarExistenteModalComponent', () => {
  let upload: ReturnType<typeof vi.fn>;
  let dismiss: ReturnType<typeof vi.fn>;
  let alertRole: string;
  let modules: string[];
  let sources: RecordSource[];
  let suggestions: ReturnType<typeof vi.fn>;
  let readValue: number | null;

  function create(files: File[]) {
    TestBed.configureTestingModule({
      providers: [
        provideIonicAngular(),
        { provide: AttachmentsService, useValue: { upload } },
        { provide: ModalController, useValue: { dismiss } },
        {
          provide: AlertController,
          useValue: { create: async () => ({ present: async () => undefined, onDidDismiss: async () => ({ role: alertRole }) }) },
        },
        { provide: AuthService, useValue: { hasModule: (k: string) => modules.includes(k) } },
        { provide: ReceiptValueService, useValue: { canRead: () => true, readValue: async () => readValue } },
        { provide: RecordSourcesService, useValue: { all: sources, suggestions } },
      ],
    });
    const fixture = TestBed.createComponent(AnexarExistenteModalComponent);
    fixture.componentRef.setInput('files', files);
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  const pdf = new File(['%PDF'], 'nota.pdf', { type: 'application/pdf' });
  const xml = new File(['<x/>'], 'nfse.xml', { type: 'application/xml' });

  beforeEach(() => {
    upload = vi.fn(() => of({ id: 1 }));
    dismiss = vi.fn().mockResolvedValue(true);
    alertRole = 'confirm';
    modules = [];
    readValue = 50;
    suggestions = vi.fn(() => of([]));
    sources = [
      makeSource('gasto'),
      makeSource('receita'),
      makeSource('servico_veiculo', { module: 'veiculos' }),
      makeSource('nota_fiscal', { module: 'empresa' }),
    ];
  });

  it('mostra só os tipos dos módulos do usuário e carrega o primeiro', () => {
    const c = create([pdf]);
    expect(c.sources.map((s) => s.type)).toEqual(['gasto', 'receita']);
    expect(c.rows().map((r) => r.title)).toEqual(['item 1']);
  });

  it('só XML: só nota fiscal', () => {
    modules = ['empresa', 'veiculos'];
    const c = create([xml]);
    expect(c.sources.map((s) => s.type)).toEqual(['nota_fiscal']);
  });

  it('pede sugestões pelo valor lido', async () => {
    const c = create([pdf]);
    await vi.waitFor(() => expect(suggestions).toHaveBeenCalled());
    expect(suggestions.mock.calls[0][1]).toBe(50);
    expect(c.valorLido()).toBe(50);
  });

  it('confirmar sobe os arquivos no registro e fecha com o resultado', async () => {
    const c = create([pdf]);
    const row = c.rows()[0];
    await c.choose(row);
    expect(upload).toHaveBeenCalledWith('gasto', 1, pdf);
    expect(dismiss).toHaveBeenCalledWith({ row, count: 1 }, 'attached');
  });

  it('XML fica de fora quando o tipo não aceita', async () => {
    const c = create([pdf, xml]);
    await c.choose(c.rows()[0]);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload).toHaveBeenCalledWith('gasto', 1, pdf);
  });

  it('cancelar a confirmação não sobe nada', async () => {
    alertRole = 'cancel';
    const c = create([pdf]);
    await c.choose(c.rows()[0]);
    expect(upload).not.toHaveBeenCalled();
    expect(dismiss).not.toHaveBeenCalled();
  });

  it('trocar de tipo busca de novo', () => {
    const c = create([pdf]);
    c.selectSource(sources[1]);
    expect(sources[1].search).toHaveBeenCalledWith('', 0, 25);
    expect(c.rows()[0].source.type).toBe('receita');
  });
});
