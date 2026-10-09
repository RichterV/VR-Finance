import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, Input, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar, ModalController, PopoverController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { attachOutline, chevronBackOutline, chevronForwardOutline, close, repeatOutline } from 'ionicons/icons';
import { Subscription, catchError, firstValueFrom, forkJoin, of } from 'rxjs';

import { maskCurrency } from '../../home/sections/value-mask';
import { AttachmentsService } from '../../services/attachments.service';
import { Gasto, GastosService } from '../../services/gastos.service';
import { IndicadorMensal } from '../../services/notificacoes.service';
import { Receita, ReceitasService } from '../../services/receitas.service';
import { DetalhesMes, ResumoService } from '../../services/resumo.service';
import { ErrorStateComponent } from '../../shared/error-state.component';
import { todayIso } from '../../shared/launch-date';
import { MESES_COMPLETOS } from '../../shared/months';
import { PrioDotComponent } from '../../shared/prio-dot.component';
import { SectionSkeletonComponent } from '../../shared/section-skeleton.component';
import {
  FiltroGasto,
  ModoLista,
  Sentido,
  agruparPorCategoria,
  diferencaTexto,
  diferencaTom,
  aplicaFiltros,
  chaveAnexo,
  ordenar,
  programados,
  ranking,
  segmentosComposicao,
  usoDaReceita,
  variacaoTexto,
  variacaoTom,
} from './detalhes-mes.utils';

const LIMITE_ITENS = 200;
/** Categorias visíveis antes de "Ver todas". */
const CATEGORIAS_VISIVEIS = 8;

interface CardResumo {
  chave: string;
  rotulo: string;
  ind: IndicadorMensal;
  sentido: Sentido;
  destaque?: boolean;
  /** Pode ser negativo: compara pela diferença em R$, não em %. */
  emReais?: boolean;
}

const FILTROS: { chave: FiltroGasto; rotulo: string }[] = [
  { chave: 'essencial', rotulo: 'Essencial' },
  { chave: 'nao_essencial', rotulo: 'Não essencial' },
  { chave: 'parcelado', rotulo: 'Parcelado' },
  { chave: 'recorrente', rotulo: 'Recorrente' },
  { chave: 'anexo', rotulo: 'Com anexo' },
];

/**
 * "Ver detalhes" do mês: só leitura (editar/excluir ficam em Visualizar dados). Resumo com comparação
 * contra a média dos 3 meses anteriores, para onde foi o dinheiro, composição, o que ainda vai cair e a
 * lista de lançamentos agrupada/filtrável. Navega entre meses sem fechar.
 */
@Component({
  selector: 'app-detalhes-mes-modal',
  templateUrl: './detalhes-mes-modal.component.html',
  styleUrls: ['./detalhes-mes-modal.component.scss'],
  imports: [
    DatePipe,
    NgTemplateOutlet,
    IonHeader,
    IonToolbar,
    IonButtons,
    IonButton,
    IonIcon,
    IonTitle,
    IonContent,
    PrioDotComponent,
    SectionSkeletonComponent,
    ErrorStateComponent,
  ],
})
export class DetalhesMesModalComponent implements OnInit, OnDestroy {
  @Input({ required: true }) ano!: number;
  @Input({ required: true }) mes!: number;
  /** Olho da Home: R$ ocultos, percentuais visíveis. */
  @Input() valoresOcultos = false;

  private readonly resumoService = inject(ResumoService);
  private readonly gastosService = inject(GastosService);
  private readonly receitasService = inject(ReceitasService);
  private readonly attachmentsService = inject(AttachmentsService);
  private readonly modalCtrl = inject(ModalController);
  private readonly popoverCtrl = inject(PopoverController);

  readonly filtrosDisponiveis = FILTROS;

  readonly periodo = signal({ ano: 0, mes: 0 });
  readonly loading = signal(true);
  readonly error = signal(false);
  readonly detalhes = signal<DetalhesMes | null>(null);
  readonly gastos = signal<Gasto[]>([]);
  readonly totalGastosLista = signal(0);
  readonly receitas = signal<Receita[]>([]);
  readonly comAnexo = signal<ReadonlySet<string>>(new Set());
  readonly receitasComAnexo = signal<ReadonlySet<string>>(new Set());

