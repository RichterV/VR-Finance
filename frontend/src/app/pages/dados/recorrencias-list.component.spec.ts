import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AlertController, provideIonicAngular } from '@ionic/angular';
import { of } from 'rxjs';

import { Recorrencia, RecorrenciasService } from '../../services/recorrencias.service';
import { RecorrenciasListComponent } from './recorrencias-list.component';

function recorrencia(overrides: Partial<Recorrencia>): Recorrencia {
  return {
    id: 1,
    tipo: 'gasto',
    priority: 'essencial',
    item_id: 1,
    item_name: 'Aluguel',
    item_active: true,
    value: 1500,
    cash_percentage: null,
    description: null,
    dia: 10,
    pausada: false,
    fim_mes: null,
    status: 'ativa',
    proxima_data: '2026-11-10',
    lancamento_pendente_data: null,
    created_at: '2026-10-01',
    ...overrides,
  };
}

type AlertButton = { text: string; handler?: () => void };

describe('RecorrenciasListComponent', () => {
  let fixture: ComponentFixture<RecorrenciasListComponent>;
  let component: RecorrenciasListComponent;
  let service: { list: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn>; pausar: ReturnType<typeof vi.fn>; retomar: ReturnType<typeof vi.fn> };
  let alertButtons: AlertButton[];

  const items = [
    recorrencia({ id: 1, value: 1500 }),
    recorrencia({ id: 2, tipo: 'receita', priority: null, item_id: null, item_name: null, value: 5000, cash_percentage: 30, description: 'Salário' }),
    recorrencia({ id: 3, value: 99, status: 'pausada', pausada: true, proxima_data: null }),
  ];

  beforeEach(() => {
    service = {
      list: vi.fn(() => of(items)),
      delete: vi.fn(() => of(undefined)),
      pausar: vi.fn(() => of(items[0])),
      retomar: vi.fn(() => of(items[2])),
    };
    alertButtons = [];
    TestBed.configureTestingModule({
      providers: [
        provideIonicAngular(),
        { provide: RecorrenciasService, useValue: service },
        {
          provide: AlertController,
          useValue: {
            create: vi.fn(async (opts: { buttons: AlertButton[] }) => {
              alertButtons = opts.buttons;
              return { present: async () => undefined };
            }),
          },
        },
      ],
    });
    fixture = TestBed.createComponent(RecorrenciasListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('soma só as ativas, separando gastos e receitas', () => {
    expect(component.totais()).toEqual({ gastos: 1500, receitas: 5000, ativas: 2 });
  });

  it('receita usa a descrição como título', () => {
    expect(component.titulo(items[1])).toBe('Salário');
    expect(component.detalhe(items[1])).toBeNull();
  });

  it('pausa a ativa e retoma a pausada', () => {
    component.alternarPausa(items[0]);
    component.alternarPausa(items[2]);
    expect(service.pausar).toHaveBeenCalledWith(1);
    expect(service.retomar).toHaveBeenCalledWith(3);
  });

  it('com lançamento futuro já criado, oferece apagar junto', async () => {
    await component.excluir(recorrencia({ id: 9, lancamento_pendente_data: '2026-11-10' }));
    expect(alertButtons.map((b) => b.text)).toEqual(['Cancelar', 'Manter o lançamento', 'Apagar também']);

    alertButtons[2].handler!();
    expect(service.delete).toHaveBeenCalledWith(9, true);
  });

  it('sem lançamento futuro, só confirma', async () => {
    await component.excluir(items[0]);
    expect(alertButtons.map((b) => b.text)).toEqual(['Cancelar', 'Excluir']);

    alertButtons[1].handler!();
    expect(service.delete).toHaveBeenCalledWith(1, false);
  });
});
