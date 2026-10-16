import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';
import { of } from 'rxjs';

import { AttachmentsService } from '../../services/attachments.service';
import { CasaService, Imovel, ServicoCasa } from '../../services/casa.service';
import { CasaPage } from './casa.page';

const ana = { id: 1, username: 'dona', nome: 'Ana Dona' };

function imovel(overrides: Partial<Imovel>): Imovel {
  return { id: 1, name: 'Casa', active: true, dono: null, meu_nivel: 'dono', compartilhamento_id: null, compartilhado_com: 0, ...overrides };
}

function servico(overrides: Partial<ServicoCasa>): ServicoCasa {
  return {
    id: 1,
    imovel_id: 1,
    imovel_name: 'Casa',
    description: 'Troca do chuveiro',
    notes: null,
    value: 100,
    categoria: 'eletrica',
    service_type: null,
    prestador: null,
    garantia_ate: null,
    date: '2026-10-01',
    criado_por: 2,
    criado_por_nome: 'Bruno C',
    created_at: '2026-10-01T12:00:00+00:00',
    ...overrides,
  };
}

describe('CasaPage (compartilhamento)', () => {
  function setup(): CasaPage {
    TestBed.configureTestingModule({
      providers: [
        provideIonicAngular(),
        provideRouter([]),
        { provide: CasaService, useValue: { listImoveis: () => of([]), resumo: () => of(null), listServicos: () => of({ items: [], total: 0 }) } },
        { provide: AttachmentsService, useValue: { exists: () => of({ entity_ids_with_attachments: [] }) } },
      ],
    });
    return TestBed.createComponent(CasaPage).componentInstance;
  }

  it('shows edit/delete only as far as my level in the property allows', () => {
    const page = setup();
    page.imoveis.set([
      imovel({ id: 1, name: 'Minha' }),
      imovel({ id: 2, name: 'Leitura', dono: ana, meu_nivel: 'leitura', compartilhamento_id: 10 }),
      imovel({ id: 3, name: 'Edição', dono: ana, meu_nivel: 'edicao', compartilhamento_id: 11 }),
      imovel({ id: 4, name: 'Tudo', dono: ana, meu_nivel: 'total', compartilhamento_id: 12 }),
    ]);
    const s = (imovel_id: number) => servico({ imovel_id });

    expect([1, 2, 3, 4].map((id) => page.podeEditar(s(id)))).toEqual([true, false, true, true]);
    expect([1, 2, 3, 4].map((id) => page.podeExcluir(s(id)))).toEqual([true, false, false, true]);
    // Serviço de imóvel meu já excluído (fora da lista) continua meu.
    expect(page.podeExcluir(s(99))).toBe(true);
  });

  it('hides "Adicionar serviço" when no property lets me add', () => {
    const page = setup();
    expect(page.podeAdicionarServico()).toBe(true); // ainda sem imóvel: o modal explica o que fazer
    page.imoveis.set([imovel({ id: 2, dono: ana, meu_nivel: 'leitura' })]);
    expect(page.podeAdicionarServico()).toBe(false);
    page.imoveis.set([imovel({ id: 2, dono: ana, meu_nivel: 'cadastro' })]);
    expect(page.podeAdicionarServico()).toBe(true);
  });

  it('shows the owner tag and "cadastrado por" only on shared properties', () => {
    const page = setup();
    page.imoveis.set([
      imovel({ id: 1, name: 'Só minha' }),
      imovel({ id: 2, name: 'Minha compartilhada', compartilhado_com: 1 }),
      imovel({ id: 3, name: 'Da Ana', dono: ana, meu_nivel: 'cadastro' }),
    ]);
    expect(page.donoDoImovel(3)).toBe('Ana Dona');
    expect(page.donoDoImovel(1)).toBeNull();
    expect(page.autorDoServico(servico({ imovel_id: 1 }))).toBeNull();
    expect(page.autorDoServico(servico({ imovel_id: 2 }))).toBe('cadastrado por Bruno C');
    expect(page.autorDoServico(servico({ imovel_id: 3, criado_por: null, criado_por_nome: null }))).toBe(
      'cadastrado por usuário removido',
    );
  });
});
