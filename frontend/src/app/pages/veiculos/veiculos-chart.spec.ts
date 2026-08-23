import { VehiclesResumo } from '../../services/veiculos.service';
import { buildVeiculosChartData } from './veiculos-chart';

describe('buildVeiculosChartData', () => {
  it('returns empty labels/datasets when there is no resumo yet', () => {
    expect(buildVeiculosChartData(null)).toEqual({ labels: [], datasets: [] });
  });

  it('formats "YYYY-MM" months as "Mmm/YY" labels', () => {
    const resumo: VehiclesResumo = {
      veiculos: [],
      meses: ['2025-11', '2026-01'],
      series: [],
    };
    const data = buildVeiculosChartData(resumo);
    expect(data.labels).toEqual(['Nov/25', 'Jan/26']);
  });

  it('creates one line dataset per vehicle series, named after the vehicle', () => {
    const resumo: VehiclesResumo = {
      veiculos: [],
      meses: ['2026-01', '2026-02'],
      series: [
        { vehicle_name: 'Voyage', valores: [100, 200] },
        { vehicle_name: 'Biz', valores: [10, 20] },
      ],
    };
    const data = buildVeiculosChartData(resumo);
    expect(data.datasets.map((d) => d.label)).toEqual(['Voyage', 'Biz']);
    expect(data.datasets[0].data).toEqual([100, 200]);
    expect(data.datasets[1].data).toEqual([10, 20]);
  });
});
