import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';

/** Espelha schemas.CasaCategoria. */
export type CasaCategoria =
  | 'eletrica'
  | 'hidraulica'
  | 'pintura'
  | 'estrutura'
  | 'eletrodomesticos'
  | 'jardim'
  | 'limpeza'
  | 'impostos'
  | 'documentos'
  | 'outros';

/** Espelha schemas.CasaServiceType. */
export type CasaServiceType = 'material' | 'material_mao_de_obra' | 'material_mao_de_obra_propria';

export const CASA_CATEGORIA_LABELS: Record<CasaCategoria, string> = {
  eletrica: 'Elétrica',
  hidraulica: 'Hidráulica',
  pintura: 'Pintura',
  estrutura: 'Telhado e estrutura',
  eletrodomesticos: 'Eletrodomésticos',
  jardim: 'Jardim e área externa',
  limpeza: 'Limpeza',
  impostos: 'Impostos',
  documentos: 'Documentos',
  outros: 'Outros',
};

export const CASA_CATEGORIA_ICONS: Record<CasaCategoria, string> = {
  eletrica: 'flash-outline',
  hidraulica: 'water-outline',
  pintura: 'color-palette-outline',
  estrutura: 'home-outline',
  eletrodomesticos: 'tv-outline',
  jardim: 'leaf-outline',
  limpeza: 'sparkles-outline',
  impostos: 'receipt-outline',
  documentos: 'document-text-outline',
  outros: 'construct-outline',
};

export const CASA_SERVICE_TYPE_LABELS: Record<CasaServiceType, string> = {
  material: 'Só material',
  material_mao_de_obra: 'Material + mão de obra',
  material_mao_de_obra_propria: 'Material e mão de obra própria',
};

/** Espelha schemas.ShareNivel -- acumulados: cada um inclui os anteriores. */
export type ShareNivel = 'leitura' | 'cadastro' | 'edicao' | 'total';
export type MeuNivel = 'dono' | ShareNivel;
export type ShareStatus = 'pendente' | 'aceito' | 'recusado' | 'cancelado' | 'expirado' | 'encerrado';

export const SHARE_NIVEL_LABELS: Record<ShareNivel, string> = {
  leitura: 'Leitura',
  cadastro: 'Cadastro',
  edicao: 'Edição',
  total: 'Tudo',
};

export const SHARE_NIVEL_HINTS: Record<ShareNivel, string> = {
  leitura: 'Só vê os serviços, o resumo e os anexos',
  cadastro: 'Vê e cadastra serviços e anexos',
  edicao: 'Vê, cadastra e edita serviços',
  total: 'Vê, cadastra, edita e exclui serviços e anexos',
};

export const SHARE_STATUS_LABELS: Record<ShareStatus, string> = {
  pendente: 'Aguardando resposta',
  aceito: 'Aceito',
  recusado: 'Recusado',
  cancelado: 'Cancelado',
  expirado: 'Expirado',
  encerrado: 'Encerrado',
};

const NIVEL_ORDEM: MeuNivel[] = ['leitura', 'cadastro', 'edicao', 'total', 'dono'];

/** Meu nível no imóvel alcança `minimo`? (o dono pode tudo). */
export function nivelPermite(nivel: MeuNivel | undefined, minimo: ShareNivel): boolean {
  return NIVEL_ORDEM.indexOf(nivel ?? 'dono') >= NIVEL_ORDEM.indexOf(minimo);
}

export interface UsuarioRef {
  id: number;
  username: string;
  nome: string;
}

export interface Imovel {
  id: number;
  name: string;
  active: boolean;
  /** Compartilhado comigo: o dono. Meu: null. */
  dono?: UsuarioRef | null;
  meu_nivel?: MeuNivel;
  compartilhamento_id?: number | null;
  /** Meu: com quantos usuários está compartilhado (aceitos). */
  compartilhado_com?: number;
}

export interface Compartilhamento {
  id: number;
  item_tipo: 'imovel';
  item_id: number;
  item_nome: string;
  dono: UsuarioRef;
  convidado: UsuarioRef;
  nivel: ShareNivel;
  status: ShareStatus;
  created_at: string;
  respondido_em: string | null;
  encerrado_em: string | null;
  expira_em: string | null;
}

export interface ServicoCasaPayload {
  imovel_id: number;
  description: string;
  notes?: string;
  value: number;
  categoria: CasaCategoria;
  service_type?: CasaServiceType;
  prestador?: string;
  garantia_ate?: string | null;
}

export interface ServicoCasaCreatePayload extends ServicoCasaPayload {
  /** AAAA-MM-DD; omitido = hoje. Nunca no futuro. */
  date?: string;
}

export interface ServicoCasa {
  id: number;
  imovel_id: number;
  imovel_name: string;
  description: string;
  notes: string | null;
  value: number;
  categoria: CasaCategoria;
  service_type: CasaServiceType | null;
  prestador: string | null;
  garantia_ate: string | null;
  date: string;
  /** Quem cadastrou (dono ou convidado). null com criado_por_nome null = conta excluída. */
  criado_por?: number | null;
  criado_por_nome?: string | null;
  created_at: string;
}

