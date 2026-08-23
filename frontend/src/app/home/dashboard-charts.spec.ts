import { CaixaMes, EvolucaoMes } from '../services/resumo.service';
import { buildComboChartData, buildLineChartData, formatComma } from './dashboard-charts';

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

  it('labels each point with the abbreviated month', () => {
    const data = buildLineChartData(evolucao);
    expect(data.labels).toEqual(['Jan', 'Fev']);
  });

  it('builds essenciais/não essenciais/caixa real datasets from the raw values', () => {
    const data = buildLineChartData(evolucao);
    expect(data.datasets[0].label).toBe('Essenciais');
    expect(data.datasets[0].data).toEqual([100, 200]);
    expect(data.datasets[1].label).toBe('Não essenciais');
    expect(data.datasets[1].data).toEqual([50, 60]);
    expect(data.datasets[2].label).toBe('Caixa real');
    expect(data.datasets[2].data).toEqual([20, 30]);
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

describe('buildComboChartData', () => {
  const rows: CaixaMes[] = [
    { ano: 2026, mes: 1, receita: 1000, caixa_pretendido: 300, caixa_real: 400, proporcao_caixa_real: 150 },
  ];

  it('puts the 3 monetary bars on the left axis and the ratio line on the right axis', () => {
    const data = buildComboChartData(rows);
    const byLabel = Object.fromEntries(data.datasets.map((d: any) => [d.label, d]));

    expect(byLabel['Receita'].yAxisID).toBe('y');
    expect(byLabel['Caixa pretendido'].yAxisID).toBe('y');
    expect(byLabel['Caixa real'].yAxisID).toBe('y');
    expect(byLabel['Caixa real / Gastos'].yAxisID).toBe('y1');
  });

  it('converts the ratio from a percentage-like number into a plain ratio', () => {
    const data = buildComboChartData(rows);
    const linha = data.datasets.find((d: any) => d.label === 'Caixa real / Gastos') as any;
    expect(linha.data).toEqual([1.5]);
  });
});
