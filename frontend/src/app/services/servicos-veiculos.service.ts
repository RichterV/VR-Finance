import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';

export type ServiceType = 'peca' | 'peca_mao_de_obra' | 'peca_mao_de_obra_propria';

export interface ServicoVeiculoPayload {
  vehicle_id: number;
  description: string;
  notes?: string;
  value: number;
  service_type?: ServiceType;
  mileage?: number;
}

export interface ServicoVeiculo {
  id: number;
  vehicle_id: number;
  vehicle_name: string;
  description: string;
  notes: string | null;
  value: number;
  service_type: ServiceType | null;
  mileage: number | null;
  date: string;
  created_at: string;
}

export interface ServicoVeiculoListParams {
  vehicle_id?: number;
  limit?: number;
  offset?: number;
}

export interface ServicoVeiculoPage {
  items: ServicoVeiculo[];
  total: number;
}

@Injectable({ providedIn: 'root' })
export class ServicosVeiculosService {
  private readonly baseUrl = `${environment.apiUrl}/servicos-veiculos`;

  constructor(private readonly http: HttpClient) {}

  list(params: ServicoVeiculoListParams = {}): Observable<ServicoVeiculoPage> {
    const query: Record<string, number> = {};
    if (params.vehicle_id != null) query['vehicle_id'] = params.vehicle_id;
    query['limit'] = params.limit ?? 25;
    query['offset'] = params.offset ?? 0;
    return this.http.get<ServicoVeiculoPage>(this.baseUrl, { params: query });
  }

  create(payload: ServicoVeiculoPayload): Observable<ServicoVeiculo> {
    return this.http.post<ServicoVeiculo>(this.baseUrl, payload);
  }

  update(id: number, payload: ServicoVeiculoPayload): Observable<ServicoVeiculo> {
    return this.http.put<ServicoVeiculo>(`${this.baseUrl}/${id}`, payload);
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
