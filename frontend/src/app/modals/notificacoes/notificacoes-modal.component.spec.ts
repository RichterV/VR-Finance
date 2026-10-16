import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ModalController, provideIonicAngular, ToastController } from '@ionic/angular';
import { of } from 'rxjs';

import { ModalLauncherService } from '../../core/modal-launcher.service';
import { CasaService } from '../../services/casa.service';
import { fakeAvisoRelatorio, fakeConvite, fakeNotificacao } from '../../services/notificacoes.fixtures';
import { Notificacao, NotificacoesService } from '../../services/notificacoes.service';
import { NotificacoesModalComponent } from './notificacoes-modal.component';

describe('NotificacoesModalComponent', () => {
  let launcher: { resumoMensal: ReturnType<typeof vi.fn>; relatorioAnual: ReturnType<typeof vi.fn> };
  let markRead: ReturnType<typeof vi.fn>;
  let load: ReturnType<typeof vi.fn>;
  let casa: { aceitarCompartilhamento: ReturnType<typeof vi.fn>; recusarCompartilhamento: ReturnType<typeof vi.fn> };

  function setup(items: Notificacao[]) {
    launcher = { resumoMensal: vi.fn(), relatorioAnual: vi.fn() };
    markRead = vi.fn(() => of(items[0]));
    load = vi.fn(() => of(items));
    casa = { aceitarCompartilhamento: vi.fn(() => of({})), recusarCompartilhamento: vi.fn(() => of({})) };
    TestBed.configureTestingModule({
      providers: [
        provideIonicAngular(),
        { provide: ModalLauncherService, useValue: launcher },
        { provide: ModalController, useValue: { dismiss: vi.fn() } },
        { provide: CasaService, useValue: casa },
        { provide: ToastController, useValue: { create: vi.fn(async () => ({ present: vi.fn() })) } },
        {
          provide: NotificacoesService,
          useValue: { items: signal(items), naoLidas: signal(items.filter((n) => !n.lida).length), markRead, markAllRead: vi.fn(), load },
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

  it('shows Accept/Decline on a pending invite and answers it', () => {
    const convite = fakeConvite();
    const fixture = setup([convite]);
    const buttons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('.convite-actions ion-button'));
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Aceitar', 'Recusar']);

    fixture.componentInstance.aceitar(convite);
    expect(casa.aceitarCompartilhamento).toHaveBeenCalledWith(7);
    expect(load).toHaveBeenCalled();

    fixture.componentInstance.recusar(convite);
    expect(casa.recusarCompartilhamento).toHaveBeenCalledWith(7);
  });

  it('shows the outcome instead of the buttons once the invite was answered', () => {
    const fixture = setup([fakeConvite({ lida: true }, { status: 'aceito' })]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.convite-actions')).toBeNull();
    expect(el.textContent).toContain('Você aceitou');
  });

  it('marks a plain share notice as read when tapped, without opening anything', () => {
    const aviso = fakeConvite(
      { tipo: 'compartilhamento_encerrado', titulo: 'Ana Dona (dona) encerrou o compartilhamento do imóvel "Casa 1".' },
      { evento: 'revogado', status: 'encerrado' },
    );
    const fixture = setup([aviso]);
    fixture.componentInstance.open(aviso);
    expect(markRead).toHaveBeenCalledWith(aviso.id);
    expect(launcher.resumoMensal).not.toHaveBeenCalled();
  });
});
