/**
 * interfaceOptions do ion-select de categoria (Adicionar/Editar gasto): o popover abre logo abaixo
 * do campo, alinhado pela borda direita. A largura (≈ a do campo) vem do CSS em global.scss
 * (ion-popover.category-select-popover) -- size: 'cover' não serve aqui, porque mede só a área do
 * valor selecionado (à direita do rótulo "Item"), não o campo inteiro, e cortava os nomes.
 */
export const CATEGORY_SELECT_POPOVER_OPTIONS = {
  cssClass: 'category-select-popover',
  side: 'bottom',
  alignment: 'end',
} as const;
