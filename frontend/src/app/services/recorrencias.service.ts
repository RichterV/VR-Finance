import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { Priority } from './dropdown-options.service';

export type RecorrenciaTipo = 'gasto' | 'receita';
export type RecorrenciaStatus = 'ativa' | 'pausada' | 'encerrada';

export interface Recorrencia {
  id: number;
  tipo: RecorrenciaTipo;
  priority: Priority | null;
  item_id: number | null;
  item_name: string | null;
  /** false = categoria excluída (continua gerando, mas não dá pra escolher outra excluída). */
  item_active: boolean | null;
  value: number;
  cash_percentage: number | null;
  description: string | null;
  /** 1-31; mês sem esse dia usa o último dia do mês. */
  dia: number;
  pausada: boolean;
  /** AAAA-MM-01 do último mês que gera; null = sem fim. */
  fim_mes: string | null;
  status: RecorrenciaStatus;
  /** Próximo lançamento que será criado; null se pausada/encerrada. */
  proxima_data: string | null;
  /** Lançamento já criado e com data futura (oferecido pra apagar junto ao excluir). */
  lancamento_pendente_data: string | null;
  created_at: string;
}

export interface RecorrenciaUpdatePayload {
  priority?: Priority | null;
  item_id?: number | null;
  value: number;
  cash_percentage?: number | null;
  description?: string | null;
  dia: number;
  /** Qualquer dia do último mês (AAAA-MM-DD); null = sem fim. */
  fim_mes: string | null;
}

@Injectable({ providedIn: 'root' })
export class RecorrenciasService {
  private readonly baseUrl = `${environment.apiUrl}/recorrencias`;

  constructor(private readonly http: HttpClient) {}

  list(): Observable<Recorrencia[]> {
    return this.http.get<Recorrencia[]>(this.baseUrl);
  }

  update(id: number, payload: RecorrenciaUpdatePayload): Observable<Recorrencia> {
    return this.http.put<Recorrencia>(`${this.baseUrl}/${id}`, payload);
  }

  pausar(id: number): Observable<Recorrencia> {
    return this.http.post<Recorrencia>(`${this.baseUrl}/${id}/pausar`, {});
  }

  retomar(id: number): Observable<Recorrencia> {
    return this.http.post<Recorrencia>(`${this.baseUrl}/${id}/retomar`, {});
  }

  delete(id: number, apagarPendentes = false): Observable<void> {
    const params = new HttpParams().set('apagar_pendentes', apagarPendentes);
    return this.http.delete<void>(`${this.baseUrl}/${id}`, { params });
  }
}
