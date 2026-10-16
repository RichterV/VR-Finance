import { AfterViewInit, Component, EventEmitter, Input, Output, ViewChild, inject, signal } from '@angular/core';
import { IonButton, IonIcon, IonInput, IonItem } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { close } from 'ionicons/icons';

import { DropdownOption, DropdownOptionsService, Priority } from '../services/dropdown-options.service';
import { httpErrorMessage } from './http-error';

/**
 * Valor da última opção do select de categoria ("+ Nova categoria") em Adicionar/Editar gasto.
 * Escolher ela não seleciona nada: troca o campo por este componente.
 */
export const NEW_CATEGORY_OPTION = -1;

const PRIORITY_LABEL: Record<Priority, string> = {
  essencial: 'Essencial',
  nao_essencial: 'Não essencial',
};

/** Por nome, respeitando acentos -- o ORDER BY do SQLite punha "Água" depois de "Supermercado". */
export function sortByName(items: DropdownOption[]): DropdownOption[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
}

export function insertSorted(items: DropdownOption[], option: DropdownOption): DropdownOption[] {
  return sortByName([...items.filter((i) => i.id !== option.id), option]);
}

export function findByName(items: DropdownOption[], name: string): DropdownOption | undefined {
  const alvo = name.trim().toLocaleLowerCase('pt-BR');
  return items.find((i) => i.name.trim().toLocaleLowerCase('pt-BR') === alvo);
}

/**
 * Cria uma categoria sem sair do gasto: ocupa o lugar do select "Item" até criar ou cancelar.
 * A categoria entra na prioridade da aba atual. Nome que já existe na lista só é selecionado.
 */
@Component({
  selector: 'app-category-quick-add',
  imports: [IonItem, IonInput, IonButton, IonIcon],
  template: `
    <ion-item class="category-quick-add">
      <ion-input
        #input
        label="Nova categoria"
        labelPlacement="stacked"
        placeholder="Nome da categoria"
        autocapitalize="sentences"
        enterkeyhint="done"
        maxlength="60"
        [value]="name()"
        (ionInput)="onInput($any($event.detail.value))"
        (keydown.enter)="$event.preventDefault(); create()"
        (keydown.escape)="$event.preventDefault(); $event.stopPropagation(); cancelled.emit()"
      ></ion-input>
      <ion-button slot="end" fill="clear" class="quick-add-create" [disabled]="saving()" (click)="create()">
        {{ saving() ? 'Criando...' : 'Criar' }}
      </ion-button>
      <ion-button
        slot="end"
        fill="clear"
        color="medium"
        class="quick-add-cancel"
        aria-label="Cancelar nova categoria"
        title="Cancelar"
        [disabled]="saving()"
        (click)="cancelled.emit()"
      >
        <ion-icon slot="icon-only" name="close"></ion-icon>
      </ion-button>
    </ion-item>
    @if (error(); as message) {
      <p class="quick-add-hint error" role="alert">{{ message }}</p>
    } @else {
      <p class="quick-add-hint">Entra em {{ priorityLabel }}. Renomear ou excluir: em Categorias.</p>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    /* O Ionic encolhe botão dentro de ion-item; aqui eles são as ações do campo. */
    .quick-add-create,
    .quick-add-cancel {
      height: 40px;
      margin: 0;
      font-size: var(--fs-sm);
    }
    .quick-add-create {
      --padding-start: 12px;
      --padding-end: 12px;
      font-weight: 600;
    }
    .quick-add-cancel {
      --padding-start: 8px;
      --padding-end: 8px;
    }
    .quick-add-cancel ion-icon {
      font-size: 20px;
    }
    .quick-add-hint {
      margin: 4px 4px 12px;
      font-size: var(--fs-xs);
      color: var(--app-text-secondary);
    }
    .quick-add-hint.error {
      color: var(--app-negative);
    }
  `,
})
export class CategoryQuickAddComponent implements AfterViewInit {
  @Input({ required: true }) priority!: Priority;
  /** Categorias já carregadas da prioridade -- evita criar um nome repetido. */
  @Input() existing: DropdownOption[] = [];
  @Output() readonly created = new EventEmitter<DropdownOption>();
  @Output() readonly cancelled = new EventEmitter<void>();
  @ViewChild('input') private input?: IonInput;

  private readonly service = inject(DropdownOptionsService);

  readonly name = signal('');
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  constructor() {
    addIcons({ close });
  }

  get priorityLabel(): string {
    return PRIORITY_LABEL[this.priority];
  }

  ngAfterViewInit(): void {
    // O select acabou de fechar o popover; foca depois que ele devolve o foco pro campo.
    setTimeout(() => void this.input?.setFocus(), 150);
  }

  onInput(value: string | null): void {
    this.name.set(value ?? '');
    this.error.set(null);
  }

  create(): void {
    if (this.saving()) return;
    const name = this.name().trim();
    if (!name) {
      this.error.set('Digite o nome da categoria.');
      return;
    }
    const existente = findByName(this.existing, name);
    if (existente) {
      this.created.emit(existente);
      return;
    }
    this.saving.set(true);
    this.service.create(this.priority, name).subscribe({
      next: (option) => {
        this.saving.set(false);
        this.created.emit(option);
      },
      error: (err: unknown) => {
        this.saving.set(false);
        this.error.set(httpErrorMessage(err, 'Não foi possível criar a categoria.'));
      },
    });
  }
}
