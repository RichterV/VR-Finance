import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ModalController, provideIonicAngular } from '@ionic/angular';
import { of } from 'rxjs';

import { ModalLauncherService } from '../../core/modal-launcher.service';
import { fakeAvisoRelatorio, fakeNotificacao } from '../../services/notificacoes.fixtures';
import { Notificacao, NotificacoesService } from '../../services/notificacoes.service';
import { NotificacoesModalComponent } from './notificacoes-modal.component';

describe('NotificacoesModalComponent', () => {
  let launcher: { resumoMensal: ReturnType<typeof vi.fn>; relatorioAnual: ReturnType<typeof vi.fn> };
  let markRead: ReturnType<typeof vi.fn>;

  function setup(items: Notificacao[]) {
    launcher = { resumoMensal: vi.fn(), relatorioAnual: vi.fn() };
    markRead = vi.fn(() => of(items[0]));
    TestBed.configureTestingModule({
      providers: [
        provideIonicAngular(),
        { provide: ModalLauncherService, useValue: launcher },
        { provide: ModalController, useValue: { dismiss: vi.fn() } },
        {
          provide: NotificacoesService,
          useValue: { items: signal(items), naoLidas: signal(items.filter((n) => !n.lida).length), markRead, markAllRead: vi.fn() },
        },
      ],
    });
    const fixture = TestBed.createComponent(NotificacoesModalComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('opens the annual report already on that year and marks the notice as read', () => {
    const aviso = fakeAvisoRelatorio({ ano: 2026 });
    const fixture = setup([aviso]);
    expect(fixture.nativeElement.textContent).toContain('Toque para gerar o PDF com o resumo de 2026');

    fixture.componentInstance.open(aviso);
    expect(markRead).toHaveBeenCalledWith(aviso.id);
    expect(launcher.relatorioAnual).toHaveBeenCalledWith(2026);
    expect(launcher.resumoMensal).not.toHaveBeenCalled();
  });

  it('opens the monthly digest as before', () => {
    const resumo = fakeNotificacao();
    const fixture = setup([resumo]);
    fixture.componentInstance.open(resumo);
    expect(launcher.resumoMensal).toHaveBeenCalledWith(resumo, false);
    expect(launcher.relatorioAnual).not.toHaveBeenCalled();
  });
});
