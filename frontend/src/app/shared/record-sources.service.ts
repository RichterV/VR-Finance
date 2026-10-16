import { Injectable, inject } from '@angular/core';
import { ModalController } from '@ionic/angular';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';

import { ModalLauncherService } from '../core/modal-launcher.service';
import { ModuleKey } from '../core/modules';
import { EntityType } from '../services/attachments.service';
import { EmpresaService, NotaFiscal } from '../services/empresa.service';
import { Gasto, GastosService } from '../services/gastos.service';
import { Receita, ReceitasService } from '../services/receitas.service';
import { ServicoVeiculo, ServicosVeiculosService } from '../services/servicos-veiculos.service';
import { CasaService, nivelPermite, ServicoCasa } from '../services/casa.service';
import { formatCurrencyValue } from './currency-mask';

/** Um lançamento existente, no formato comum da tela "Anexar a um lançamento". */
export interface RecordRow {
  source: RecordSource;
  /** Chave pra deduplicar/trackear (tipo + entityId). */
  key: string;
  /** Pra onde o anexo vai: o grupo inteiro em gasto parcelado/devedor (mesma regra dos modais). */
  entityId: string | number;
  date: string;
  title: string;
  meta: string;
  value: number | null;
  record: unknown;
}

export interface RecordSource {
  type: EntityType;
  /** Nome com o artigo ("ao gasto", "à receita") -- usado nas frases ("Anexado ao gasto..."). */
  toNoun: string;
  label: string;
  module?: ModuleKey;
  /** Só nota fiscal aceita XML como anexo (backend). */
  acceptsXml: boolean;
  search(busca: string, offset: number, limit: number): Observable<{ rows: RecordRow[]; total: number }>;
  /** Lançamentos perto de hoje, pras sugestões pelo valor do comprovante. */
  recent(): Observable<RecordRow[]>;
  openEditor(record: unknown): Promise<HTMLIonModalElement>;
}

export function brl(value: number | null): string {
  return value === null ? '' : `R$ ${formatCurrencyValue(value)}`;
}

