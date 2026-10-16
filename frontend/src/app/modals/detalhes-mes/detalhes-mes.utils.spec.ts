import { Gasto } from '../../services/gastos.service';
import {
  agruparPorCategoria,
  aplicaFiltros,
  diferencaTexto,
  programados,
  ranking,
  segmentosComposicao,
  usoDaReceita,
  variacaoTexto,
  variacaoTom,
} from './detalhes-mes.utils';

function gasto(over: Partial<Gasto>): Gasto {
  return {
    id: 1, priority: 'essencial', item_id: 1, item_name: 'Casa', value: 10, description: null,
    is_installment: false, installment_count: null, installment_number: null, installment_group_id: null,
    recorrencia_id: null, date: '2026-10-01', created_at: '2026-10-01', ...over,
  };
}

const brl = (v: number) => `R$ ${v}`;

describe('detalhes-mes.utils', () => {
  it('descreve a variação contra a média', () => {
    expect(variacaoTexto({ media: null, variacao_pct: null })).toBe('Sem histórico pra comparar');
    expect(variacaoTexto({ media: 0, variacao_pct: null })).toBe('Novo neste mês');
    expect(variacaoTexto({ media: 100, variacao_pct: 0.4 })).toBe('Igual à média');
    expect(variacaoTexto({ media: 100, variacao_pct: 12.4 })).toBe('↑ 12% vs média');
    expect(variacaoTexto({ media: 100, variacao_pct: -30 })).toBe('↓ 30% vs média');
  });

  it('valores que podem ser negativos comparam em R$', () => {
    expect(diferencaTexto({ valor: -700, media: -1200 }, brl)).toBe('↑ R$ 500 acima da média');
    expect(diferencaTexto({ valor: 100, media: 400 }, brl)).toBe('↓ R$ 300 abaixo da média');
  });

  it('gasto subir é ruim, receita subir é bom, caixa pretendido é neutro', () => {
    expect(variacaoTom(20, 'menor-melhor')).toBe('ruim');
    expect(variacaoTom(-20, 'menor-melhor')).toBe('bom');
    expect(variacaoTom(20, 'maior-melhor')).toBe('bom');
    expect(variacaoTom(20, 'neutro')).toBe('neutro');
    expect(variacaoTom(null, 'menor-melhor')).toBe('neutro');
  });

  it('filtra por chips e categoria (todos precisam valer)', () => {
    const lista = [
      gasto({ id: 1, priority: 'essencial', recorrencia_id: 5 }),
      gasto({ id: 2, priority: 'nao_essencial', is_installment: true, installment_group_id: 'g' }),
      gasto({ id: 3, priority: 'essencial', item_id: 2 }),
    ];
    expect(aplicaFiltros(lista, new Set(['essencial']), new Set(), null).map((g) => g.id)).toEqual([1, 3]);
    expect(aplicaFiltros(lista, new Set(['essencial', 'recorrente']), new Set(), null).map((g) => g.id)).toEqual([1]);
    expect(aplicaFiltros(lista, new Set(['anexo']), new Set(['g']), null).map((g) => g.id)).toEqual([2]);
    expect(aplicaFiltros(lista, new Set(), new Set(), 2).map((g) => g.id)).toEqual([3]);
  });

  it('agrupa por categoria com subtotal, maior primeiro', () => {
    const grupos = agruparPorCategoria([
      gasto({ id: 1, item_id: 1, item_name: 'Casa', value: 10 }),
      gasto({ id: 2, item_id: 2, item_name: 'Carro', value: 50 }),
      gasto({ id: 3, item_id: 1, item_name: 'Casa', value: 30.1 }),
    ]);
    expect(grupos.map((g) => [g.nome, g.total])).toEqual([['Carro', 50], ['Casa', 40.1]]);
    expect(grupos[1].gastos.map((g) => g.id)).toEqual([3, 1]);
  });

  it('ranking dos 3 maiores e programados depois de hoje', () => {
    const lista = [10, 50, 30, 40].map((value, i) => gasto({ id: i + 1, value, date: `2026-10-0${i + 1}` }));
    expect([...ranking(lista).entries()]).toEqual([[2, 1], [4, 2], [3, 3]]);
    expect(programados(lista, '2026-10-02').map((g) => g.id)).toEqual([3, 4]);
  });

  it('composição ignora fatias vazias', () => {
    const s = segmentosComposicao({ recorrentes: 50, parcelas: 0, avulsos_essenciais: 25, avulsos_nao_essenciais: 25 });
    expect(s.map((x) => [x.chave, x.pct])).toEqual([['recorrentes', 50], ['essenciais', 25], ['nao-essenciais', 25]]);
  });

  it('uso da receita, inclusive quando passa dela', () => {
    expect(usoDaReceita(0, 10, 0)).toBeNull();
    expect(usoDaReceita(1000, 300, 200)).toEqual({ gastosPct: 30, caixaPct: 20, livrePct: 50, excessoPct: 0 });
    const passou = usoDaReceita(1000, 900, 300)!;
    expect(passou.excessoPct).toBeCloseTo(20);
    expect(passou.gastosPct + passou.caixaPct).toBeCloseTo(100);
  });
});
