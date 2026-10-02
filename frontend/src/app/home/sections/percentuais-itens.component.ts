import { Component, HostListener, computed, input, signal } from '@angular/core';

import { Priority } from '../../services/dropdown-options.service';
import { ItemPercentual } from '../../services/resumo.service';
import { maskCurrency, maskPercent, maskWidth } from './value-mask';

interface Grupo {
  priority: Priority;
  titulo: string;
  itens: ItemPercentual[];
  max: number;
}

/**
 * Barras de percentual por categoria (Essencial / Não essencial), ordenadas do maior pro menor e
 * escaladas pelo maior do grupo. Toque/clique numa barra mostra o valor em R$.
 */
@Component({
  selector: 'app-percentuais-itens',
  template: `
    @if (itens().length) {
      <div class="percentuais-grid">
        @for (grupo of grupos(); track grupo.priority) {
          <div class="percentuais-col">
            <h3>{{ grupo.titulo }}</h3>
            @for (item of grupo.itens; track item.item_id) {
              @let key = grupo.priority + '-' + item.item_id;
              <div class="percentual-row">
                <span class="percentual-name">{{ item.item_name }}</span>
                <button
                  type="button"
                  class="percentual-bar"
                  [attr.aria-label]="item.item_name + ': ' + currency(item.total)"
                  (click)="toggle(key, $event)"
                >
                  <span class="percentual-fill" [style.width.%]="width((item.percentual / grupo.max) * 100)"></span>
                  <span class="percentual-tooltip" [class.visible]="ativo() === key">{{ currency(item.total) }}</span>
                </button>
                <span class="percentual-value">{{ percent(item.percentual) }}</span>
              </div>
            }
          </div>
        }
      </div>
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

  /** Barra com o tooltip de valor aberto por clique (null = nenhuma). */
  readonly ativo = signal<string | null>(null);

  readonly grupos = computed<Grupo[]>(() =>
    (
      [
        ['essencial', 'Essencial'],
        ['nao_essencial', 'Não essencial'],
      ] as const
    ).map(([priority, titulo]) => {
      const itens = this.itens()
        .filter((item) => item.priority === priority)
        .sort((a, b) => b.percentual - a.percentual);
      return { priority, titulo, itens, max: itens[0]?.percentual || 1 };
    }),
  );

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
