import { HttpErrorResponse } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ModalController, ToastController, provideIonicAngular } from '@ionic/angular';
import { of, throwError } from 'rxjs';

import { EmpresaService } from '../../services/empresa.service';
import { DownloadFileService } from '../../shared/download-file.service';
import { DeclaracaoAnualModalComponent, anoPadraoDeclaracao } from './declaracao-anual-modal.component';

describe('anoPadraoDeclaracao', () => {
  it('suggests last year, but never before the opening year', () => {
    expect(anoPadraoDeclaracao(2020, new Date(2026, 3, 10))).toBe(2025);
    expect(anoPadraoDeclaracao(2026, new Date(2026, 3, 10))).toBe(2026);
  });
});

describe('DeclaracaoAnualModalComponent', () => {
  let fixture: ComponentFixture<DeclaracaoAnualModalComponent>;
  let component: DeclaracaoAnualModalComponent;
  let declaracaoAnual: ReturnType<typeof vi.fn>;
  let shareFile: ReturnType<typeof vi.fn>;
  let dismiss: ReturnType<typeof vi.fn>;

  function setup(resposta = of(new Blob(['%PDF'], { type: 'application/pdf' }))) {
    declaracaoAnual = vi.fn(() => resposta);
    shareFile = vi.fn(async () => ({ shared: true }));
    dismiss = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideIonicAngular(),
        { provide: EmpresaService, useValue: { declaracaoAnual } },
        { provide: DownloadFileService, useValue: { shareFile } },
        { provide: ModalController, useValue: { dismiss } },
        { provide: ToastController, useValue: { create: async () => ({ present: async () => undefined }) } },
      ],
    });
    fixture = TestBed.createComponent(DeclaracaoAnualModalComponent);
    component = fixture.componentInstance;
    component.empresa = { id: 1, nome: 'Empresa Exemplo', cnpj: '11222333000181', data_abertura: '2020-05-10' };
    fixture.detectChanges();
  }

  it('lists the years from the opening year to now', () => {
    setup();
    const atual = new Date().getFullYear();
    expect(component.anos[0]).toBe(atual);
    expect(component.anos.at(-1)).toBe(2020);
  });

  it('sends year, employee and revenue without invoice, then saves the PDF', async () => {
    setup();
    component.form.patchValue({ ano: 2025, empregado: true, outrasReceitas: 460.89 });
    await component.gerar();

    expect(declaracaoAnual).toHaveBeenCalledWith({ ano: 2025, empregado: true, outrasReceitas: 460.89 });
    expect(shareFile).toHaveBeenCalledWith(expect.any(Blob), 'declaracao-anual-mei-2025.pdf');
    expect(dismiss).toHaveBeenCalledWith(null, 'done');
  });

  it('shows the backend detail even though the response is a blob', async () => {
    const erro = new HttpErrorResponse({
      status: 400,
      error: new Blob([JSON.stringify({ detail: 'A empresa foi aberta em 2020' })], { type: 'application/json' }),
    });
    setup(throwError(() => erro));
    await component.gerar();

    expect(component.errorMessage()).toBe('A empresa foi aberta em 2020');
    expect(shareFile).not.toHaveBeenCalled();
    expect(dismiss).not.toHaveBeenCalled();
  });
});
