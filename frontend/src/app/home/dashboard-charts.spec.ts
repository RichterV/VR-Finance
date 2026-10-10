import { CaixaMes, EvolucaoMes, InflacaoPonto } from '../services/resumo.service';
import {
  buildCaixaMetaData,
  buildCaixaRazaoData,
  buildCaixaReceitaData,
  buildInflacaoChartData,
  buildInflacaoRazaoData,
  buildLineChartData,
  caixaMetaHeadline,
  caixaPanelOptions,
  evolucaoHeadline,
  evolucaoTendencia,
  formatComma,
  lineChartOptions,
} from './dashboard-charts';

describe('formatComma', () => {
  it('uses a comma as the decimal separator with one digit', () => {
    expect(formatComma(1.5)).toBe('1,5');
    expect(formatComma(2)).toBe('2,0');
  });
});

describe('buildLineChartData', () => {
  const evolucao: EvolucaoMes[] = [
    { ano: 2026, mes: 1, essencial: 100, nao_essencial: 50, caixa: 20 },
    { ano: 2026, mes: 2, essencial: 200, nao_essencial: 60, caixa: 30 },
  ];

  it('labels each point with the abbreviated month, with the year on the first one', () => {
    const data = buildLineChartData(evolucao);
    expect(data.labels).toEqual([['Jan', '2026'], 'Fev']);
  });

  it('builds only the essenciais/não essenciais series (caixa real moved to the caixa chart)', () => {
    const data = buildLineChartData(evolucao);
    expect(data.datasets[0].label).toBe('Essenciais');
    expect(data.datasets[0].data).toEqual([100, 200]);
    expect(data.datasets[1].label).toBe('Não essenciais');
    expect(data.datasets[1].data).toEqual([50, 60]);
    expect(data.datasets.map((d) => d.label)).not.toContain('Caixa real');
  });

  it('drops the fixed markers on long windows (24/36 months)', () => {
    const longa: EvolucaoMes[] = Array.from({ length: 24 }, (_, i) => ({
      ano: 2024 + Math.floor(i / 12),
      mes: (i % 12) + 1,
      essencial: 100,
      nao_essencial: 50,
      caixa: 0,
    }));
    expect((buildLineChartData(longa).datasets[0] as any).pointRadius).toBe(0);
    expect((buildLineChartData(evolucao).datasets[0] as any).pointRadius).toBe(3);
  });

  it('writes the series names at the end of the lines and starts the axis at zero', () => {
    const options = lineChartOptions(evolucao) as any;
    expect(options.plugins.directLabels.items.map((i: any) => i.text)).toEqual(['Essenciais', 'Não essenciais']);
    expect(options.plugins.directLabels.items[0].index).toBe(1);
    expect(options.scales.y.beginAtZero).toBe(true);
  });

  it('appends trend-line datasets that are excluded from the legend filter', () => {
    const data = buildLineChartData(evolucao);
    const labels = data.datasets.map((d) => d.label);
    expect(labels).toContain('Tendência essenciais');
    expect(labels).toContain('Tendência não essenciais');
  });

  it('handles an empty window without throwing', () => {
    const data = buildLineChartData([]);
    expect(data.labels).toEqual([]);
    expect(data.datasets[0].data).toEqual([]);
  });
});

describe('evolucaoTendencia / evolucaoHeadline', () => {
  const evolucao: EvolucaoMes[] = [
    { ano: 2026, mes: 1, essencial: 100, nao_essencial: 90, caixa: 0 },
    { ano: 2026, mes: 2, essencial: 120, nao_essencial: 80, caixa: 0 },
    { ano: 2026, mes: 3, essencial: 140, nao_essencial: 70, caixa: 0 },
  ];

  it('returns the slope of the drawn trend lines, in R$ per month', () => {
    const t = evolucaoTendencia(evolucao)!;
    expect(t.essencial).toBeCloseTo(20);
    expect(t.naoEssencial).toBeCloseTo(-10);
  });

  it('describes the trend in words, and says nothing when values are hidden', () => {
    expect(evolucaoHeadline(evolucao, false)).toMatch(/essenciais subindo R\$\s?20\/mês, não essenciais caindo R\$\s?10\/mês/);
    expect(evolucaoHeadline(evolucao, true)).toBe('');
  });

  it('needs at least two months', () => {
    expect(evolucaoTendencia(evolucao.slice(0, 1))).toBeNull();
  });
});

