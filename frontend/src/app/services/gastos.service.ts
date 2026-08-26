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
}

export interface GastoUpdatePayload {
  priority: Priority;
  item_id: number;
  value: number;
  description?: string;
}

export interface GastoListParams {
  ano?: number;
  mes?: number;
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
  date: string;
  created_at: string;
}

@Injectable({ providedIn: 'root' })
export class GastosService {
  private readonly baseUrl = `${environment.apiUrl}/gastos`;

  constructor(private readonly http: HttpClient) {}

  create(payload: GastoCreatePayload): Observable<Gasto[]> {
    return this.http.post<Gasto[]>(this.baseUrl, payload);
  }

  list(params: GastoListParams = {}): Observable<GastoPage> {
    const query: Record<string, number> = {};
    if (params.ano != null) query['ano'] = params.ano;
    if (params.mes != null) query['mes'] = params.mes;
    query['limit'] = params.limit ?? 25;
    query['offset'] = params.offset ?? 0;
    return this.http.get<GastoPage>(this.baseUrl, { params: query });
  }

  update(id: number, payload: GastoUpdatePayload): Observable<Gasto> {
    return this.http.put<Gasto>(`${this.baseUrl}/${id}`, payload);
  }

  antecipar(id: number): Observable<Gasto> {
    return this.http.post<Gasto>(`${this.baseUrl}/${id}/antecipar`, {});
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
