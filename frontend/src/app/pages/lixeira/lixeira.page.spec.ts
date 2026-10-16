import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AlertController, ModalController, provideIonicAngular, ToastController } from '@ionic/angular';
import { of, throwError } from 'rxjs';

import { HomeRefreshService } from '../../core/home-refresh.service';
import { LixeiraItem, LixeiraService } from '../../services/lixeira.service';
import { UndoDeleteService } from '../../shared/undo-delete.service';
import { LixeiraPage } from './lixeira.page';

function item(overrides: Partial<LixeiraItem> = {}): LixeiraItem {
  return {
    id: 1,
    tipo: 'registro',
    entity_type: 'gasto',
    titulo: 'Pneu',
    detalhe: 'Carro',
    valor: 120,
    data_registro: '2026-10-05',
    deleted_at: new Date().toISOString(),
    expira_em: new Date(Date.now() + 15 * 24 * 3600 * 1000).toISOString(),
    anexos: [],
    ...overrides,
  };
}

describe('LixeiraPage', () => {
  let fixture: ComponentFixture<LixeiraPage>;
  let component: LixeiraPage;
  let lixeira: Record<string, ReturnType<typeof vi.fn>>;
  let homeRefresh: { request: ReturnType<typeof vi.fn> };
  let toastCreate: ReturnType<typeof vi.fn>;
  let alertRole: string;
  let undoDelete: { settle: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    lixeira = {
      list: vi.fn(() =>
        of([item(), item({ id: 2, tipo: 'anexo', entity_type: 'receita', titulo: 'recibo.pdf', detalhe: 'Salário', valor: null, data_registro: null })]),
      ),
      restore: vi.fn(() => of({ entity_type: 'gasto', entity_id: '1' })),
      delete: vi.fn(() => of(undefined)),
      empty: vi.fn(() => of(undefined)),
      downloadAnexo: vi.fn(),
    };
    homeRefresh = { request: vi.fn() };
    toastCreate = vi.fn().mockResolvedValue({ present: vi.fn().mockResolvedValue(undefined) });
    alertRole = 'destructive';
    undoDelete = { settle: vi.fn().mockResolvedValue(undefined) };

    TestBed.configureTestingModule({
      providers: [
        provideIonicAngular(),
        { provide: LixeiraService, useValue: lixeira },
        { provide: HomeRefreshService, useValue: homeRefresh },
        { provide: ToastController, useValue: { create: toastCreate } },
        {
          provide: AlertController,
          useValue: {
            create: vi.fn().mockImplementation(async () => ({
              present: vi.fn().mockResolvedValue(undefined),
              onDidDismiss: vi.fn().mockResolvedValue({ role: alertRole }),
            })),
          },
        },
        { provide: ModalController, useValue: { create: vi.fn() } },
        { provide: UndoDeleteService, useValue: undoDelete },
      ],
    });
    fixture = TestBed.createComponent(LixeiraPage);
    component = fixture.componentInstance;
  });

  it('carrega os itens ao entrar e mostra registro e anexo', async () => {
    await component.load();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Pneu');
    expect(text).toContain('recibo.pdf');
    expect(component.metaParts(component.items()[0])).toEqual(['Carro', '05/10/2026', 'Excluído hoje']);
    expect(component.metaParts(component.items()[1])).toEqual(['Receita: Salário', 'Excluído hoje']);
    expect(component.tipos()).toEqual(['gasto', 'receita']);
  });

  it('espera as exclusões recentes chegarem ao servidor antes de buscar a lista', async () => {
    let liberar!: () => void;
    undoDelete.settle.mockReturnValue(new Promise<void>((resolve) => (liberar = resolve)));
    const carregando = component.load();
    await Promise.resolve();
    expect(lixeira['list']).not.toHaveBeenCalled();
    liberar();
    await carregando;
    expect(lixeira['list']).toHaveBeenCalled();
    expect(component.items().length).toBe(2);
  });

  it('filtra por tipo', async () => {
    await component.load();
    component.onTipoChange('receita');
    expect(component.visiveis().map((i) => i.id)).toEqual([2]);
    component.onTipoChange('');
    expect(component.visiveis().length).toBe(2);
  });

  it('restaurar tira da lista, recarrega a Home e avisa', async () => {
    await component.load();
    await component.restaurar(component.items()[0]);
    expect(lixeira['restore']).toHaveBeenCalledWith(1);
    expect(component.items().map((i) => i.id)).toEqual([2]);
    expect(homeRefresh.request).toHaveBeenCalled();
    expect(toastCreate).toHaveBeenCalledWith(expect.objectContaining({ message: 'Gasto restaurado', color: 'success' }));
  });

  it('erro ao restaurar mostra o detail do backend e mantém o item', async () => {
    lixeira['restore'].mockReturnValue(throwError(() => ({ status: 400, error: { detail: 'Não dá pra restaurar: x' } })));
    await component.load();
    await component.restaurar(component.items()[0]);
    expect(component.items().length).toBe(2);
    expect(toastCreate).toHaveBeenCalledWith(expect.objectContaining({ message: 'Não dá pra restaurar: x', color: 'danger' }));
  });

  it('excluir de vez só apaga depois de confirmar', async () => {
    await component.load();
    alertRole = 'cancel';
    await component.excluirDeVez(component.items()[0]);
    expect(lixeira['delete']).not.toHaveBeenCalled();

    alertRole = 'destructive';
    await component.excluirDeVez(component.items()[0]);
    expect(lixeira['delete']).toHaveBeenCalledWith(1);
    expect(component.items().map((i) => i.id)).toEqual([2]);
  });

  it('esvaziar apaga tudo depois de confirmar', async () => {
    await component.load();
    await component.esvaziar();
    expect(lixeira['empty']).toHaveBeenCalled();
    expect(component.items()).toEqual([]);
  });

});
