import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';

export interface ReceitaCreatePayload {
  value: number;
  cash_percentage: number;
  description?: string;
}

export type ReceitaUpdatePayload = ReceitaCreatePayload;

export interface ReceitaListParams {
  ano?: number;
  mes?: number;
  busca?: string;
  limit?: number;
  offset?: number;
}

export interface ReceitaPage {
  items: Receita[];
  total: number;
}

export interface Receita {
  id: number;
  value: number;
  cash_percentage: number;
  cash_value: number;
  description: string | null;
  date: string;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class ReceitasService {
  private readonly baseUrl = `${environment.apiUrl}/receitas`;

  constructor(private readonly http: HttpClient) {}

  create(payload: ReceitaCreatePayload): Observable<Receita> {
    return this.http.post<Receita>(this.baseUrl, payload);
  }

  list(params: ReceitaListParams = {}): Observable<ReceitaPage> {
    const query: Record<string, number | string> = {};
    if (params.ano != null) query['ano'] = params.ano;
    if (params.mes != null) query['mes'] = params.mes;
    if (params.busca) query['busca'] = params.busca;
    query['limit'] = params.limit ?? 25;
    query['offset'] = params.offset ?? 0;
    return this.http.get<ReceitaPage>(this.baseUrl, { params: query });
  }

  update(id: number, payload: ReceitaUpdatePayload): Observable<Receita> {
    return this.http.put<Receita>(`${this.baseUrl}/${id}`, payload);
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
