import { HttpClient } from '@angular/common/http';
import { Injectable, computed, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import { Priority } from './dropdown-options.service';

export interface IndicadorMensal {
  valor: number;
  /** Média dos meses base; null = sem histórico pra comparar. */
  media: number | null;
  variacao_pct: number | null;
}

export interface VariacaoCategoria {
  item_id: number;
  item_name: string;
  priority: Priority;
  valor: number;
  media: number;
  diferenca: number;
  variacao_pct: number;
}

export interface GastoPontual {
  item_id: number;
  item_name: string;
  priority: Priority;
  valor: number;
}

export interface ParcelamentoResumo {
  descricao: string;
  item_name: string;
  valor_parcela: number;
  parcelas: number;
}

export interface ResumoMensalPayload {
  ano: number;
  mes: number;
  meses_base: number;
  gastos: IndicadorMensal;
  receita: IndicadorMensal;
  caixa_real: IndicadorMensal;
  caixa_pretendido: IndicadorMensal;
  taxa_poupanca: { valor_pct: number | null; media_pct: number | null; meta_pct: number | null };
  subiram: VariacaoCategoria[];
  cairam: VariacaoCategoria[];
  pontuais: GastoPontual[];
  parcelamentos_novos: ParcelamentoResumo[];
  parcelamentos_encerrados: ParcelamentoResumo[];
  inflacao: { cesta: string[]; total_cesta: number; variacao_pct: number | null } | null;
  devedores: { parcelas_atrasadas: number; valor_atrasado: number } | null;
}

export interface Notificacao {
  id: number;
  tipo: 'resumo_mensal';
  ano: number;
  mes: number;
  titulo: string;
  lida: boolean;
  created_at: string;
  payload: ResumoMensalPayload;
}

/** Central de notificações (hoje só o resumo da virada do mês, gerado pelo backend no dia 1). */
@Injectable({ providedIn: 'root' })
export class NotificacoesService {
  private readonly baseUrl = `${environment.apiUrl}/notificacoes`;

  readonly items = signal<Notificacao[]>([]);
  readonly naoLidas = computed(() => this.items().filter((n) => !n.lida).length);
  /** Resumo mais recente ainda não lido -- vira o card de destaque no topo da Home. */
  readonly resumoPendente = computed(() => this.items().find((n) => !n.lida && n.tipo === 'resumo_mensal') ?? null);

  constructor(private readonly http: HttpClient) {}

  /** A própria listagem é quem dispara a geração do resumo do mês no backend. */
  load(): Observable<Notificacao[]> {
    return this.http.get<Notificacao[]>(this.baseUrl).pipe(tap((items) => this.items.set(items)));
  }

  markRead(id: number): Observable<Notificacao> {
    return this.http
      .put<Notificacao>(`${this.baseUrl}/${id}/lida`, {})
      .pipe(tap((updated) => this.items.update((items) => items.map((n) => (n.id === id ? updated : n)))));
  }

  markAllRead(): Observable<void> {
    return this.http
      .put<void>(`${this.baseUrl}/lidas`, {})
      .pipe(tap(() => this.items.update((items) => items.map((n) => ({ ...n, lida: true })))));
  }
}
