import { Notificacao } from './notificacoes.service';

/** Notificação de exemplo pras specs (serviço, modal do resumo). */
export function fakeNotificacao(overrides: Partial<Notificacao> = {}): Notificacao {
  return {
    id: 1,
    tipo: 'resumo_mensal',
    ano: 2026,
    mes: 9,
    titulo: 'Resumo de setembro/2026',
    lida: false,
    created_at: '2026-10-01T12:00:00+00:00',
    payload: {
      ano: 2026,
      mes: 9,
      meses_base: 3,
      gastos: { valor: 1500, media: 1000, variacao_pct: 50 },
      receita: { valor: 2000, media: 2000, variacao_pct: 0 },
      caixa_real: { valor: 500, media: 1000, variacao_pct: -50 },
      caixa_pretendido: { valor: 600, media: null, variacao_pct: null },
      taxa_poupanca: { valor_pct: 25, media_pct: 50, meta_pct: 30 },
      subiram: [
        { item_id: 1, item_name: 'Mercado', priority: 'essencial', valor: 1500, media: 1000, diferenca: 500, variacao_pct: 50 },
      ],
      cairam: [],
      pontuais: [],
      parcelamentos_novos: [],
      parcelamentos_encerrados: [{ descricao: 'Sofá', item_name: 'Casa', valor_parcela: 300, parcelas: 6 }],
      inflacao: null,
      devedores: { parcelas_atrasadas: 2, valor_atrasado: 100 },
    },
    ...overrides,
  };
}
