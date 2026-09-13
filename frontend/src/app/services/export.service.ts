import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';

export type ExportModulo = 'gastos' | 'receitas' | 'veiculos' | 'operacoes_bolsa' | 'devedores' | 'categorias';

@Injectable({ providedIn: 'root' })
export class ExportService {
  private readonly baseUrl = `${environment.apiUrl}/export`;

  constructor(private readonly http: HttpClient) {}

  download(modulo: ExportModulo): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/${modulo}`, { responseType: 'blob' });
  }
}
