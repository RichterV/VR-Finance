import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';

export type EntityType = 'gasto' | 'receita' | 'servico_veiculo';

export interface Attachment {
  id: number;
  entity_type: EntityType;
  entity_id: string;
  original_filename: string;
  content_type: string;
  size_bytes: number;
  created_at: string;
}

export interface AttachmentExists {
  entity_ids_with_attachments: string[];
}

@Injectable({ providedIn: 'root' })
export class AttachmentsService {
  private readonly baseUrl = `${environment.apiUrl}/attachments`;

  constructor(private readonly http: HttpClient) {}

  upload(entityType: EntityType, entityId: string | number, file: File): Observable<Attachment> {
    const form = new FormData();
    form.append('entity_type', entityType);
    form.append('entity_id', String(entityId));
    form.append('file', file);
    return this.http.post<Attachment>(`${this.baseUrl}/upload`, form);
  }

  list(entityType: EntityType, entityId: string | number): Observable<Attachment[]> {
    const params = new HttpParams().set('entity_type', entityType).set('entity_id', String(entityId));
    return this.http.get<Attachment[]>(this.baseUrl, { params });
  }

  exists(entityType: EntityType, entityIds: Array<string | number>): Observable<AttachmentExists> {
    let params = new HttpParams().set('entity_type', entityType);
    for (const id of entityIds) {
      params = params.append('entity_ids', String(id));
    }
    return this.http.get<AttachmentExists>(`${this.baseUrl}/exists`, { params });
  }

  downloadBlob(attachmentId: number): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/${attachmentId}/download`, { responseType: 'blob' });
  }

  remove(attachmentId: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${attachmentId}`);
  }
}
