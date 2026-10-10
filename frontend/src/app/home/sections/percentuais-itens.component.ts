import { Component, HostListener, computed, input, signal } from '@angular/core';

import { ItemPercentual } from '../../services/resumo.service';
import { maskCurrency, maskPercent, maskWidth } from './value-mask';

/** Quantas categorias aparecem antes do "Ver todas". */
const LIMITE = 8;

/**
 * Categorias do período numa lista só, da maior pra menor, todas na mesma escala (a barra mais longa
 * é a maior categoria do período). A cor da barra e o ponto dizem a prioridade, com as cores de
 * Essenciais/Não essenciais dos gráficos. Antes eram duas colunas, cada uma escalada pelo próprio
 * maior item: Eletrônicos com 10% aparecia com a barra cheia, igual ao Aluguel com 23%.
 * Toque/clique numa barra mostra o valor em R$. `recolhido`: começa fechada (Resumo anual).
 */
@Component({
  selector: 'app-percentuais-itens',
  template: `
    @if (itens().length) {
      <section class="percentuais-card">
        <div class="percentuais-head">
          @if (recolhido()) {
            <button type="button" class="percentuais-toggle" [attr.aria-expanded]="aberto()" (click)="aberto.set(!aberto())">
              <h3>{{ titulo() }}</h3>
              <span class="toggle-text">{{ aberto() ? 'Ocultar' : 'Mostrar' }}</span>
            </button>
          } @else {
            <h3>{{ titulo() }}</h3>
          }
          @if (!recolhido() || aberto()) {
            <span class="percentuais-legend" aria-hidden="true">
              <span><i class="cat-dot essencial"></i>Essencial</span>
              <span><i class="cat-dot nao-essencial"></i>Não essencial</span>
            </span>
          }
        </div>
        @if (!recolhido() || aberto()) {
          <ul class="percentuais-list">
            @for (item of visiveis(); track item.priority + '-' + item.item_id) {
              @let key = item.priority + '-' + item.item_id;
              <li class="percentual-row">
                <span class="percentual-name">
                  <i class="cat-dot" [class.essencial]="item.priority === 'essencial'" [class.nao-essencial]="item.priority !== 'essencial'" aria-hidden="true"></i>
                  {{ item.item_name }}
                </span>
                <button
                  type="button"
                  class="percentual-bar"
                  [attr.aria-label]="item.item_name + ', ' + (item.priority === 'essencial' ? 'essencial' : 'não essencial') + ': ' + currency(item.total)"
                  (click)="toggle(key, $event)"
                >
                  <span
                    class="percentual-fill"
                    [class.essencial]="item.priority === 'essencial'"
                    [class.nao-essencial]="item.priority !== 'essencial'"
                    [style.width.%]="width((item.total / max()) * 100)"
                  ></span>
                  <span class="percentual-tooltip" [class.visible]="ativo() === key">{{ currency(item.total) }}</span>
                </button>
                <span class="percentual-value">{{ percent(item.percentual) }}</span>
              </li>
            }
          </ul>
          @if (ordenados().length > limite) {
            <button type="button" class="percentuais-more" (click)="todas.set(!todas())">
              {{ todas() ? 'Mostrar só as ' + limite + ' maiores' : 'Ver as ' + ordenados().length + ' categorias' }}
            </button>
          }
        }
      </section>
    }
  `,
  styles: [
    `
      :host {
        display: block;
      }
      button.percentual-bar {
        border: none;
        padding: 0;
        width: 100%;
        font: inherit;
      }
    `,
  ],
})
export class PercentuaisItensComponent {
  readonly itens = input.required<ItemPercentual[]>();
  readonly valoresOcultos = input(false);
  readonly titulo = input('Para onde foi o dinheiro');
  readonly recolhido = input(false);

  readonly limite = LIMITE;
  /** Barra com o tooltip de valor aberto por clique (null = nenhuma). */
  readonly ativo = signal<string | null>(null);
  readonly todas = signal(false);
  /** Só vale com `recolhido`. */
  readonly aberto = signal(false);

  readonly ordenados = computed(() => [...this.itens()].sort((a, b) => b.total - a.total));
  readonly visiveis = computed(() => (this.todas() ? this.ordenados() : this.ordenados().slice(0, LIMITE)));
  readonly max = computed(() => this.ordenados()[0]?.total || 1);

  currency(valor: number): string {
    return maskCurrency(valor, this.valoresOcultos());
  }

  percent(valor: number): string {
    return maskPercent(valor, this.valoresOcultos());
  }

  width(largura: number): number {
    return maskWidth(largura, this.valoresOcultos());
  }

  toggle(key: string, event: Event): void {
    event.stopPropagation();
    this.ativo.update((atual) => (atual === key ? null : key));
  }

  @HostListener('document:click')
  fechar(): void {
    this.ativo.set(null);
  }
}
