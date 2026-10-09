import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular';
import { of } from 'rxjs';

import { AttachmentsService } from '../../services/attachments.service';
import { Gasto, GastosService } from '../../services/gastos.service';
import { ReceitasService } from '../../services/receitas.service';
import { DetalhesMes, ResumoService } from '../../services/resumo.service';
import { DetalhesMesModalComponent } from './detalhes-mes-modal.component';

const ind = (valor: number, media: number | null = null, variacao_pct: number | null = null) => ({ valor, media, variacao_pct });

const DETALHES: DetalhesMes = {
  ano: 2026, mes: 10, situacao: 'atual', dia_atual: 5, dias_no_mes: 31, meses_base: 3,
  receita: ind(5000, 4800, 4), gastos: ind(1500, 1000, 50), caixa_pretendido: ind(2500),
  caixa_real: ind(3500), disponivel: ind(1000, 1500, -33),
  quantidade_gastos: 2, quantidade_receitas: 1,
  categorias: [
    { item_id: 1, item_name: 'Carro', priority: 'essencial', total: 1000, pct: 66.7, lancamentos: 1, media: 200, variacao_pct: 400 },
    { item_id: 2, item_name: 'Lazer', priority: 'nao_essencial', total: 500, pct: 33.3, lancamentos: 1, media: 0, variacao_pct: null },
  ],
  composicao: { recorrentes: 0, parcelas: 0, avulsos_essenciais: 1000, avulsos_nao_essenciais: 500 },
  ja_lancado: 1000, programado: 500,
};

function gasto(over: Partial<Gasto>): Gasto {
  return {
    id: 1, priority: 'essencial', item_id: 1, item_name: 'Carro', value: 1000, description: 'Pneus',
    is_installment: false, installment_count: null, installment_number: null, installment_group_id: null,
    recorrencia_id: null, date: '2026-10-02', created_at: '2026-10-02', ...over,
  };
}

describe('DetalhesMesModalComponent', () => {
  let fixture: ComponentFixture<DetalhesMesModalComponent>;
  let component: DetalhesMesModalComponent;
  let detalhesSpy: ReturnType<typeof vi.fn>;

  function setup(valoresOcultos = false) {
    detalhesSpy = vi.fn(() => of(DETALHES));
    TestBed.configureTestingModule({
      providers: [
        provideIonicAngular(),
        { provide: ResumoService, useValue: { detalhesMes: detalhesSpy } },
        {
          provide: GastosService,
          useValue: {
            list: () =>
              of({
                items: [gasto({}), gasto({ id: 2, item_id: 2, item_name: 'Lazer', priority: 'nao_essencial', value: 500, description: 'Show', date: '2099-10-25' })],
                total: 2,
              }),
          },
        },
        { provide: ReceitasService, useValue: { list: () => of({ items: [], total: 0 }) } },
        { provide: AttachmentsService, useValue: { exists: () => of({ entity_ids_with_attachments: [] }) } },
      ],
    });
    fixture = TestBed.createComponent(DetalhesMesModalComponent);
    component = fixture.componentInstance;
    component.ano = 2026;
    component.mes = 10;
    component.valoresOcultos = valoresOcultos;
    fixture.detectChanges();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('mostra o resumo, as categorias e o que ainda vai cair', () => {
    const el = setup();
    expect(detalhesSpy).toHaveBeenCalledWith(2026, 10);
    expect(el.textContent).toContain('Outubro de 2026');
    expect(el.textContent).toContain('Em andamento · dia 5 de 31');
    expect(el.textContent).toContain('↑ 50% vs média');
    expect(el.textContent).toContain('Novo neste mês');
    expect(el.textContent).toContain('Ainda vai cair este mês');
    expect(el.textContent).toContain('Show');
  });

  it('filtra a lista ao tocar numa categoria', () => {
    setup();
    component.toggleCategoria(2);
    expect(component.filtrados().map((g) => g.id)).toEqual([2]);
    component.toggleCategoria(2);
    expect(component.filtrados().length).toBe(2);
  });

  it('navega entre meses virando o ano', () => {
    setup();
    component.periodo.set({ ano: 2026, mes: 1 });
    component.mudarMes(-1);
    expect(component.periodo()).toEqual({ ano: 2025, mes: 12 });
    expect(detalhesSpy).toHaveBeenLastCalledWith(2025, 12);
  });

  it('esconde os R$ no modo privacidade, mantendo os percentuais', () => {
    const el = setup(true);
    expect(el.textContent).not.toContain('1.500,00');
    expect(el.textContent).toContain('67%');
  });
});
