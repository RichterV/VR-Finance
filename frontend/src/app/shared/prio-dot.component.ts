import { Component, input } from '@angular/core';

import { Priority } from '../services/dropdown-options.service';

/**
 * Bolinha de prioridade (verde = essencial, âmbar = não essencial) com nome acessível -- antes o
 * significado era só a cor, invisível pra leitor de tela.
 */
@Component({
  selector: 'app-prio-dot',
  template: `<span
    class="prio-dot"
    [class.essencial]="priority() === 'essencial'"
    role="img"
    [attr.aria-label]="priority() === 'essencial' ? 'Essencial' : 'Não essencial'"
    [title]="priority() === 'essencial' ? 'Essencial' : 'Não essencial'"
  ></span>`,
  styles: [':host { display: inline-flex; flex-shrink: 0; }'],
})
export class PrioDotComponent {
  readonly priority = input.required<Priority>();
}
