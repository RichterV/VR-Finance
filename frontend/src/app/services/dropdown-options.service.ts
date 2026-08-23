import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';

export type Priority = 'essencial' | 'nao_essencial';

export interface DropdownOption {
  id: number;
  priority: Priority;
  name: string;
  active: boolean;
}

@Injectable({ providedIn: 'root' })
export class DropdownOptionsService {
  private readonly baseUrl = `${environment.apiUrl}/dropdown-options`;

  constructor(private readonly http: HttpClient) {}

  list(priority: Priority): Observable<DropdownOption[]> {
    return this.http.get<DropdownOption[]>(this.baseUrl, { params: { priority } });
  }

  create(priority: Priority, name: string): Observable<DropdownOption> {
    return this.http.post<DropdownOption>(this.baseUrl, { priority, name });
  }

  update(id: number, name: string): Observable<DropdownOption> {
    return this.http.put<DropdownOption>(`${this.baseUrl}/${id}`, { name });
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }
}
