import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';

export interface Empresa {
  id: number;
  nome: string;
  cnpj: string;
  data_abertura: string;
}

export interface EmpresaPayload {
  nome: string;
  cnpj: string;
  data_abertura: string;
}

export interface NotaFiscal {
  id: number;
  numero: string;
  chave_acesso: string | null;
  data_emissao: string;
  /** AAAA-MM-01 */
  competencia: string;
  tomador_nome: string;
  tomador_documento: string | null;
  valor: number;
  descricao: string | null;
  substitui_chave: string | null;
  /** id da nota que substituiu esta -- fica no histórico, mas não conta no limite. */
  substituida_por: number | null;
  substituida_por_numero: string | null;
  substitui_numero: string | null;
  created_at: string;
}

export interface NotaFiscalPayload {
  numero: string;
  chave_acesso?: string | null;
  data_emissao: string;
  competencia: string;
  tomador_nome: string;
  tomador_documento?: string | null;
  valor: number;
  descricao?: string | null;
  substitui_chave?: string | null;
}

export interface NotaFiscalPage {
  items: NotaFiscal[];
  total: number;
  /** Soma do filtro, sem as notas substituídas. */
  soma_valor: number;
}

export interface NotaXmlLida {
  numero: string;
  chave_acesso: string | null;
  data_emissao: string;
  competencia: string;
  tomador_nome: string;
  tomador_documento: string | null;
  valor: number;
  descricao: string | null;
  prestador_documento: string | null;
  substitui_chave: string | null;
  avisos: string[];
}

export type LimiteSituacao = 'ok' | 'atencao' | 'excedido_ate_20' | 'excedido_acima_20';

export interface LimiteMei {
  ano: number;
  limite: number;
  faturado: number;
  restante: number;
  pct: number;
  situacao: LimiteSituacao;
  por_mes: number[];
  proporcional: boolean;
}

export interface DeclaracaoAnualParams {
  ano: number;
  empregado: boolean;
  /** Receita de serviços sem nota no ano -- entra no total da declaração. */
  outrasReceitas: number;
}

export interface NotaListParams {
  ano?: number;
  mes?: number;
  busca?: string;
  limit?: number;
  offset?: number;
}

@Injectable({ providedIn: 'root' })
export class EmpresaService {
  private readonly baseUrl = `${environment.apiUrl}/empresa`;

  constructor(private readonly http: HttpClient) {}

  get(): Observable<Empresa | null> {
    return this.http.get<Empresa | null>(this.baseUrl);
  }

  save(payload: EmpresaPayload): Observable<Empresa> {
    return this.http.put<Empresa>(this.baseUrl, payload);
  }

  limite(ano?: number): Observable<LimiteMei> {
    const params: Record<string, number> = ano ? { ano } : {};
    return this.http.get<LimiteMei>(`${this.baseUrl}/limite`, { params });
  }

  listNotas(params: NotaListParams = {}): Observable<NotaFiscalPage> {
    const query: Record<string, string | number> = {};
    if (params.ano != null) query['ano'] = params.ano;
    if (params.mes != null) query['mes'] = params.mes;
    if (params.busca) query['busca'] = params.busca;
    query['limit'] = params.limit ?? 25;
    query['offset'] = params.offset ?? 0;
    return this.http.get<NotaFiscalPage>(`${this.baseUrl}/notas`, { params: query });
  }

  /** Lê o XML da NFS-e no servidor e devolve os campos pra pré-preencher -- não grava nada. */
  lerXml(file: File): Observable<NotaXmlLida> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<NotaXmlLida>(`${this.baseUrl}/notas/ler-xml`, form);
  }

  createNota(payload: NotaFiscalPayload): Observable<NotaFiscal> {
    return this.http.post<NotaFiscal>(`${this.baseUrl}/notas`, payload);
  }

  updateNota(id: number, payload: NotaFiscalPayload): Observable<NotaFiscal> {
    return this.http.put<NotaFiscal>(`${this.baseUrl}/notas/${id}`, payload);
  }

  /** PDF de apoio pra declaração anual do MEI (DASN-SIMEI) -- não grava nada. */
  declaracaoAnual(params: DeclaracaoAnualParams): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/declaracao-anual`, {
      params: { ano: params.ano, empregado: params.empregado, outras_receitas: params.outrasReceitas },
      responseType: 'blob',
    });
  }

  removeNota(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/notas/${id}`);
  }
}