export interface ServicoCasaListParams {
  imovel_id?: number;
  categoria?: CasaCategoria;
  garantia_vigente?: boolean;
  busca?: string;
  limit?: number;
  offset?: number;
}

export interface ServicoCasaPage {
  items: ServicoCasa[];
  total: number;
}

export interface ImovelResumoItem {
  imovel_id: number;
  imovel_name: string;
  total_gasto: number;
  quantidade_servicos: number;
  ultimo_servico: string | null;
}

export interface CasaCategoriaResumo {
  categoria: CasaCategoria;
  total: number;
  quantidade: number;
}

export interface CasaResumoSerie {
  imovel_name: string;
  valores: number[];
}

export interface CasaResumo {
  imoveis: ImovelResumoItem[];
  categorias: CasaCategoriaResumo[];
  garantias_vigentes: number;
  meses: string[];
  series: CasaResumoSerie[];
}

@Injectable({ providedIn: 'root' })
export class CasaService {
  private readonly baseUrl = `${environment.apiUrl}/casa`;

  constructor(private readonly http: HttpClient) {}

  listImoveis(): Observable<Imovel[]> {
    return this.http.get<Imovel[]>(`${this.baseUrl}/imoveis`);
  }

  createImovel(name: string): Observable<Imovel> {
    return this.http.post<Imovel>(`${this.baseUrl}/imoveis`, { name });
  }

  updateImovel(id: number, name: string): Observable<Imovel> {
    return this.http.put<Imovel>(`${this.baseUrl}/imoveis/${id}`, { name });
  }

  removeImovel(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/imoveis/${id}`);
  }

  resumo(meses = 12, ano?: number, mes?: number): Observable<CasaResumo> {
    const params: Record<string, number> = { meses };
    if (ano != null) params['ano'] = ano;
    if (mes != null) params['mes'] = mes;
    return this.http.get<CasaResumo>(`${this.baseUrl}/resumo`, { params });
  }

  listServicos(params: ServicoCasaListParams = {}): Observable<ServicoCasaPage> {
    const query: Record<string, number | string | boolean> = {};
    if (params.imovel_id != null) query['imovel_id'] = params.imovel_id;
    if (params.categoria) query['categoria'] = params.categoria;
    if (params.garantia_vigente) query['garantia_vigente'] = true;
    if (params.busca) query['busca'] = params.busca;
    query['limit'] = params.limit ?? 25;
    query['offset'] = params.offset ?? 0;
    return this.http.get<ServicoCasaPage>(`${this.baseUrl}/servicos`, { params: query });
  }

  createServico(payload: ServicoCasaCreatePayload): Observable<ServicoCasa> {
    return this.http.post<ServicoCasa>(`${this.baseUrl}/servicos`, payload);
  }

  updateServico(id: number, payload: ServicoCasaPayload): Observable<ServicoCasa> {
    return this.http.put<ServicoCasa>(`${this.baseUrl}/servicos/${id}`, payload);
  }

  removeServico(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/servicos/${id}`);
  }

  // --- Compartilhamento de imóvel (/compartilhamentos) ---

  listCompartilhamentos(imovelId: number): Observable<Compartilhamento[]> {
    return this.http.get<Compartilhamento[]>(`${environment.apiUrl}/compartilhamentos`, {
      params: { item_tipo: 'imovel', item_id: imovelId },
    });
  }

  compartilhar(imovelId: number, username: string, nivel: ShareNivel): Observable<Compartilhamento> {
    return this.http.post<Compartilhamento>(`${environment.apiUrl}/compartilhamentos`, {
      item_tipo: 'imovel',
      item_id: imovelId,
      username,
      nivel,
    });
  }

  mudarNivel(id: number, nivel: ShareNivel): Observable<Compartilhamento> {
    return this.http.put<Compartilhamento>(`${environment.apiUrl}/compartilhamentos/${id}`, { nivel });
  }

  /** Dono: cancela (pendente) ou encerra (aceito). Convidado: sai do compartilhamento. */
  encerrarCompartilhamento(id: number): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/compartilhamentos/${id}`);
  }

  aceitarCompartilhamento(id: number): Observable<Compartilhamento> {
    return this.http.post<Compartilhamento>(`${environment.apiUrl}/compartilhamentos/${id}/aceitar`, {});
  }

  recusarCompartilhamento(id: number): Observable<Compartilhamento> {
    return this.http.post<Compartilhamento>(`${environment.apiUrl}/compartilhamentos/${id}/recusar`, {});
  }
}

/** Garantia ainda valendo hoje (o dia final conta). */
export function garantiaVigente(garantiaAte: string | null, hojeIso: string): boolean {
  return garantiaAte != null && garantiaAte >= hojeIso;
}
