import { ResumoGeral, ResumoGeralAno } from '../services/resumo.service';
import { buildPorAnoChartData, buildPorMesChartData, buildTotaisGeraisChartData } from './relatorio-geral-charts';

const geral: ResumoGeral = {
  anos: [],
  por_mes: [{ mes: 3, total_essenciais: 10, total_nao_essenciais: 5, total_receita: 20, total_caixa_pretendido: 2, total_caixa_real: 5 }],
  total_essenciais: 100,
  total_nao_essenciais: 40,
  total_receita: 200,
  total_caixa_pretendido: 20,
  total_caixa_real: 60,
};

describe('buildPorAnoChartData', () => {
  it('creates one dataset per metric, each with one value per year', () => {
    const anos: ResumoGeralAno[] = [
      { ano: 2025, total_essenciais: 1, total_nao_essenciais: 2, total_receita: 3, total_caixa_pretendido: 4, total_caixa_real: 5 },
      { ano: 2026, total_essenciais: 6, total_nao_essenciais: 7, total_receita: 8, total_caixa_pretendido: 9, total_caixa_real: 10 },
    ];

    const data = buildPorAnoChartData(anos);
    expect(data.labels).toEqual(['2025', '2026']);
    expect(data.datasets).toHaveLength(5);
    expect(data.datasets.find((d) => d.label === 'Essenciais')?.data).toEqual([1, 6]);
    expect(data.datasets.find((d) => d.label === 'Caixa real')?.data).toEqual([5, 10]);
  });
});

describe('buildTotaisGeraisChartData', () => {
  it('returns empty labels/datasets when there is no data yet', () => {
    expect(buildTotaisGeraisChartData(null)).toEqual({ labels: [], datasets: [] });
  });

  it('maps the 5 aggregate totals into a single dataset', () => {
    const data = buildTotaisGeraisChartData(geral);
    expect(data.labels).toEqual(['Essenciais', 'Não essenciais', 'Receita', 'Caixa pretendido', 'Caixa real']);
    expect(data.datasets[0].data).toEqual([100, 40, 200, 20, 60]);
  });
});

describe('buildPorMesChartData', () => {
  it('returns empty data when geral is null', () => {
    const data = buildPorMesChartData(null);
    expect(data.labels).toEqual([]);
    expect(data.datasets[0].data).toEqual([]);
  });

  it('labels each bucket with the abbreviated calendar month', () => {
    const data = buildPorMesChartData(geral);
    expect(data.labels).toEqual(['Mar']);
    expect(data.datasets.find((d) => d.label === 'Receita')?.data).toEqual([20]);
  });
});
