/** Limites e passo do zoom da pré-visualização de anexo (botões de lupa na web, pinça no app). */
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;
export const ZOOM_STEP = 0.5;

export function clampZoom(value: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

/** Distância euclidiana entre dois pontos de toque -- usada pra medir o gesto de pinça. */
export function touchDistance(a: { clientX: number; clientY: number }, b: { clientX: number; clientY: number }): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/** Ponto médio entre dois toques -- foco da pinça (o ponto que deve ficar parado sob os dedos). */
export function touchMidpoint(a: { clientX: number; clientY: number }, b: { clientX: number; clientY: number }): { clientX: number; clientY: number } {
  return { clientX: (a.clientX + b.clientX) / 2, clientY: (a.clientY + b.clientY) / 2 };
}

export interface ScrollBox {
  scrollLeft: number;
  scrollTop: number;
  scrollWidth: number;
  scrollHeight: number;
}

/**
 * Novo scroll do contêiner depois de uma mudança de zoom, pra que o ponto do conteúdo que estava
 * sob `focal` (coordenada relativa ao canto visível do contêiner) continue sob ele -- sem isso o
 * zoom sempre "pula" pro canto superior esquerdo e o usuário perde o trecho que estava lendo.
 * Trabalha com a fração do tamanho rolável (não com o fator de zoom) porque em zoom 1 a imagem é
 * ajustada por `max-height`/`max-width`, então o tamanho real não é proporcional ao fator.
 */
export function focalZoomScroll(
  before: ScrollBox,
  after: { scrollWidth: number; scrollHeight: number },
  focal: { x: number; y: number },
): { left: number; top: number } {
  const fracX = (before.scrollLeft + focal.x) / before.scrollWidth;
  const fracY = (before.scrollTop + focal.y) / before.scrollHeight;
  return {
    left: Math.max(0, fracX * after.scrollWidth - focal.x),
    top: Math.max(0, fracY * after.scrollHeight - focal.y),
  };
}

/**
 * Heurística pra separar a roda de um mouse dos dois dedos no trackpad, que o navegador entrega
 * como o mesmo evento `wheel`. Roda de mouse: modo "linha" (Firefox) ou degraus grandes e
 * inteiros só no eixo Y (Chrome: ~100/120 por clique). Trackpad: deltas pequenos, fracionados
 * e/ou com componente horizontal. Pode errar em mouse de rolagem suave (sem degraus) -- nesse
 * caso a roda só rola, sem zoom, que é o comportamento de antes.
 */
export function isLikelyMouseWheel(event: Pick<WheelEvent, 'deltaMode' | 'deltaX' | 'deltaY'>): boolean {
  if (event.deltaMode !== 0) return true;
  return event.deltaX === 0 && Number.isInteger(event.deltaY) && Math.abs(event.deltaY) >= 50;
}
