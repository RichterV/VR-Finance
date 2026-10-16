import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LineController,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip,
} from 'chart.js';

import { directLabelsPlugin, zeroLinePlugin } from './chart-plugins';
import { defaultTooltipTitle, yearDividerPlugin } from './month-axis';

/**
 * Registra no chart.js só o que os gráficos do app usam (linha e barra, escalas categoria/linear,
 * legenda e tooltip). Importado pelos módulos de gráfico (Home, Veículos) -- assim o chart.js fica
 * nos pedaços carregados sob demanda, fora do carregamento inicial do app (antes,
 * provideCharts(withDefaultRegisterables()) no main.ts trazia a biblioteca inteira logo de cara).
 */
Chart.register(LineController, BarController, LineElement, BarElement, PointElement, CategoryScale, LinearScale, Legend, Tooltip);

// Gráficos mensais (rótulos de monthAxisLabels): divisória na virada do ano e "Fev/2025" no tooltip.
// Nos demais gráficos os dois não mudam nada (sem rótulo com ano, não há divisória; o título fica igual).
Chart.register(yearDividerPlugin);
// Rótulo escrito no gráfico (`plugins.directLabels`) e linha do zero (`plugins.zeroLine`) -- ver chart-plugins.ts.
Chart.register(directLabelsPlugin, zeroLinePlugin);
Chart.defaults.plugins.tooltip.callbacks.title = defaultTooltipTitle;

// Padrões visuais de todos os gráficos do app:
// - números no formato brasileiro ("6.000", não "6,000" -- sem isso o chart.js usa en-US);
// - mesma fonte do app;
// - curva suavizada "monotone": passa sempre pelos pontos e nunca desenha um pico ou vale que não
//   existe nos dados (a suavização comum, com `tension`, ultrapassava os marcadores);
// - marcador da legenda pequeno (8px) e rótulos do eixo X sem inclinação, pulando os que não cabem.
Chart.defaults.locale = 'pt-BR';
Chart.defaults.font.family = '"IBM Plex Sans", system-ui, sans-serif';
Chart.defaults.font.size = 12;
Chart.defaults.elements.line.cubicInterpolationMode = 'monotone';
Chart.defaults.plugins.legend.labels.boxWidth = 8;
Chart.defaults.plugins.legend.labels.boxHeight = 8;
Chart.defaults.plugins.legend.labels.padding = 14;
Chart.defaults.scales.category.ticks.maxRotation = 0;
Chart.defaults.scales.category.ticks.autoSkipPadding = 12;
