import { signal } from '@angular/core';

/**
 * Temas visuais do app (escolhidos no Perfil > Aparência, salvos por usuário no backend).
 * As cores da interface ficam em CSS (theme/variables.scss = tema padrão, theme/_temas.scss = os outros);
 * aqui ficam o nome/descrição de cada tema, as amostras do seletor e as cores dos gráficos, que o
 * chart.js precisa em JS. Espelhado em backend/app/schemas.py (ThemeKey).
 */
export type ThemeKey =
  | 'atual'
  | 'grafite'
  | 'petroleo'
  | 'musgo'
  | 'indigo'
  | 'cafe'
  | 'ambar'
  | 'oceano'
  | 'lavanda'
  | 'oled'
  | 'salvia'
  | 'cobre'
  | 'floresta'
  | 'nordico'
  | 'sepia';

export interface ChartPalette {
  essencial: string;
  naoEssencial: string;
  caixaReal: string;
  receita: string;
  caixaPretendido: string;
  /** Linha de razão (caixa real ÷ gastos) -- sempre uma cor fria, diferente das colunas. */
  razao: string;
  /** Gastos/inflação: o tom do negativo do tema. */
  gastos: string;
  texto: string;
  grade: string;
  divisor: string;
}

export interface ThemeDef {
  key: ThemeKey;
  nome: string;
  descricao: string;
  /** Amostras do seletor: fundo, cartão, marca, positivo, negativo. */
  amostra: { fundo: string; cartao: string; marca: string; positivo: string; negativo: string; texto: string };
  chart: ChartPalette;
}

export const DEFAULT_THEME: ThemeKey = 'salvia';

