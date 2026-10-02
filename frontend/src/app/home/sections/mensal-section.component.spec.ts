import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular';
import { of, throwError } from 'rxjs';

import { ResumoService } from '../../services/resumo.service';
import { MensalSectionComponent } from './mensal-section.component';

const RESUMO_MENSAL = {
  ano: 2026, mes: 9, total_gastos: 1000, total_receita: 2000, total_essenciais: 600, total_nao_essenciais: 400,
  quantidade_gastos: 5, quantidade_receitas: 1, total_caixa_pretendido: 600, total_caixa_real: 1000,
  percentuais_itens: [], media_gastos_lancamento: 200, media_receitas_lancamento: 2000, disponivel_para_gastar: 400,
};
const PREVISAO = {
  ano: 2026, mes: 9, dia: 15, historico_suficiente: true, receita: 2000, receita_estimada: false, comprometido: 1000,
  variavel_ate_hoje: 300, variavel_restante: 200, caixa_pretendido: 600, saldo_previsto: 200, saldo_min: 100, saldo_max: 300,
};

describe('MensalSectionComponent', () => {
  let fixture: ComponentFixture<MensalSectionComponent>;
  let service: { mensal: ReturnType<typeof vi.fn>; anual: ReturnType<typeof vi.fn>; previsao: ReturnType<typeof vi.fn> };

  function setup(ano: number, mes: number, mensal = of(RESUMO_MENSAL)) {
    service = {
      mensal: vi.fn(() => mensal),
      anual: vi.fn(() => of({ evolucao_12_meses: [] })),
      previsao: vi.fn(() => of(PREVISAO)),
    };
    TestBed.configureTestingModule({ providers: [provideIonicAngular(), { provide: ResumoService, useValue: service }] });
    fixture = TestBed.createComponent(MensalSectionComponent);
    fixture.componentRef.setInput('ano', ano);
    fixture.componentRef.setInput('mes', mes);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the end-of-month projection only for the current month', () => {
    const hoje = new Date();
    const el = setup(hoje.getFullYear(), hoje.getMonth() + 1);
    expect(service.previsao).toHaveBeenCalled();
    expect(el.textContent).toContain('Projeção do fim do mês');
  });

  it('does not ask for a projection for past months', () => {
    const el = setup(2020, 1);
    expect(service.previsao).not.toHaveBeenCalled();
    expect(el.textContent).not.toContain('Projeção do fim do mês');
  });

  it('shows an error state with retry instead of spinning forever', () => {
    const el = setup(2020, 1, throwError(() => ({ status: 500 })));
    expect(el.querySelector('app-error-state')).not.toBeNull();
    service.mensal.mockReturnValue(of(RESUMO_MENSAL));
    fixture.componentInstance.carregar();
    fixture.detectChanges();
    expect(el.textContent).toContain('Disponível pra gastar');
  });
});
