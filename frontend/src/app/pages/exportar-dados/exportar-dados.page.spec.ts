import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideIonicAngular, ToastController } from '@ionic/angular';
import { of, throwError } from 'rxjs';

import { DownloadFileService } from '../../shared/download-file.service';
import { ExportService } from '../../services/export.service';
import { ExportarDadosPage } from './exportar-dados.page';

describe('ExportarDadosPage', () => {
  let fixture: ComponentFixture<ExportarDadosPage>;
  let component: ExportarDadosPage;
  let downloadSpy: ReturnType<typeof vi.fn>;
  let shareFileSpy: ReturnType<typeof vi.fn>;
  let toastCreateSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    downloadSpy = vi.fn(() => of(new Blob(['dados'])));
    shareFileSpy = vi.fn().mockResolvedValue({ shared: true });
    toastCreateSpy = vi.fn().mockResolvedValue({ present: vi.fn().mockResolvedValue(undefined) });

    TestBed.configureTestingModule({
      providers: [
        provideIonicAngular(),
        { provide: ExportService, useValue: { download: downloadSpy } },
        { provide: DownloadFileService, useValue: { shareFile: shareFileSpy } },
        { provide: ToastController, useValue: { create: toastCreateSpy } },
      ],
    });
    fixture = TestBed.createComponent(ExportarDadosPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('lists all 6 exportable modules', () => {
    expect(component.modulos.map((m) => m.chave)).toEqual([
      'gastos',
      'receitas',
      'veiculos',
      'operacoes_bolsa',
      'devedores',
      'categorias',
    ]);
  });

  it('baixar() downloads the module and shares the file with a .zip name', async () => {
    component.baixar('gastos');

    expect(downloadSpy).toHaveBeenCalledWith('gastos');
    await Promise.resolve();
    await Promise.resolve();

    expect(shareFileSpy).toHaveBeenCalledTimes(1);
    const [, filename] = shareFileSpy.mock.calls[0];
    expect(filename).toMatch(/^export_gastos_\d{8}\.zip$/);
    expect(component.baixando()).toBeNull();
  });

  it('shows an error toast when sharing the downloaded file fails', async () => {
    shareFileSpy.mockRejectedValue(new Error('falhou'));

    component.baixar('devedores');
    await Promise.resolve();
    await Promise.resolve();

    expect(toastCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'danger', message: 'Erro ao salvar o arquivo baixado.' }),
    );
  });

  it('shows an error toast when the download request fails, without touching DownloadFileService', async () => {
    downloadSpy.mockReturnValue(throwError(() => ({ status: 500 })));

    component.baixar('receitas');
    await Promise.resolve();

    expect(shareFileSpy).not.toHaveBeenCalled();
    expect(toastCreateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ color: 'danger', message: expect.stringContaining('Erro ao exportar') }),
    );
    expect(component.baixando()).toBeNull();
  });

  it('marks only the module being downloaded as busy while the request is in flight', () => {
    downloadSpy.mockReturnValue(of()); // observable que nunca emite -- simula "em andamento"

    component.baixar('operacoes_bolsa');

    expect(component.baixando()).toBe('operacoes_bolsa');
  });
});
