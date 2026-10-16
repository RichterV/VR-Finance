import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ModalController, provideIonicAngular } from '@ionic/angular';
import { of } from 'rxjs';

import { NotificacoesService } from '../../services/notificacoes.service';
import { fakeNotificacao } from '../../services/notificacoes.fixtures';
import { ResumoMensalModalComponent } from './resumo-mensal-modal.component';

describe('ResumoMensalModalComponent', () => {
  let fixture: ComponentFixture<ResumoMensalModalComponent>;
  let markRead: ReturnType<typeof vi.fn>;

  function setup(notificacao = fakeNotificacao(), valoresOcultos = false): HTMLElement {
    markRead = vi.fn(() => of(notificacao));
    TestBed.configureTestingModule({
      providers: [
        provideIonicAngular(),
        { provide: NotificacoesService, useValue: { markRead } },
        { provide: ModalController, useValue: { dismiss: vi.fn(() => Promise.resolve()) } },
        { provide: Router, useValue: { navigateByUrl: vi.fn() } },
      ],
    });
    fixture = TestBed.createComponent(ResumoMensalModalComponent);
    fixture.componentInstance.notificacao = notificacao;
    fixture.componentInstance.valoresOcultos = valoresOcultos;
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('marks an unread digest as read when opened', () => {
    setup();
    expect(markRead).toHaveBeenCalledWith(1);
  });

  it('does not call the API again for a digest already read', () => {
    setup(fakeNotificacao({ lida: true }));
    expect(markRead).not.toHaveBeenCalled();
  });

  it('renders the month, the comparison period and the sections that have content', () => {
    const el = setup();
    expect(el.querySelector('.hero h1')?.textContent).toContain('Setembro de 2026');
    expect(el.querySelector('.hero p')?.textContent).toContain('junho a agosto');
    expect(el.textContent).toContain('Subiram');
    expect(el.textContent).toContain('Mercado');
    expect(el.textContent).not.toContain('Caíram');
    expect(el.textContent).toContain('Sofá');
    expect(el.textContent).toContain('2 parcelas de devedor em atraso');
    expect(el.textContent).not.toContain('Inflação da sua cesta');
  });

  it('colors a rise in spending as bad and a drop in savings as bad', () => {
    const el = setup();
    const deltas = Array.from(el.querySelectorAll('.kpi .delta'));
    expect(deltas[0].classList).toContain('bad'); // gastos +50%
    expect(deltas[2].classList).toContain('bad'); // caixa real −50%
    expect(deltas[3].textContent).toContain('Sem histórico');
  });

  it('shows a stable-month message when nothing changed much', () => {
    const n = fakeNotificacao();
    n.payload.subiram = [];
    const el = setup(n);
    expect(el.textContent).toContain('Mês estável');
  });

  it('hides currency values in privacy mode but keeps percentages', () => {
    const el = setup(fakeNotificacao(), true);
    expect(el.textContent).not.toContain('1.500,00');
    expect(el.textContent).toContain('R$ ••••');
    expect(el.textContent).toContain('25%');
  });
});
