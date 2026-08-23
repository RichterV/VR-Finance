import { createAnimation } from '@ionic/angular';
import type { AnimationBuilder } from '@ionic/angular';

export const SIDE_MODAL_CSS_CLASS = 'side-modal';

export const slideInFromRight: AnimationBuilder = (baseEl: HTMLElement) => {
  const root = baseEl.shadowRoot ?? baseEl;
  const backdropEl = root.querySelector('ion-backdrop');
  const wrapperEl = root.querySelector('.modal-wrapper');

  const backdrop = createAnimation()
    .addElement(backdropEl!)
    .fromTo('opacity', '0.01', 'var(--backdrop-opacity)');

  const wrapper = createAnimation()
    .addElement(wrapperEl!)
    .fromTo('transform', 'translateX(100%)', 'translateX(0)')
    .fromTo('opacity', '0.01', '1');

  return createAnimation()
    .addElement(baseEl)
    .easing('cubic-bezier(0.32, 0.72, 0, 1)')
    .duration(280)
    .addAnimation([backdrop, wrapper]);
};

export const slideOutToRight: AnimationBuilder = (baseEl: HTMLElement) => {
  const root = baseEl.shadowRoot ?? baseEl;
  const backdropEl = root.querySelector('ion-backdrop');
  const wrapperEl = root.querySelector('.modal-wrapper');

  const backdrop = createAnimation()
    .addElement(backdropEl!)
    .fromTo('opacity', 'var(--backdrop-opacity)', '0.01');

  const wrapper = createAnimation()
    .addElement(wrapperEl!)
    .fromTo('transform', 'translateX(0)', 'translateX(100%)')
    .fromTo('opacity', '1', '0.01');

  return createAnimation()
    .addElement(baseEl)
    .easing('cubic-bezier(0.32, 0.72, 0, 1)')
    .duration(200)
    .addAnimation([backdrop, wrapper]);
};

/** Side-docked modal only makes sense with room to spare on the side — matches the desktop shell breakpoint. */
export function isDesktopViewport(): boolean {
  return window.innerWidth >= 992;
}