export const THEMES: ThemeDef[] = [
  {
    key: 'atual',
    nome: 'Ardósia e verde',
    descricao: 'Azul-ardósia frio com verde vivo e contrastado.',
    amostra: { fundo: '#0e1524', cartao: '#152033', marca: '#22c55e', positivo: '#4ade80', negativo: '#f87171', texto: '#e2e8f0' },
    chart: {
      essencial: '#60a5fa',
      naoEssencial: '#fb923c',
      caixaReal: '#22c55e',
      receita: '#fbbf24',
      caixaPretendido: '#86efac',
      razao: '#a78bfa',
      gastos: '#f87171',
      texto: '#94a3b8',
      grade: 'rgba(148, 163, 184, 0.12)',
      divisor: 'rgba(148, 163, 184, 0.4)',
    },
  },
  {
    key: 'grafite',
    nome: 'Grafite e esmeralda',
    descricao: 'Cinza neutro, sem azul; o verde fica mais limpo.',
    amostra: { fundo: '#121414', cartao: '#1a1d1d', marca: '#34d399', positivo: '#6ee7b7', negativo: '#f2928a', texto: '#e4e7e6' },
    chart: {
      essencial: '#7cb4f5',
      naoEssencial: '#f0a35e',
      caixaReal: '#34d399',
      receita: '#e9c46a',
      caixaPretendido: '#a7e3c4',
      razao: '#c4a7f5',
      gastos: '#f2928a',
      texto: '#9ca5a2',
      grade: 'rgba(156, 165, 162, 0.12)',
      divisor: 'rgba(156, 165, 162, 0.4)',
    },
  },
  {
    key: 'petroleo',
    nome: 'Azul-petróleo',
    descricao: 'Azul-esverdeado profundo com marca turquesa.',
    amostra: { fundo: '#0b1a1f', cartao: '#10252c', marca: '#2dd4bf', positivo: '#86efac', negativo: '#f59393', texto: '#dfeaec' },
    chart: {
      essencial: '#7dd3fc',
      naoEssencial: '#fdba74',
      caixaReal: '#2dd4bf',
      receita: '#fcd34d',
      caixaPretendido: '#99f6e4',
      razao: '#d8b4fe',
      gastos: '#f59393',
      texto: '#8fadb2',
      grade: 'rgba(143, 173, 178, 0.12)',
      divisor: 'rgba(143, 173, 178, 0.4)',
    },
  },
  {
    key: 'musgo',
    nome: 'Musgo',
    descricao: 'Verde-oliva e tons de terra, mais orgânico.',
    amostra: { fundo: '#12150f', cartao: '#1a1e16', marca: '#a3c76d', positivo: '#b5d98a', negativo: '#e8897a', texto: '#e6e8df' },
    chart: {
      essencial: '#8fb8de',
      naoEssencial: '#e3a15c',
      caixaReal: '#a3c76d',
      receita: '#e8cf6a',
      caixaPretendido: '#cfe3a8',
      razao: '#c9a6d9',
      gastos: '#e8897a',
      texto: '#a5aa95',
      grade: 'rgba(165, 170, 149, 0.12)',
      divisor: 'rgba(165, 170, 149, 0.4)',
    },
  },
  {
    key: 'indigo',
    nome: 'Noite índigo',
    descricao: 'Azul-violeta escuro com verde menta.',
    amostra: { fundo: '#11132a', cartao: '#181b38', marca: '#4ade80', positivo: '#6ee7b7', negativo: '#fb8f8f', texto: '#e3e5f5' },
    chart: {
      essencial: '#7cc4fa',
      naoEssencial: '#fb9b5c',
      caixaReal: '#4ade80',
      receita: '#fcd34d',
      caixaPretendido: '#a7f3d0',
      razao: '#f0abfc',
      gastos: '#fb8f8f',
      texto: '#9fa4c8',
      grade: 'rgba(159, 164, 200, 0.12)',
      divisor: 'rgba(159, 164, 200, 0.4)',
    },
  },
  {
    key: 'cafe',
    nome: 'Café com sálvia',
    descricao: 'Marrom quente com verde-sálvia, pouca luz azul.',
    amostra: { fundo: '#17120e', cartao: '#201913', marca: '#8fbf7a', positivo: '#a6d48f', negativo: '#e9907b', texto: '#ece4da' },
    chart: {
      essencial: '#8db8d8',
      naoEssencial: '#e39a5c',
      caixaReal: '#8fbf7a',
      receita: '#e6c56b',
      caixaPretendido: '#c5dfae',
      razao: '#c7a2c9',
      gastos: '#e9907b',
      texto: '#b3a493',
      grade: 'rgba(179, 164, 147, 0.12)',
      divisor: 'rgba(179, 164, 147, 0.4)',
    },
  },
  {
    key: 'ambar',
    nome: 'Ardósia e âmbar',
    descricao: 'Cinza-ardósia com marca âmbar; verde só no positivo.',
    amostra: { fundo: '#111418', cartao: '#181c22', marca: '#f5b544', positivo: '#4ade80', negativo: '#f87171', texto: '#e5e7eb' },
    chart: {
      essencial: '#60a5fa',
      naoEssencial: '#f472b6',
      caixaReal: '#4ade80',
      receita: '#f5b544',
      caixaPretendido: '#a7f3d0',
      razao: '#a78bfa',
      gastos: '#f87171',
      texto: '#9ca3af',
      grade: 'rgba(156, 163, 175, 0.12)',
      divisor: 'rgba(156, 163, 175, 0.4)',
    },
  },
  {
    key: 'oceano',
    nome: 'Oceano',
    descricao: 'Azul-marinho com azul-céu na marca.',
    amostra: { fundo: '#0a1628', cartao: '#10213a', marca: '#38bdf8', positivo: '#4ade80', negativo: '#f87171', texto: '#e2eaf5' },
    chart: {
      essencial: '#38bdf8',
      naoEssencial: '#fb923c',
      caixaReal: '#4ade80',
      receita: '#fcd34d',
      caixaPretendido: '#bbf7d0',
      razao: '#c4b5fd',
      gastos: '#f87171',
      texto: '#93a7c2',
      grade: 'rgba(147, 167, 194, 0.12)',
      divisor: 'rgba(147, 167, 194, 0.4)',
    },
  },
  {
    key: 'lavanda',
    nome: 'Ameixa e lavanda',
    descricao: 'Roxo escuro com lavanda; verde só no positivo.',
    amostra: { fundo: '#171221', cartao: '#201a2d', marca: '#b4a3f5', positivo: '#7ee0a8', negativo: '#f59a9a', texto: '#ece6f4' },
    chart: {
      essencial: '#7fb7f0',
      naoEssencial: '#f4a361',
      caixaReal: '#7ee0a8',
      receita: '#f2d06b',
      caixaPretendido: '#b4f0cf',
      razao: '#b4a3f5',
      gastos: '#f59a9a',
      texto: '#aca2bf',
      grade: 'rgba(172, 162, 191, 0.12)',
      divisor: 'rgba(172, 162, 191, 0.4)',
    },
  },
  {
    key: 'oled',
    nome: 'Preto OLED',
    descricao: 'Fundo quase preto: brilha menos no escuro.',
    amostra: { fundo: '#050607', cartao: '#0e1012', marca: '#22c55e', positivo: '#4ade80', negativo: '#f87171', texto: '#d6dade' },
    chart: {
      essencial: '#60a5fa',
      naoEssencial: '#fb923c',
      caixaReal: '#22c55e',
      receita: '#fbbf24',
      caixaPretendido: '#86efac',
      razao: '#a78bfa',
      gastos: '#f87171',
      texto: '#959ca4',
      grade: 'rgba(149, 156, 164, 0.12)',
      divisor: 'rgba(149, 156, 164, 0.4)',
    },
  },
  {
    key: 'salvia',
    nome: 'Sálvia suave',
    descricao: 'Tudo dessaturado: a opção mais calma para a vista.',
    amostra: { fundo: '#141716', cartao: '#1b201e', marca: '#7fb59a', positivo: '#95c9a8', negativo: '#d98c84', texto: '#dde3df' },
    chart: {
      essencial: '#86a9cc',
      naoEssencial: '#d39a6a',
      caixaReal: '#7fb59a',
      receita: '#d4bb6a',
      caixaPretendido: '#b9d8c4',
      razao: '#b39cc8',
      gastos: '#d98c84',
      texto: '#99a49e',
      grade: 'rgba(153, 164, 158, 0.12)',
      divisor: 'rgba(153, 164, 158, 0.4)',
    },
  },
  {
    key: 'cobre',
    nome: 'Carvão e cobre',
    descricao: 'Grafite quente com marca cobre.',
    amostra: { fundo: '#151312', cartao: '#1d1a18', marca: '#e0915a', positivo: '#7cc89a', negativo: '#f07b7b', texto: '#ebe5df' },
    chart: {
      essencial: '#7fb0e0',
      naoEssencial: '#e0915a',
      caixaReal: '#7cc89a',
      receita: '#e8c15a',
      caixaPretendido: '#b7e2c6',
      razao: '#c3a3e6',
      gastos: '#f07b7b',
      texto: '#aa9f95',
      grade: 'rgba(170, 159, 149, 0.12)',
      divisor: 'rgba(170, 159, 149, 0.4)',
    },
  },
  {
    key: 'floresta',
    nome: 'Floresta',
    descricao: 'O verde vai também para o fundo.',
    amostra: { fundo: '#0c1712', cartao: '#12211a', marca: '#4ade80', positivo: '#86efac', negativo: '#f79a8f', texto: '#e1ece5' },
    chart: {
      essencial: '#7cc0f5',
      naoEssencial: '#f5a15f',
      caixaReal: '#4ade80',
      receita: '#f2d064',
      caixaPretendido: '#bbf7d0',
      razao: '#d0a8f5',
      gastos: '#f79a8f',
      texto: '#94ad9f',
      grade: 'rgba(148, 173, 159, 0.12)',
      divisor: 'rgba(148, 173, 159, 0.4)',
    },
  },
  {
    key: 'nordico',
    nome: 'Nórdico',
    descricao: 'Cinza-azulado e pastéis, o menos escuro.',
    amostra: { fundo: '#1e222a', cartao: '#262b35', marca: '#88c0d0', positivo: '#a3be8c', negativo: '#e5848a', texto: '#e5e9f0' },
    chart: {
      essencial: '#81a1c1',
      naoEssencial: '#d08770',
      caixaReal: '#a3be8c',
      receita: '#ebcb8b',
      caixaPretendido: '#c9dbb5',
      razao: '#b48ead',
      gastos: '#e5848a',
      texto: '#a5aec0',
      grade: 'rgba(165, 174, 192, 0.12)',
      divisor: 'rgba(165, 174, 192, 0.4)',
    },
  },
  {
    key: 'sepia',
    nome: 'Sépia noturno',
    descricao: 'Tons quentes e pouca luz azul, para a noite.',
    amostra: { fundo: '#1a1612', cartao: '#231e18', marca: '#9cbf6b', positivo: '#b3d38a', negativo: '#e08a6d', texto: '#e8dcc8' },
    chart: {
      essencial: '#8fb3cf',
      naoEssencial: '#e09a5f',
      caixaReal: '#9cbf6b',
      receita: '#e3c36a',
      caixaPretendido: '#cbe0a8',
      razao: '#c5a0b8',
      gastos: '#e08a6d',
      texto: '#ad9f88',
      grade: 'rgba(173, 159, 136, 0.12)',
      divisor: 'rgba(173, 159, 136, 0.4)',
    },
  },
];

