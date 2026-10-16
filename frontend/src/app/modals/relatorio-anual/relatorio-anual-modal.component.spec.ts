import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalController, ToastController, provideIonicAngular } from '@ionic/angular';
import { Observable, of } from 'rxjs';

import { RelatoriosService } from '../../services/relatorios.service';
import { DownloadFileService } from '../../shared/download-file.service';
import { RelatorioAnualModalComponent, anoPadraoRelatorio } from './relatorio-anual-modal.component';

describe('anoPadraoRelatorio', () => {
  const hoje = new Date(2026, 9, 9);

  it('uses the requested year (from the notification)', () => {
    expect(anoPadraoRelatorio([2026, 2025], 2024, hoje)).toBe(2024);
  });

  it('suggests last year when it has data, otherwise the most recent', () => {
    expect(anoPadraoRelatorio([2026, 2025, 2024], null, hoje)).toBe(2025);
    expect(anoPadraoRelatorio([2026], null, hoje)).toBe(2026);
  });
});

describe('RelatorioAnualModalComponent', () => {
  let fixture: ComponentFixture<RelatorioAnualModalComponent>;
  let component: RelatorioAnualModalComponent;
  let relatorioAnual: ReturnType<typeof vi.fn>;
  let shareFile: ReturnType<typeof vi.fn>;
  let dismiss: ReturnType<typeof vi.fn>;

  function setup(anos: number[], ano: number | null = null, resposta: Observable<Blob> = of(new Blob(['%PDF']))) {
    relatorioAnual = vi.fn(() => resposta);
    shareFile = vi.fn(async () => ({ shared: true }));
    dismiss = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideIonicAngular(),
        { provide: RelatoriosService, useValue: { anosRelatorioAnual: () => of(anos), relatorioAnual } },
        { provide: DownloadFileService, useValue: { shareFile } },
        { provide: ModalController, useValue: { dismiss } },
        { provide: ToastController, useValue: { create: async () => ({ present: async () => undefined }) } },
      ],
    });
    fixture = TestBed.createComponent(RelatorioAnualModalComponent);
    component = fixture.componentInstance;
    component.ano = ano;
    fixture.detectChanges();
  }

  it('lists the years with data and keeps the one from the notification', () => {
    setup([2026, 2025], 2024);
    expect(component.anos()).toEqual([2026, 2025, 2024]);
    expect(component.form.controls.ano.value).toBe(2024);
  });

  it('generates and saves the PDF for the chosen year', async () => {
    setup([2026, 2025]);
    component.form.controls.ano.setValue(2025);
    await component.gerar();

    expect(relatorioAnual).toHaveBeenCalledWith(2025);
    expect(shareFile).toHaveBeenCalledWith(expect.any(Blob), 'relatorio-anual-2025.pdf');
    expect(dismiss).toHaveBeenCalledWith(null, 'done');
  });

  it('warns that the current year is partial', () => {
    setup([new Date().getFullYear()]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('parcial');
  });
});