export function formatDateBr(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

/** Mês retrasado, passado, atual e o seguinte -- cobre a janela das sugestões (60 dias pra trás). */
export function monthsAround(today: Date = new Date()): { ano: number; mes: number }[] {
  return [-2, -1, 0, 1].map((delta) => {
    const d = new Date(today.getFullYear(), today.getMonth() + delta, 1);
    return { ano: d.getFullYear(), mes: d.getMonth() + 1 };
  });
}

const SEARCH_LIMIT = 200;

/**
 * Os tipos de registro que aceitam anexo, cada um com a própria listagem e o próprio modal de
 * editar -- usados pela tela "Anexar a um lançamento existente" (arquivo compartilhado de outro app).
 */
@Injectable({ providedIn: 'root' })
export class RecordSourcesService {
  private readonly modalCtrl = inject(ModalController);
  private readonly launcher = inject(ModalLauncherService);
  private readonly gastos = inject(GastosService);
  private readonly receitas = inject(ReceitasService);
  private readonly servicos = inject(ServicosVeiculosService);
  private readonly casa = inject(CasaService);
  private readonly empresa = inject(EmpresaService);

  readonly all: RecordSource[] = [
    this.gastoSource(),
    this.receitaSource(),
    this.servicoSource(),
    this.servicoCasaSource(),
    this.notaSource(),
  ];

  private async openModal(loader: () => Promise<unknown>, props: Record<string, unknown>): Promise<HTMLIonModalElement> {
    const component = await loader();
    const modal = await this.modalCtrl.create({
      component: component as never,
      componentProps: props,
      ...this.launcher.sideModalOptions(),
    });
    await modal.present();
    return modal;
  }

  private gastoSource(): RecordSource {
    const source: RecordSource = {
      type: 'gasto',
      toNoun: 'ao gasto',
      label: 'Gasto',
      acceptsXml: false,
      search: (busca, offset, limit) =>
        this.gastos.list({ busca: busca || undefined, offset, limit }).pipe(map((p) => ({ rows: p.items.map(row), total: p.total }))),
      recent: () =>
        forkJoin(monthsAround().map((m) => this.gastos.list({ ...m, limit: SEARCH_LIMIT }))).pipe(
          map((pages) => pages.flatMap((p) => p.items.map(row))),
        ),
      openEditor: (gasto) =>
        this.openModal(() => import('../modals/editar-gasto/editar-gasto-modal.component').then((m) => m.EditarGastoModalComponent), {
          gasto,
        }),
    };
    const row = (g: Gasto): RecordRow => ({
      source,
      key: `gasto-${g.installment_group_id ?? g.id}`,
      entityId: g.installment_group_id ?? g.id,
      date: g.date,
      title: g.description ? `${g.item_name} · ${g.description}` : g.item_name,
      meta: g.is_installment ? `Parcela ${g.installment_number}/${g.installment_count}` : '',
      value: g.value,
      record: g,
    });
    return source;
  }

  private receitaSource(): RecordSource {
    const source: RecordSource = {
      type: 'receita',
      toNoun: 'à receita',
      label: 'Receita',
      acceptsXml: false,
      search: (busca, offset, limit) =>
        this.receitas.list({ busca: busca || undefined, offset, limit }).pipe(map((p) => ({ rows: p.items.map(row), total: p.total }))),
      recent: () =>
        forkJoin(monthsAround().map((m) => this.receitas.list({ ...m, limit: SEARCH_LIMIT }))).pipe(
          map((pages) => pages.flatMap((p) => p.items.map(row))),
        ),
      openEditor: (receita) =>
        this.openModal(
          () => import('../modals/editar-receita/editar-receita-modal.component').then((m) => m.EditarReceitaModalComponent),
          { receita },
        ),
    };
    const row = (r: Receita): RecordRow => ({
      source,
      key: `receita-${r.id}`,
      entityId: r.id,
      date: r.date,
      title: r.description || 'Receita',
      meta: `${r.cash_percentage}% pro caixa`,
      value: r.value,
      record: r,
    });
    return source;
  }

  private servicoSource(): RecordSource {
    const source: RecordSource = {
      type: 'servico_veiculo',
      toNoun: 'ao serviço',
      label: 'Serviço de veículo',
      module: 'veiculos',
      acceptsXml: false,
      search: (busca, offset, limit) =>
        this.servicos.list({ busca: busca || undefined, offset, limit }).pipe(map((p) => ({ rows: p.items.map(row), total: p.total }))),
      recent: () => this.servicos.list({ limit: 100 }).pipe(map((p) => p.items.map(row))),
      openEditor: (servico) =>
        this.openModal(
          () => import('../modals/editar-servico/editar-servico-modal.component').then((m) => m.EditarServicoModalComponent),
          { servico },
        ),
    };
    const row = (s: ServicoVeiculo): RecordRow => ({
      source,
      key: `servico_veiculo-${s.id}`,
      entityId: s.id,
      date: s.date,
      title: s.description,
      meta: s.vehicle_name,
      value: s.value,
      record: s,
    });
    return source;
  }

  /** Ids dos imóveis (compartilhados comigo) em que meu nível não deixa cadastrar/anexar. */
  private casaSemCadastro() {
    return this.casa
      .listImoveis()
      .pipe(map((imoveis) => new Set(imoveis.filter((i) => !nivelPermite(i.meu_nivel, 'cadastro')).map((i) => i.id))));
  }

  private servicoCasaSource(): RecordSource {
    const source: RecordSource = {
      type: 'servico_casa',
      toNoun: 'ao serviço da casa',
      label: 'Serviço da casa',
      module: 'manutencao_casa',
      acceptsXml: false,
      // Imóvel compartilhado comigo só como Leitura não aceita anexo novo: os serviços dele ficam de fora.
      search: (busca, offset, limit) =>
        forkJoin([this.casaSemCadastro(), this.casa.listServicos({ busca: busca || undefined, offset, limit })]).pipe(
          map(([bloqueados, p]) => {
            const items = p.items.filter((s) => !bloqueados.has(s.imovel_id));
            return { rows: items.map(row), total: p.total - (p.items.length - items.length) };
          }),
        ),
      recent: () =>
        forkJoin([this.casaSemCadastro(), this.casa.listServicos({ limit: 100 })]).pipe(
          map(([bloqueados, p]) => p.items.filter((s) => !bloqueados.has(s.imovel_id)).map(row)),
        ),
      openEditor: (servico) =>
        this.openModal(
          () => import('../modals/servico-casa/servico-casa-modal.component').then((m) => m.ServicoCasaModalComponent),
          { servico },
        ),
    };
    const row = (s: ServicoCasa): RecordRow => ({
      source,
      key: `servico_casa-${s.id}`,
      entityId: s.id,
      date: s.date,
      title: s.description,
      meta: s.prestador ? `${s.imovel_name} · ${s.prestador}` : s.imovel_name,
      value: s.value,
      record: s,
    });
    return source;
  }


  private notaSource(): RecordSource {
    const source: RecordSource = {
      type: 'nota_fiscal',
      toNoun: 'à nota fiscal',
      label: 'Nota fiscal',
      module: 'empresa',
      acceptsXml: true,
      search: (busca, offset, limit) =>
        this.empresa
          .listNotas({ busca: busca || undefined, offset, limit })
          .pipe(map((p) => ({ rows: p.items.map(row), total: p.total }))),
      recent: () => this.empresa.listNotas({ limit: 100 }).pipe(map((p) => p.items.map(row))),
      openEditor: (nota) =>
        this.openModal(() => import('../modals/nota-fiscal/nota-fiscal-modal.component').then((m) => m.NotaFiscalModalComponent), {
          nota,
        }),
    };
    const row = (n: NotaFiscal): RecordRow => ({
      source,
      key: `nota_fiscal-${n.id}`,
      entityId: n.id,
      date: n.data_emissao,
      title: `Nota ${n.numero} · ${n.tomador_nome}`,
      meta: n.substituida_por ? `substituída pela ${n.substituida_por_numero ?? ''}`.trim() : '',
      value: n.valor,
      record: n,
    });
    return source;
  }

  /** Sugestões: lançamentos com o mesmo valor, de 60 dias atrás até o fim do mês que vem, mais perto de hoje primeiro. */
  suggestions(sources: RecordSource[], value: number, today: Date = new Date()): Observable<RecordRow[]> {
    if (!sources.length) return of([]);
    return forkJoin(sources.map((s) => s.recent().pipe(catchError(() => of([] as RecordRow[]))))).pipe(
      map((lists) => pickSuggestions(lists.flat(), value, today)),
    );
  }
}

export const SUGGESTION_DAYS_BACK = 60;
const MAX_SUGGESTIONS = 5;

export function pickSuggestions(rows: RecordRow[], value: number, today: Date = new Date()): RecordRow[] {
  const cents = Math.round(value * 100);
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - SUGGESTION_DAYS_BACK);
  const end = new Date(today.getFullYear(), today.getMonth() + 2, 0);
  const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const best = new Map<string, { row: RecordRow; distance: number }>();
  for (const row of rows) {
    if (row.value === null || Math.round(row.value * 100) !== cents) continue;
    const [y, m, d] = row.date.slice(0, 10).split('-').map(Number);
    const date = new Date(y, m - 1, d);
    if (date < start || date > end) continue;
    // Parcelas do mesmo grupo têm o mesmo anexo: fica só a mais perto de hoje
    const distance = Math.abs(date.getTime() - todayMs);
    const current = best.get(row.key);
    if (!current || distance < current.distance) best.set(row.key, { row, distance });
  }
  return [...best.values()]
    .sort((a, b) => a.distance - b.distance)
    .slice(0, MAX_SUGGESTIONS)
    .map((b) => b.row);
}
