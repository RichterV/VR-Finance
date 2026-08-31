import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';
import { of } from 'rxjs';

import { AttachmentsService } from '../../services/attachments.service';
import { Gasto, GastosService } from '../../services/gastos.service';
import { ReceitasService } from '../../services/receitas.service';
import { DadosPage } from './dados.page';

function gasto(overrides: Partial<Gasto>): Gasto {
  return {
    id: 0,
    priority: 'essencial',
    item_id: 1,
    item_name: 'Casa',
    value: 0,
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

describe('DadosPage', () => {
  let component: DadosPage;
  let fixture: ComponentFixture<DadosPage>;

  const gastos: Gasto[] = [
    gasto({ id: 1, item_name: 'Casa', value: 300, date: '2026-03-10' }),
    gasto({ id: 2, item_name: 'Lanche', value: 100, date: '2026-01-05' }),
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideIonicAngular(),
        provideRouter([]),
        { provide: GastosService, useValue: { list: () => of({ items: gastos, total: gastos.length }) } },
        { provide: ReceitasService, useValue: { list: () => of({ items: [], total: 0 }) } },
        { provide: AttachmentsService, useValue: { exists: () => of({ entity_ids_with_attachments: [] }) } },
      ],
    });
    fixture = TestBed.createComponent(DadosPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
    // A carga de dados mora em ionViewWillEnter (não ngOnInit) desde o fix de "trocar de conta" --
    // fixture.detectChanges() sozinho não dispara esse hook do Ionic, é preciso chamar direto.
    component.ionViewWillEnter();
  });

  it('should create and load gastos on init', () => {
    expect(component).toBeTruthy();
    expect(component.gastos().map((g) => g.id)).toEqual([1, 2]);
  });

  it('marks only gastos with attachments after checking in bulk', () => {
    const attachmentsService = TestBed.inject(AttachmentsService);
    vi.spyOn(attachmentsService, 'exists').mockReturnValue(of({ entity_ids_with_attachments: ['1'] }));
    component.ionViewWillEnter();

    expect(attachmentsService.exists).toHaveBeenCalledWith('gasto', ['1', '2']);
    expect(component.gastoAttachmentKeys().has(component.rowKeyGasto(gastos[0]))).toBe(true);
    expect(component.gastoAttachmentKeys().has(component.rowKeyGasto(gastos[1]))).toBe(false);
  });

  it('typing in the gastos search box reloads with the busca param', () => {
    const gastosService = TestBed.inject(GastosService);
    const listSpy = vi.spyOn(gastosService, 'list').mockReturnValue(of({ items: gastos, total: gastos.length }));

    component.onBuscaGastosInput({ detail: { value: 'mercado' } } as CustomEvent);

    expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ busca: 'mercado', limit: 25, offset: 0 }));
  });

  it('typing in the receitas search box reloads with the busca param, not affecting gastos', () => {
    const receitasService = TestBed.inject(ReceitasService);
    const listSpy = vi.spyOn(receitasService, 'list').mockReturnValue(of({ items: [], total: 0 }));

    component.onBuscaReceitasInput({ detail: { value: 'salário' } } as CustomEvent);

    expect(listSpy).toHaveBeenCalledWith(expect.objectContaining({ busca: 'salário' }));
    expect(component.buscaGastos()).toBe('');
  });

  it('leaves the list in server order until a column header is clicked', () => {
    expect(component.sortedGastos().map((g) => g.id)).toEqual([1, 2]);
  });

  it('toggling the "value" column sorts ascending then descending', () => {
    component.toggleGastosSort('value');
    expect(component.sortedGastos().map((g) => g.value)).toEqual([100, 300]);

    component.toggleGastosSort('value');
    expect(component.sortedGastos().map((g) => g.value)).toEqual([300, 100]);
  });

  it('toggling the "date" column sorts chronologically', () => {
    component.toggleGastosSort('date');
    expect(component.sortedGastos().map((g) => g.id)).toEqual([2, 1]);
  });

  it('switching to a different column resets to ascending', () => {
    component.toggleGastosSort('value');
    component.toggleGastosSort('value');
    component.toggleGastosSort('item');
    expect(component.sortedGastos().map((g) => g.item_name)).toEqual(['Casa', 'Lanche']);
  });
});
