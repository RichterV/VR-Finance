import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/** Ponte entre o menu lateral (fora da rota /home) e a Home: clicar em "Início" já na Home recarrega os dados. */
@Injectable({ providedIn: 'root' })
export class HomeRefreshService {
  private readonly requested = new Subject<void>();
  readonly refresh$ = this.requested.asObservable();

  request(): void {
    this.requested.next();
  }
}
