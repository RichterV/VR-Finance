import { CasaResumo } from '../../services/casa.service';
import { buildCasaChartData, casaChartOptions, categoriaBarPct } from './casa-chart';

describe('buildCasaChartData', () => {
  it('returns empty data while there is no resumo', () => {
    expect(buildCasaChartData(null)).toEqual({ labels: [], datasets: [] });
  });

  it('creates one bar series per imóvel, named after it', () => {
    const resumo: CasaResumo = {
      imoveis: [],
      categorias: [],
      garantias_vigentes: 0,
      meses: ['2026-01', '2026-02'],
      series: [
        { imovel_name: 'Casa', valores: [100, 0] },
        { imovel_name: 'Apartamento', valores: [0, 50] },
      ],
    };
    const data = buildCasaChartData(resumo);
    expect(data.datasets.map((d) => d.label)).toEqual(['Casa', 'Apartamento']);
    expect(data.datasets[1].data).toEqual([0, 50]);
  });

  it('hides the legend when there is a single imóvel', () => {
    expect(casaChartOptions(1)?.plugins?.legend?.display).toBe(false);
    expect(casaChartOptions(2)?.plugins?.legend?.display).toBe(true);
  });
});

describe('categoriaBarPct', () => {
  it('scales every bar by the largest category, with a visible minimum', () => {
    expect(categoriaBarPct(500, 500)).toBe(100);
    expect(categoriaBarPct(250, 500)).toBe(50);
    expect(categoriaBarPct(1, 500)).toBe(2);
    expect(categoriaBarPct(0, 0)).toBe(0);
  });
});
