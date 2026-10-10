import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';

/** Relatórios em PDF de Exportar Dados > Relatórios (a declaração do MEI fica no EmpresaService). */
@Injectable({ providedIn: 'root' })
export class RelatoriosService {
  private readonly baseUrl = `${environment.apiUrl}/relatorios`;

  constructor(private readonly http: HttpClient) {}

  /** Anos com lançamentos, mais recente primeiro (sempre inclui o ano atual). */
  anosRelatorioAnual(): Observable<number[]> {
    return this.http.get<number[]>(`${this.baseUrl}/anual/anos`);
  }

  /** PDF do relatório anual de receitas e gastos (parcial até hoje no ano em andamento). */
  relatorioAnual(ano: number): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/anual`, { params: { ano }, responseType: 'blob' });
  }
}
