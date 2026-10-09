/**
 * Módulos opcionais do app, habilitados por usuário no painel de admin -- espelha
 * backend/app/modules.py (as mesmas chaves). Início (resumos + Gastos/Receitas/Categorias) não
 * entra aqui: é sempre habilitado. O master sempre tem todos. Um módulo novo entra nesta lista
 * (e na do backend), e o menu lateral/guard/painel de admin passam a enxergá-lo sozinhos.
 */
export type ModuleKey =
  | 'veiculos'
  | 'operacoes_bolsa'
  | 'devedores'
  | 'ferramentas'
  | 'exportar_dados'
  | 'analise_inflacionaria'
  | 'empresa';

export interface AppModule {
  key: ModuleKey;
  label: string;
  icon: string;
  /** Sem rota = módulo sem tela própria (não vira item do menu lateral), ex: Análise inflacionária. */
  route?: string;
}

export const OPTIONAL_MODULES: AppModule[] = [
  { key: 'veiculos', label: 'Manutenção Veículos', icon: 'car-sport-outline', route: '/veiculos' },
  { key: 'empresa', label: 'Empresa', icon: 'briefcase-outline', route: '/empresa' },
  { key: 'ferramentas', label: 'Ferramentas', icon: 'calculator-outline', route: '/ferramentas' },
  { key: 'exportar_dados', label: 'Exportar Dados', icon: 'download-outline', route: '/exportar-dados' },
  // Seção "Análise inflacionária" da Home + toggles "Cesta de inflação" no modal Categorias.
  { key: 'analise_inflacionaria', label: 'Análise inflacionária', icon: 'pulse-outline' },
];
