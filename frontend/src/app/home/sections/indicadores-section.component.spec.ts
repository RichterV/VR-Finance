import { TestBed } from '@angular/core/testing';
import { provideIonicAngular } from '@ionic/angular';
import { of } from 'rxjs';

import { ResumoService } from '../../services/resumo.service';
import { IndicadoresSectionComponent } from './indicadores-section.component';

const INDICADORES = {
  ano: 2026,
  mes: 9,
  poupanca: { atual_3m_pct: 18.4, serie: [{ ano: 2026, mes: 8, valor: 10 }, { ano: 2026, mes: 9, valor: 20 }] },
  comprometimento: { pct: 12.5, total: 1500, receita_media: 2000, meses: [{ ano: 2026, mes: 10, valor: 500 }] },
  custo_fixo: { pct: 9, total: 180, itens: [{ descricao: 'Internet', item_name: 'Casa', valor: 120 }] },
  essencial: { atual_pct: 62, inclinacao_pp_mes: -0.8, serie: [] },
};

describe('IndicadoresSectionComponent', () => {
  function setup(valoresOcultos = false) {
    const indicadores = vi.fn(() => of(INDICADORES));
    TestBed.configureTestingModule({ providers: [provideIonicAngular(), { provide: ResumoService, useValue: { indicadores } }] });
    const fixture = TestBed.createComponent(IndicadoresSectionComponent);
    fixture.componentRef.setInput('corte', { ateAno: 2026, ateMes: 9 });
    fixture.componentRef.setInput('valoresOcultos', valoresOcultos);
    fixture.detectChanges();
    return { el: fixture.nativeElement as HTMLElement, indicadores, fixture };
  }

  it('asks for the selected cutoff and shows the four indicators', () => {
    const { el, indicadores } = setup();
    expect(indicadores).toHaveBeenCalledWith({ ateAno: 2026, ateMes: 9 });
    expect(el.querySelectorAll('.stat-card').length).toBe(4);
    expect(el.textContent).toContain('18,4%');
    expect(el.textContent).toContain('−0,8 p.p./mês');
  });

  it('keeps percentages but hides currency in privacy mode', () => {
    const { el } = setup(true);
    expect(el.textContent).toContain('12,5%');
    expect(el.textContent).not.toContain('1.500,00');
  });

  it('opens the detected fixed costs in a popover instead of expanding the card', () => {
    const { el } = setup();
    const toggle = el.querySelector('.kpi-toggle') as HTMLButtonElement;
    expect(toggle.textContent).toContain('Ver 1 conta');
    expect(el.querySelector('ion-popover')?.getAttribute('trigger')).toBe(toggle.id);
  });
});
