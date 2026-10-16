import { ResumoGeral, ResumoGeralAno } from '../services/resumo.service';
import {
  buildFluxo,
  buildPorAnoChartData,
  buildPorMesChartData,
  caixaLabelIndexes,
  historicoChartOptions,
} from './relatorio-geral-charts';

const geral: ResumoGeral = {
  anos: [],
  por_mes: [{ mes: 3, total_essenciais: 10, total_nao_essenciais: 5, total_receita: 20, total_caixa_pretendido: 2, total_caixa_real: 5 }],
  total_essenciais: 100,
  total_nao_essenciais: 40,
  total_receita: 200,
  total_caixa_pretendido: 20,
  total_caixa_real: 60,
};

const anos: ResumoGeralAno[] = [
  { ano: 2025, total_essenciais: 1, total_nao_essenciais: 2, total_receita: 3, total_caixa_pretendido: 4, total_caixa_real: 5 },
  { ano: 2026, total_essenciais: 6, total_nao_essenciais: 7, total_receita: 8, total_caixa_pretendido: 9, total_caixa_real: 10 },
];

describe('buildPorAnoChartData', () => {
  it('stacks essenciais + não essenciais + sobra inside the receita outline', () => {
    const data = buildPorAnoChartData(anos);
    expect(data.labels).toEqual(['2025', '2026']);
    expect(data.datasets.map((d) => d.label)).toEqual(['Receita', 'Essenciais', 'Não essenciais', 'Caixa real (sobra)']);
    const [receita, essenciais, naoEssenciais, sobra] = data.datasets as any[];
    expect(receita.backgroundColor).toBe('transparent');
    expect(receita.data).toEqual([3, 8]);
    expect(new Set([essenciais.stack, naoEssenciais.stack, sobra.stack]).size).toBe(1);
    expect(receita.stack).not.toBe(essenciais.stack);
    expect(receita.barPercentage).toBe(essenciais.barPercentage);
    expect(essenciais.data).toEqual([1, 6]);
    expect(sobra.data).toEqual([5, 10]);
  });

  it('never draws a negative sobra (spending above receita just passes the outline)', () => {
    const negativo = [{ ...anos[0], total_caixa_real: -4 }];
    const sobra = buildPorAnoChartData(negativo).datasets[3] as any;
    expect(sobra.data).toEqual([0]);
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

describe('caixaLabelIndexes', () => {
  const rows = [5, -2, 9, 1, 0, 3, 4].map((v) => ({ ...anos[0], total_caixa_real: v }));

  it('labels every bar when they fit', () => {
    expect(caixaLabelIndexes(rows.slice(0, 5), false)).toEqual([0, 1, 2, 3, 4]);
    expect(caixaLabelIndexes(rows, true)).toHaveLength(7);
  });

  it('labels only the largest and smallest caixa real on crowded vertical charts', () => {
    expect(caixaLabelIndexes(rows, false)).toEqual([2, 1]);
  });
});

describe('historicoChartOptions', () => {
  it('stacks the bars, shows the real caixa real and keeps caixa pretendido in the tooltip', () => {
    const negativo = [{ ...anos[0], total_caixa_real: -4 }];
    const options = historicoChartOptions(negativo) as any;
    expect(options.scales.y.stacked).toBe(true);
    const { label, footer } = options.plugins.tooltip.callbacks;
    expect(label({ datasetIndex: 3, dataIndex: 0, dataset: { label: 'Caixa real (sobra)' }, raw: 0 })).toMatch(/Caixa real: -R\$\s?4/);
    expect(footer([{ dataIndex: 0 }])).toContain('Caixa pretendido');
  });

  it('turns into horizontal bars on request', () => {
    const options = historicoChartOptions(anos, { horizontal: true }) as any;
    expect(options.indexAxis).toBe('y');
    expect(options.scales.x.stacked).toBe(true);
  });
});

describe('buildFluxo', () => {
  it('splits the receita into essenciais + não essenciais + caixa real (sums to 100%)', () => {
    const segs = buildFluxo(geral);
    expect(segs.map((s) => s.chave)).toEqual(['essencial', 'nao_essencial', 'caixa']);
    expect(segs.reduce((t, s) => t + s.pct, 0)).toBeCloseTo(100);
  });

  it('returns nothing without receita', () => {
    expect(buildFluxo(null)).toEqual([]);
    expect(buildFluxo({ ...geral, total_receita: 0 })).toEqual([]);
  });
});