const BY_KEY = new Map(THEMES.map((t) => [t.key, t]));

export function isThemeKey(value: unknown): value is ThemeKey {
  return typeof value === 'string' && BY_KEY.has(value as ThemeKey);
}

/**
 * Tema ativo -- estado de módulo (não serviço) pra os montadores de gráfico lerem sem DI. Quem lê
 * dentro de um computed() passa a depender dele: trocar o tema recalcula dados/opções dos gráficos.
 * Só o ThemeService escreve aqui.
 */
export const activeTheme = signal<ThemeKey>(DEFAULT_THEME);

/** Cores dos gráficos do tema ativo. */
export function chartColors(): ChartPalette {
  return (BY_KEY.get(activeTheme()) ?? BY_KEY.get(DEFAULT_THEME)!).chart;
}

/**
 * Cores da interface do tema ativo pra usar dentro do gráfico: texto principal (rótulo direto,
 * traço da meta), tons de número bom/ruim e a cor do cartão (folga de 2px entre segmentos). Vêm das
 * amostras do seletor, que espelham --app-text-primary / --app-positive / --app-negative / o cartão.
 */
export function themeInk(): { texto: string; positivo: string; negativo: string; cartao: string } {
  const t = BY_KEY.get(activeTheme()) ?? BY_KEY.get(DEFAULT_THEME)!;
  return { texto: t.amostra.texto, positivo: t.amostra.positivo, negativo: t.amostra.negativo, cartao: t.amostra.cartao };
}

/** '#86a9cc' -> 'rgba(134, 169, 204, 0.35)' (linhas de tendência). */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
