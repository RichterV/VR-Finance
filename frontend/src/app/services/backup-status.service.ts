import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';

export interface BackupStatus {
  last_backup_at: string | null;
}

@Injectable({ providedIn: 'root' })
export class BackupStatusService {
  private readonly baseUrl = `${environment.apiUrl}/backup-status`;

  constructor(private readonly http: HttpClient) {}

  check(): Observable<BackupStatus> {
    return this.http.get<BackupStatus>(this.baseUrl);
  }
}