describe('caixa real vs. meta (3 painéis)', () => {
  const rows: CaixaMes[] = [
    { ano: 2026, mes: 1, receita: 1000, caixa_pretendido: 300, caixa_real: 400, proporcao_caixa_real: 150 },
    { ano: 2026, mes: 2, receita: 1000, caixa_pretendido: 300, caixa_real: -50, proporcao_caixa_real: -5 },
  ];

  it('keeps receita visible in its own panel', () => {
    const data = buildCaixaReceitaData(rows);
    expect(data.datasets[0].label).toBe('Receita');
    expect(data.datasets[0].data).toEqual([1000, 1000]);
  });

  it('draws caixa real as bars and the meta (caixa pretendido) as a tick, on one axis only', () => {
    const data = buildCaixaMetaData(rows);
    const [barra, meta] = data.datasets as any[];
    expect(barra.label).toBe('Caixa real');
    expect(barra.data).toEqual([400, -50]);
    expect(meta.label).toBe('Caixa pretendido (meta)');
    expect(meta.showLine).toBe(false);
    expect(meta.pointStyle).toBe('line');
    expect(data.datasets.every((d: any) => d.yAxisID === undefined)).toBe(true);
  });

  it('converts the ratio from a percentage-like number into a plain ratio', () => {
    expect(buildCaixaRazaoData(rows).datasets[0].data).toEqual([1.5, -0.05]);
  });

  it('shows the months only on the bottom panel and has no second y axis', () => {
    const meta = caixaPanelOptions('meta', rows) as any;
    const razao = caixaPanelOptions('razao', rows) as any;
    expect(meta.scales.x.ticks.display).toBe(false);
    expect(razao.scales.x.ticks.display).toBe(true);
    expect(meta.scales.y1).toBeUndefined();
  });

  it('counts the months that reached the meta', () => {
    expect(caixaMetaHeadline(rows)).toBe('Caixa real ficou acima da meta em 1 de 2 meses.');
    expect(caixaMetaHeadline([])).toBe('');
  });
});

describe('buildInflacaoChartData', () => {
  const pontos: InflacaoPonto[] = [
    { ano: 2026, mes: 1, total_cesta: 800, variacao_pct: null, caixa_real_pct: 20 },
    { ano: 2026, mes: 2, total_cesta: 880, variacao_pct: 10, caixa_real_pct: 25 },
  ];

  it('labels each point with the abbreviated month, with the year on the first one', () => {
    const data = buildInflacaoChartData(pontos);
    expect(data.labels).toEqual([['Jan', '2026'], 'Fev']);
  });

  it('builds the inflação bars and a separate caixa real/gastos panel (no second y axis)', () => {
    const data = buildInflacaoChartData(pontos);
    expect(data.datasets).toHaveLength(1);
    expect(data.datasets[0].label).toBe('Inflação da cesta');
    expect(data.datasets[0].data).toEqual([null, 10]);
    expect(buildInflacaoRazaoData(pontos).datasets[0].data).toEqual([20, 25]);
  });

  it('keeps a null point as a real gap instead of coercing it to 0', () => {
    const data = buildInflacaoChartData(pontos);
    expect(data.datasets[0].data[0]).toBeNull();
  });

  it('handles an empty window without throwing', () => {
    const data = buildInflacaoChartData([]);
    expect(data.labels).toEqual([]);
    expect(data.datasets[0].data).toEqual([]);
  });
});
