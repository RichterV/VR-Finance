import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';

export type LixeiraTipo = 'registro' | 'anexo';

export interface LixeiraAnexo {
  /** Id do item da lixeira (não do anexo original) -- é ele que o download usa. */
  id: number;
  original_filename: string;
  content_type: string;
  size_bytes: number;
}

export interface LixeiraItem {
  id: number;
  tipo: LixeiraTipo;
  /** Mesmos valores de Attachment.entity_type (gasto, receita, servico_veiculo...). */
  entity_type: string;
  titulo: string;
  detalhe: string | null;
  valor: number | null;
  data_registro: string | null;
  deleted_at: string;
  /** Quando some de vez (15 dias depois de excluído). */
  expira_em: string;
  /** Registro: anexos que saíram junto. Anexo excluído sozinho: ele mesmo. */
  anexos: LixeiraAnexo[];
}

export interface LixeiraRestaurado {
  entity_type: string;
  entity_id: string;
}

@Injectable({ providedIn: 'root' })
export class LixeiraService {
  private readonly baseUrl = `${environment.apiUrl}/lixeira`;

  constructor(private readonly http: HttpClient) {}

  list(): Observable<LixeiraItem[]> {
    return this.http.get<LixeiraItem[]>(this.baseUrl);
  }

  restore(id: number): Observable<LixeiraRestaurado> {
    return this.http.post<LixeiraRestaurado>(`${this.baseUrl}/${id}/restaurar`, {});
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  empty(): Observable<void> {
    return this.http.delete<void>(this.baseUrl);
  }

  downloadAnexo(id: number): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/anexos/${id}/download`, { responseType: 'blob' });
  }
}