  readonly modo = signal<ModoLista>('categoria');
  readonly filtros = signal<ReadonlySet<FiltroGasto>>(new Set());
  readonly categoriaFiltro = signal<number | null>(null);

  private subscription?: Subscription;

  readonly titulo = computed(() => {
    const { ano, mes } = this.periodo();
    return mes ? `${MESES_COMPLETOS[mes - 1]} de ${ano}` : '';
  });

  readonly statusTexto = computed(() => {
    const d = this.detalhes();
    if (!d) return '';
    if (d.situacao === 'atual') return `Em andamento · dia ${d.dia_atual} de ${d.dias_no_mes}`;
    return d.situacao === 'passado' ? 'Mês encerrado' : 'Mês futuro';
  });

  readonly cards = computed<CardResumo[]>(() => {
    const d = this.detalhes();
    if (!d) return [];
    return [
      { chave: 'disponivel', rotulo: 'Disponível pra gastar', ind: d.disponivel, sentido: 'maior-melhor', destaque: true, emReais: true },
      { chave: 'receita', rotulo: 'Receita', ind: d.receita, sentido: 'maior-melhor' },
      { chave: 'gastos', rotulo: 'Gastos', ind: d.gastos, sentido: 'menor-melhor' },
      { chave: 'caixa', rotulo: 'Caixa pretendido', ind: d.caixa_pretendido, sentido: 'neutro' },
      { chave: 'real', rotulo: 'Caixa real', ind: d.caixa_real, sentido: 'maior-melhor', emReais: true },
    ];
  });

  readonly uso = computed(() => {
    const d = this.detalhes();
    return d ? usoDaReceita(d.receita.valor, d.gastos.valor, d.caixa_pretendido.valor) : null;
  });

  readonly todasCategorias = signal(false);
  readonly categoriasVisiveis = computed(() => {
    const todas = this.detalhes()?.categorias ?? [];
    return this.todasCategorias() ? todas : todas.slice(0, CATEGORIAS_VISIVEIS);
  });
  readonly categoriasEscondidas = computed(() => Math.max(0, (this.detalhes()?.categorias.length ?? 0) - CATEGORIAS_VISIVEIS));

  readonly maiorCategoria = computed(() => Math.max(0, ...(this.detalhes()?.categorias.map((c) => c.total) ?? [])));
  readonly composicao = computed(() => {
    const d = this.detalhes();
    return d ? segmentosComposicao(d.composicao) : [];
  });

  /** Lista de "ainda vai cair": mês futuro inteiro, ou o que tem data depois de hoje no mês atual. */
  readonly aVencer = computed(() => {
    const d = this.detalhes();
    if (!d || d.situacao === 'passado') return [];
    return programados(this.gastos(), todayIso());
  });

  readonly posicoes = computed(() => ranking(this.gastos()));
  readonly filtrados = computed(() => aplicaFiltros(this.gastos(), this.filtros(), this.comAnexo(), this.categoriaFiltro()));
  readonly grupos = computed(() => agruparPorCategoria(this.filtrados()));
  readonly listaPlana = computed(() => {
    const modo = this.modo();
    return modo === 'categoria' ? [] : ordenar(this.filtrados(), modo);
  });
  readonly totalFiltrado = computed(() => this.filtrados().reduce((acc, g) => acc + g.value, 0));
  readonly filtrando = computed(() => this.filtros().size > 0 || this.categoriaFiltro() !== null);
  readonly nomeCategoriaFiltro = computed(() => {
    const id = this.categoriaFiltro();
    return this.detalhes()?.categorias.find((c) => c.item_id === id)?.item_name ?? '';
  });
  readonly totalReceitas = computed(() => this.receitas().reduce((acc, r) => acc + r.value, 0));
  readonly listaIncompleta = computed(() => this.totalGastosLista() > this.gastos().length);

  constructor() {
    addIcons({ close, chevronBackOutline, chevronForwardOutline, repeatOutline, attachOutline });
  }

