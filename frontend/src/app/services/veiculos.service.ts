import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';

export interface VehiclePayload {
  name: string;
  year: number;
}

export interface Vehicle {
  id: number;
  name: string;
  year: number;
  active: boolean;
}

export interface VehicleResumoItem {
  vehicle_id: number;
  vehicle_name: string;
  total_gasto: number;
  quantidade_servicos: number;
  ultimo_servico: string | null;
}

export interface VehiclesResumoSerie {
  vehicle_name: string;
  valores: number[];
}

export interface VehiclesResumo {
  veiculos: VehicleResumoItem[];
  meses: string[];
  series: VehiclesResumoSerie[];
}

@Injectable({ providedIn: 'root' })
export class VeiculosService {
  private readonly baseUrl = `${environment.apiUrl}/veiculos`;

  constructor(private readonly http: HttpClient) {}

  list(): Observable<Vehicle[]> {
    return this.http.get<Vehicle[]>(this.baseUrl);
  }

  create(payload: VehiclePayload): Observable<Vehicle> {
    return this.http.post<Vehicle>(this.baseUrl, payload);
  }

  update(id: number, payload: VehiclePayload): Observable<Vehicle> {
    return this.http.put<Vehicle>(`${this.baseUrl}/${id}`, payload);
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  resumo(meses = 12): Observable<VehiclesResumo> {
    return this.http.get<VehiclesResumo>(`${this.baseUrl}/resumo`, { params: { meses } });
  }
}
