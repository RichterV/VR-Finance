import { DestroyRef, signal } from '@angular/core';
import { Observable, Subscription } from 'rxjs';

export type SectionState = 'loading' | 'ready' | 'error';

/**
 * Estado de carga de uma seção da Home: os dados, se está carregando/pronta/com erro, e cancelamento
 * da requisição anterior quando os filtros mudam no meio do caminho. Cada seção trata o próprio erro
 * -- uma falha não trava as outras (antes, um GET com erro deixava o spinner da Home girando pra sempre).
 */
export class SectionLoader<T> {
  readonly data = signal<T | null>(null);
  readonly state = signal<SectionState>('loading');
  private subscription?: Subscription;

  constructor(destroyRef: DestroyRef, private readonly onSettled?: () => void) {
    destroyRef.onDestroy(() => this.subscription?.unsubscribe());
  }

  load(source: Observable<T>): void {
    this.subscription?.unsubscribe();
    // Recarga com dado na tela (troca de mês, pull-to-refresh) não volta pro esqueleto: mantém o
    // conteúdo anterior até o novo chegar.
    if (this.data() === null) this.state.set('loading');
    this.subscription = source.subscribe({
      next: (value) => {
        this.data.set(value);
        this.state.set('ready');
        this.onSettled?.();
      },
      error: () => {
        this.state.set('error');
        this.onSettled?.();
      },
    });
  }
}