  ngOnInit(): void {
    this.periodo.set({ ano: this.ano, mes: this.mes });
    this.carregar();
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  carregar(): void {
    const { ano, mes } = this.periodo();
    this.subscription?.unsubscribe();
    this.loading.set(true);
    this.error.set(false);
    const params = { ano, mes, limit: LIMITE_ITENS };
    this.subscription = forkJoin([
      this.resumoService.detalhesMes(ano, mes),
      this.gastosService.list(params),
      this.receitasService.list(params),
    ]).subscribe({
      next: ([detalhes, gastos, receitas]) => {
        this.detalhes.set(detalhes);
        this.gastos.set(gastos.items);
        this.totalGastosLista.set(gastos.total);
        this.receitas.set(receitas.items);
        this.loading.set(false);
        this.carregarAnexos();
      },
      error: () => {
        this.loading.set(false);
        this.error.set(true);
      },
    });
  }

  /** Ícone de anexo: em lote, sem travar a tela se falhar. */
  private carregarAnexos(): void {
    const chaves = [...new Set(this.gastos().map(chaveAnexo))];
    const receitas = this.receitas().map((r) => String(r.id));
    forkJoin([
      chaves.length ? this.attachmentsService.exists('gasto', chaves) : of({ entity_ids_with_attachments: [] }),
      receitas.length ? this.attachmentsService.exists('receita', receitas) : of({ entity_ids_with_attachments: [] }),
    ])
      .pipe(catchError(() => of(null)))
      .subscribe((res) => {
        if (!res) return;
        this.comAnexo.set(new Set(res[0].entity_ids_with_attachments));
        this.receitasComAnexo.set(new Set(res[1].entity_ids_with_attachments));
      });
  }

  mudarMes(delta: number): void {
    const { ano, mes } = this.periodo();
    const indice = ano * 12 + (mes - 1) + delta;
    this.periodo.set({ ano: Math.floor(indice / 12), mes: (indice % 12) + 1 });
    this.categoriaFiltro.set(null);
    this.carregar();
  }

  setModo(modo: ModoLista): void {
    this.modo.set(modo);
  }

  toggleFiltro(filtro: FiltroGasto): void {
    this.filtros.update((atual) => {
      const novo = new Set(atual);
      if (novo.has(filtro)) {
        novo.delete(filtro);
      } else {
        novo.add(filtro);
        // Essencial e Não essencial juntos esvaziariam a lista: um desliga o outro.
        if (filtro === 'essencial') novo.delete('nao_essencial');
        if (filtro === 'nao_essencial') novo.delete('essencial');
      }
      return novo;
    });
  }

  toggleTodasCategorias(): void {
    this.todasCategorias.update((v) => !v);
  }

  toggleCategoria(itemId: number): void {
    this.categoriaFiltro.update((atual) => (atual === itemId ? null : itemId));
  }

  limparFiltros(): void {
    this.filtros.set(new Set());
    this.categoriaFiltro.set(null);
  }

  temAnexo(g: Gasto): boolean {
    return this.comAnexo().has(chaveAnexo(g));
  }

  async abrirAnexos(ev: Event, tipo: 'gasto' | 'receita', chave: string): Promise<void> {
    const { AttachmentsPopoverComponent } = await import('../../shared/attachments-popover.component');
    const files = await firstValueFrom(this.attachmentsService.list(tipo, chave));
    const popover = await this.popoverCtrl.create({ component: AttachmentsPopoverComponent, componentProps: { files }, event: ev });
    await popover.present();
  }

  chaveAnexo = chaveAnexo;

  currency(valor: number): string {
    return maskCurrency(valor, this.valoresOcultos);
  }

  pct(valor: number): string {
    return `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`;
  }

  variacao(ind: Pick<IndicadorMensal, 'media' | 'variacao_pct'>): string {
    return variacaoTexto(ind);
  }

  tom(variacao: number | null, sentido: Sentido): string {
    return variacaoTom(variacao, sentido);
  }

  cardDelta(card: CardResumo): string {
    return card.emReais ? diferencaTexto(card.ind, (v) => this.currency(v)) : variacaoTexto(card.ind);
  }

  cardTom(card: CardResumo): string {
    if (card.destaque) return 'neutro';
    return card.emReais ? diferencaTom(card.ind, card.sentido) : variacaoTom(card.ind.variacao_pct, card.sentido);
  }

  larguraCategoria(total: number): number {
    const maior = this.maiorCategoria();
    return maior ? (total / maior) * 100 : 0;
  }

  dismiss(): void {
    this.modalCtrl.dismiss();
  }
}
