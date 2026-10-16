import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { Priority } from './dropdown-options.service';

export interface GastoCreatePayload {
  priority: Priority;
  item_id: number;
  value: number;
  description?: string;
  is_installment: boolean;
  installment_count?: number;
  /** AAAA-MM-DD; omitido = hoje. Parcelado: data da parcela 1. */
  date?: string;
  /** Repete todo mês a partir do mês seguinte (não combina com parcelado). */
  recorrente?: boolean;
  /** 1-31; omitido = dia da data do lançamento. */
  recorrencia_dia?: number;
  /** Último mês que gera (`AAAA-MM-01`); omitido = sem fim. */
  recorrencia_fim?: string;
}

export interface GastoUpdatePayload {
  priority: Priority;
  item_id: number;
  value: number;
  description?: string;
}

export interface GastoAntecipacaoPayload {
  value?: number;
}

export interface GastoListParams {
  ano?: number;
  mes?: number;
  busca?: string;
  limit?: number;
  offset?: number;
}

export interface GastoPage {
  items: Gasto[];
  total: number;
}

export interface Gasto {
  id: number;
  priority: Priority;
  item_id: number;
  item_name: string;
  value: number;
  description: string | null;
  is_installment: boolean;
  installment_count: number | null;
  installment_number: number | null;
  installment_group_id: string | null;
  /** Lançamento ligado a uma recorrência (gerado por ela ou o que a criou). */
  recorrencia_id: number | null;
  date: string;
  created_at: string;
}

export interface AnomaliaGasto {
  anomalo: boolean;
  /** Mediana dos lançamentos avulsos da categoria nos últimos 12 meses (null = histórico curto). */
  mediana: number | null;
  multiplo: number | null;
  amostras: number;
}

@Injectable({ providedIn: 'root' })
export class GastosService {
  private readonly baseUrl = `${environment.apiUrl}/gastos`;

  constructor(private readonly http: HttpClient) {}

  /** O valor é muito acima do normal da categoria? Chamado antes de salvar um gasto avulso. */
  anomalia(itemId: number, value: number): Observable<AnomaliaGasto> {
    return this.http.get<AnomaliaGasto>(`${this.baseUrl}/anomalia`, { params: { item_id: itemId, value } });
  }

  create(payload: GastoCreatePayload): Observable<Gasto[]> {
    return this.http.post<Gasto[]>(this.baseUrl, payload);
  }

  list(params: GastoListParams = {}): Observable<GastoPage> {
    const query: Record<string, number | string> = {};
    if (params.ano != null) query['ano'] = params.ano;
    if (params.mes != null) query['mes'] = params.mes;
    if (params.busca) query['busca'] = params.busca;
    query['limit'] = params.limit ?? 25;
    query['offset'] = params.offset ?? 0;
    return this.http.get<GastoPage>(this.baseUrl, { params: query });
  }

  update(id: number, payload: GastoUpdatePayload): Observable<Gasto> {
    return this.http.put<Gasto>(`${this.baseUrl}/${id}`, payload);
  }

  antecipar(id: number, payload: GastoAntecipacaoPayload = {}): Observable<Gasto> {
    return this.http.post<Gasto>(`${this.baseUrl}/${id}/antecipar`, payload);
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
