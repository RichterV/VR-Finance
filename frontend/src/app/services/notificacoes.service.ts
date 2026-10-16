import { HttpClient } from '@angular/common/http';
import { Injectable, computed, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../environments/environment';
import { ShareNivel, ShareStatus, UsuarioRef } from './casa.service';
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

interface NotificacaoBase {
  id: number;
  titulo: string;
  lida: boolean;
  created_at: string;
}

/** Resumo da virada do mês (dia 1). */
export interface NotificacaoResumoMensal extends NotificacaoBase {
  tipo: 'resumo_mensal';
  ano: number;
  mes: number;
  payload: ResumoMensalPayload;
}

/** Aviso de que o relatório do ano que passou está pronto (virada do ano) -- não leva dados. */
export interface NotificacaoRelatorioAnual extends NotificacaoBase {
  tipo: 'relatorio_anual';
  ano: number;
  mes: number;
  payload: null;
}

export interface CompartilhamentoPayload {
  compartilhamento_id: number;
  evento: 'convite' | 'aceito' | 'recusado' | 'revogado' | 'saiu' | 'imovel_excluido' | 'nivel';
  item_tipo: 'imovel';
  item_id: number;
  item_nome: string;
  /** Quem fez a ação (enviou, aceitou, encerrou...). */
  ator: UsuarioRef;
  nivel: ShareNivel;
  /** Situação atual do compartilhamento (no convite: se ainda dá pra aceitar). null = não existe mais. */
  status: ShareStatus | null;
}

/** Avisos de compartilhamento de imóvel (convite, resposta, encerramento, mudança de nível) -- sem mês. */
export interface NotificacaoCompartilhamento extends NotificacaoBase {
  tipo: 'compartilhamento_convite' | 'compartilhamento_resposta' | 'compartilhamento_encerrado' | 'compartilhamento_nivel';
  ano: null;
  mes: null;
  payload: CompartilhamentoPayload;
}

export type Notificacao = NotificacaoResumoMensal | NotificacaoRelatorioAnual | NotificacaoCompartilhamento;

/** Convite de compartilhamento que ainda espera Aceitar/Recusar. */
export function isConvitePendente(n: Notificacao): n is NotificacaoCompartilhamento {
  return n.tipo === 'compartilhamento_convite' && n.payload.status === 'pendente';
}

/** Central de notificações: resumo da virada do mês (dia 1), aviso de relatório anual (virada do ano) e
 * avisos de compartilhamento de imóvel, gerados pelo backend. */
@Injectable({ providedIn: 'root' })
export class NotificacoesService {
  private readonly baseUrl = `${environment.apiUrl}/notificacoes`;

  readonly items = signal<Notificacao[]>([]);
  /** Não lidas + convites ainda sem resposta (esses contam mesmo depois de "marcar todas como lidas"). */
  readonly naoLidas = computed(() => this.items().filter((n) => !n.lida || isConvitePendente(n)).length);
  /** Resumo mais recente ainda não lido -- vira o card de destaque no topo da Home. */
  readonly resumoPendente = computed(
    () => this.items().find((n): n is NotificacaoResumoMensal => !n.lida && n.tipo === 'resumo_mensal') ?? null,
  );

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
