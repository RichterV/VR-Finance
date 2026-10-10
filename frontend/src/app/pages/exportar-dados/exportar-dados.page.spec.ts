import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideIonicAngular, ToastController } from '@ionic/angular';
import { of, throwError } from 'rxjs';

import { AuthService } from '../../core/auth.service';
import { ModalLauncherService } from '../../core/modal-launcher.service';
import { ModuleKey } from '../../core/modules';
import { DownloadFileService } from '../../shared/download-file.service';
import { EmpresaService } from '../../services/empresa.service';
import { ExportService } from '../../services/export.service';
import { ExportarDadosPage } from './exportar-dados.page';

describe('ExportarDadosPage', () => {
  let fixture: ComponentFixture<ExportarDadosPage>;
  let component: ExportarDadosPage;
  let downloadSpy: ReturnType<typeof vi.fn>;
  let shareFileSpy: ReturnType<typeof vi.fn>;
  let toastCreateSpy: ReturnType<typeof vi.fn>;
  let enabledModules: Set<ModuleKey>;
  let launcher: { relatorioAnual: ReturnType<typeof vi.fn>; declaracaoAnualMei: ReturnType<typeof vi.fn> };
  let empresaGet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    downloadSpy = vi.fn(() => of(new Blob(['dados'])));
    shareFileSpy = vi.fn().mockResolvedValue({ shared: true });
    toastCreateSpy = vi.fn().mockResolvedValue({ present: vi.fn().mockResolvedValue(undefined) });
    enabledModules = new Set<ModuleKey>(['veiculos', 'operacoes_bolsa', 'devedores', 'ferramentas', 'exportar_dados']);
    launcher = { relatorioAnual: vi.fn().mockResolvedValue(undefined), declaracaoAnualMei: vi.fn().mockResolvedValue(undefined) };
    empresaGet = vi.fn(() => of(null));

    TestBed.configureTestingModule({
      providers: [
        provideIonicAngular(),
        { provide: AuthService, useValue: { hasModule: (key: ModuleKey) => enabledModules.has(key) } },
        { provide: ExportService, useValue: { download: downloadSpy } },
        { provide: DownloadFileService, useValue: { shareFile: shareFileSpy } },
        { provide: ToastController, useValue: { create: toastCreateSpy } },
        { provide: ModalLauncherService, useValue: launcher },
        { provide: EmpresaService, useValue: { get: empresaGet } },
      ],
    });
    fixture = TestBed.createComponent(ExportarDadosPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('hides modules the user does not have enabled (Início ones always shown)', () => {
    enabledModules = new Set<ModuleKey>(['exportar_dados']);
    const restricted = TestBed.createComponent(ExportarDadosPage).componentInstance;
    expect(restricted.modulos().map((m) => m.chave)).toEqual(['gastos', 'receitas', 'categorias']);
  });

  it('lists all 6 exportable modules when every module is enabled', () => {
    expect(component.modulos().map((m) => m.chave)).toEqual([
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

  describe('aba Relatórios', () => {
    it('shows the MEI declaration only with the Empresa module', () => {
      expect(component.relatorios().map((r) => r.chave)).toEqual(['anual']);
      enabledModules.add('empresa');
      const comEmpresa = TestBed.createComponent(ExportarDadosPage).componentInstance;
      expect(comEmpresa.relatorios().map((r) => r.chave)).toEqual(['anual', 'declaracao_mei']);
    });

    it('switches tabs', () => {
      expect(component.aba()).toBe('dados');
      component.onAbaChange('relatorios');
      expect(component.aba()).toBe('relatorios');
    });

    it('opens the annual report year picker', async () => {
      await component.abrirRelatorio('anual');
      expect(launcher.relatorioAnual).toHaveBeenCalledWith();
      expect(component.abrindo()).toBeNull();
    });

    it('asks to register the company before the MEI declaration', async () => {
      await component.abrirRelatorio('declaracao_mei');
      expect(launcher.declaracaoAnualMei).not.toHaveBeenCalled();
      expect(toastCreateSpy).toHaveBeenCalledWith(expect.objectContaining({ color: 'warning' }));
    });

    it('opens the MEI declaration with the company', async () => {
      const empresa = { id: 1, nome: 'Empresa Exemplo', cnpj: '11222333000181', data_abertura: '2020-05-10' };
      empresaGet.mockReturnValue(of(empresa));
      await component.abrirRelatorio('declaracao_mei');
      expect(launcher.declaracaoAnualMei).toHaveBeenCalledWith(empresa);
    });
  });
});
