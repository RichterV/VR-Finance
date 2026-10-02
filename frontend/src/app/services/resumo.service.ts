import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { Priority } from './dropdown-options.service';

export interface ItemPercentual {
  item_id: number;
  item_name: string;
  priority: Priority;
  total: number;
  percentual: number;
}

export interface ResumoBase {
  total_gastos: number;
  total_receita: number;
  total_essenciais: number;
  total_nao_essenciais: number;
  quantidade_gastos: number;
  quantidade_receitas: number;
  total_caixa_pretendido: number;
  total_caixa_real: number;
  percentuais_itens: ItemPercentual[];
}

export interface EvolucaoMes {
  ano: number;
  mes: number;
  essencial: number;
  nao_essencial: number;
  caixa: number;
}

export interface CaixaMes {
  ano: number;
  mes: number;
  receita: number;
  caixa_pretendido: number;
  caixa_real: number;
  proporcao_caixa_real: number;
}

export interface ResumoAnual extends ResumoBase {
  ano: number;
  media_gastos_mensal: number;
  media_receitas_mensal: number;
  evolucao_12_meses: EvolucaoMes[];
  caixa_pretendido_vs_real: CaixaMes[];
}

export interface ResumoMensal extends ResumoBase {
  ano: number;
  mes: number;
  media_gastos_lancamento: number;
  media_receitas_lancamento: number;
  disponivel_para_gastar: number;
}

export interface ResumoGeralAno {
  ano: number;
  total_essenciais: number;
  total_nao_essenciais: number;
  total_receita: number;
  total_caixa_pretendido: number;
  total_caixa_real: number;
}

export interface ResumoGeralMes {
  mes: number;
  total_essenciais: number;
  total_nao_essenciais: number;
  total_receita: number;
  total_caixa_pretendido: number;
  total_caixa_real: number;
}

export interface ResumoGeral {
  anos: ResumoGeralAno[];
  por_mes: ResumoGeralMes[];
  total_essenciais: number;
  total_nao_essenciais: number;
  total_receita: number;
  total_caixa_pretendido: number;
  total_caixa_real: number;
}

export interface Corte {
  ateAno?: number;
  ateMes?: number;
}

export interface InflacaoPonto {
  ano: number;
  mes: number;
  total_cesta: number;
  variacao_pct: number | null;
  caixa_real_pct: number;
}

export interface ResumoInflacao {
  possui_cesta: boolean;
  cesta: string[];
  mensal: InflacaoPonto[];
  anual: InflacaoPonto[];
  headline_mom_pct: number | null;
  headline_yoy_pct: number | null;
}

export interface Previsao {
  ano: number;
  mes: number;
  dia: number;
  /** Menos de 3 meses com gasto avulso: a projeção é pouco confiável. */
  historico_suficiente: boolean;
  receita: number;
  /** Sem receita lançada no mês: estimada pela mediana dos últimos 6 meses. */
  receita_estimada: boolean;
  comprometido: number;
  variavel_ate_hoje: number;
  variavel_restante: number;
  caixa_pretendido: number;
  saldo_previsto: number;
  saldo_min: number;
  saldo_max: number;
}

export interface PontoIndicador {
  ano: number;
  mes: number;
  valor: number | null;
}

export interface CustoFixoItem {
  descricao: string;
  item_name: string;
  valor: number;
}

export interface Indicadores {
  ano: number;
  mes: number;
  poupanca: { atual_3m_pct: number | null; serie: PontoIndicador[] };
  comprometimento: { pct: number | null; total: number; receita_media: number; meses: PontoIndicador[] };
  custo_fixo: { pct: number | null; total: number; itens: CustoFixoItem[] };
  essencial: { atual_pct: number | null; inclinacao_pp_mes: number | null; serie: PontoIndicador[] };
}

@Injectable({ providedIn: 'root' })
export class ResumoService {
  private readonly baseUrl = `${environment.apiUrl}/resumo`;

  constructor(private readonly http: HttpClient) {}

  private corteParams(corte?: Corte): Record<string, number> {
    const params: Record<string, number> = {};
    if (corte?.ateAno != null && corte?.ateMes != null) {
      params['ate_ano'] = corte.ateAno;
      params['ate_mes'] = corte.ateMes;
    }
    return params;
  }

  anual(ano: number, meses = 12, corte?: Corte): Observable<ResumoAnual> {
    return this.http.get<ResumoAnual>(`${this.baseUrl}/anual`, { params: { ano, meses, ...this.corteParams(corte) } });
  }

  mensal(ano: number, mes: number): Observable<ResumoMensal> {
    return this.http.get<ResumoMensal>(`${this.baseUrl}/mensal`, { params: { ano, mes } });
  }

  geral(corte?: Corte): Observable<ResumoGeral> {
    return this.http.get<ResumoGeral>(`${this.baseUrl}/geral`, { params: this.corteParams(corte) });
  }

  inflacao(meses = 12, corte?: Corte): Observable<ResumoInflacao> {
    return this.http.get<ResumoInflacao>(`${this.baseUrl}/inflacao`, {
      params: { meses, ...this.corteParams(corte) },
    });
  }

  /** Projeção do saldo no fim do mês atual. */
  previsao(): Observable<Previsao> {
    return this.http.get<Previsao>(`${this.baseUrl}/previsao`);
  }

  indicadores(corte?: Corte): Observable<Indicadores> {
    return this.http.get<Indicadores>(`${this.baseUrl}/indicadores`, { params: this.corteParams(corte) });
  }
}
