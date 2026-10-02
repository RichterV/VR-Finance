import { CaixaMes, EvolucaoMes, InflacaoPonto, ResumoGeral } from '../services/resumo.service';
import { MESES_COMPLETOS } from '../shared/months';

/**
 * Frases-resumo dos gráficos pra leitor de tela (aria-label do <canvas>). Com os valores ocultos,
 * só dizem o que o gráfico mostra, sem números.
 */

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const PCT = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

function periodo(pontos: { ano: number; mes: number }[]): string {
  if (!pontos.length) return '';
  const primeiro = pontos[0];
  const ultimo = pontos[pontos.length - 1];
  return `de ${MESES_COMPLETOS[primeiro.mes - 1].toLowerCase()}/${primeiro.ano} a ${MESES_COMPLETOS[ultimo.mes - 1].toLowerCase()}/${ultimo.ano}`;
}

function faixa(valores: number[]): string {
  return `entre ${BRL.format(Math.min(...valores))} e ${BRL.format(Math.max(...valores))}`;
}

export function describeEvolucao(evolucao: EvolucaoMes[], oculto: boolean): string {
  const base = `Gráfico de linhas: gastos essenciais, não essenciais e caixa real por mês, ${periodo(evolucao)}.`;
  if (oculto || !evolucao.length) return base;
  return (
    `${base} Essenciais ${faixa(evolucao.map((m) => m.essencial))}; não essenciais ` +
    `${faixa(evolucao.map((m) => m.nao_essencial))}; caixa real ${faixa(evolucao.map((m) => m.caixa))}.`
  );
}

export function describeCombo(rows: CaixaMes[], oculto: boolean): string {
  const base = `Gráfico de colunas: receita, caixa pretendido e caixa real por mês, ${periodo(rows)}.`;
  if (oculto || !rows.length) return base;
  const ultimo = rows[rows.length - 1];
  return (
    `${base} No último mês: receita ${BRL.format(ultimo.receita)}, caixa pretendido ` +
    `${BRL.format(ultimo.caixa_pretendido)} e caixa real ${BRL.format(ultimo.caixa_real)}.`
  );
}

export function describeInflacao(pontos: InflacaoPonto[], janela: 'mensal' | 'anual', oculto: boolean): string {
  const tipo = janela === 'mensal' ? 'mês a mês' : 'ano a ano';
  const base = `Gráfico de linhas: inflação da sua cesta (${tipo}) e caixa real sobre gastos, ${periodo(pontos)}.`;
  const ultimo = [...pontos].reverse().find((p) => p.variacao_pct !== null);
  if (oculto || !ultimo) return base;
  return `${base} Variação mais recente: ${PCT.format(ultimo.variacao_pct!)}%.`;
}

export function describeTotaisGerais(geral: ResumoGeral | null, oculto: boolean): string {
  const base = 'Gráfico de colunas: totais de todo o histórico por categoria.';
  if (oculto || !geral) return base;
  return (
    `${base} Essenciais ${BRL.format(geral.total_essenciais)}, não essenciais ${BRL.format(geral.total_nao_essenciais)}, ` +
    `receita ${BRL.format(geral.total_receita)}, caixa real ${BRL.format(geral.total_caixa_real)}.`
  );
}

export function describePorAno(geral: ResumoGeral | null, oculto: boolean): string {
  const anos = geral?.anos ?? [];
  const base = `Gráfico de colunas agrupadas: gastos, receita e caixa por ano${anos.length ? `, de ${anos[0].ano} a ${anos[anos.length - 1].ano}` : ''}.`;
  if (oculto || !anos.length) return base;
  const ultimo = anos[anos.length - 1];
  return `${base} Em ${ultimo.ano}: receita ${BRL.format(ultimo.total_receita)} e caixa real ${BRL.format(ultimo.total_caixa_real)}.`;
}

export function describePorMes(geral: ResumoGeral | null, oculto: boolean): string {
  const base = 'Gráfico de colunas: gastos, receita e caixa por mês do calendário, somando todos os anos.';
  const meses = geral?.por_mes ?? [];
  if (oculto || !meses.some((m) => m.total_essenciais + m.total_nao_essenciais > 0)) return base;
  const maior = meses.reduce((a, b) =>
    b.total_essenciais + b.total_nao_essenciais > a.total_essenciais + a.total_nao_essenciais ? b : a,
  );
  return `${base} Mês com mais gastos: ${MESES_COMPLETOS[maior.mes - 1].toLowerCase()}.`;
}
