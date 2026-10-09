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
Chart.defaults.plugins.tooltip.callbacks.title = defaultTooltipTitle;
