import { Component, input } from '@angular/core';
import { IonSkeletonText } from '@ionic/angular';

/** Esqueleto de carregamento de uma seção da Home, no formato do conteúdo que vai aparecer. */
@Component({
  selector: 'app-section-skeleton',
  imports: [IonSkeletonText],
  template: `
    <div class="skeleton" aria-busy="true" aria-label="Carregando">
      @if (cards() > 0) {
        <div class="sk-grid">
          @for (i of range(cards()); track i) {
            <div class="sk-card">
              <ion-skeleton-text [animated]="true" class="sk-label"></ion-skeleton-text>
              <ion-skeleton-text [animated]="true" class="sk-value"></ion-skeleton-text>
            </div>
          }
        </div>
      }
      @if (charts() > 0) {
        <div class="sk-charts" [class.single]="charts() === 1">
          @for (i of range(charts()); track i) {
            <div class="sk-card sk-chart">
              <ion-skeleton-text [animated]="true" class="sk-label"></ion-skeleton-text>
              <ion-skeleton-text [animated]="true" class="sk-area"></ion-skeleton-text>
            </div>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      .skeleton {
        display: flex;
        flex-direction: column;
        gap: 20px;
      }
      .sk-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 20px;
      }
      .sk-charts {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 20px;
      }
      .sk-charts.single {
        grid-template-columns: 1fr;
      }
      @media (max-width: 900px) {
        .sk-charts {
          grid-template-columns: 1fr;
        }
      }
      .sk-card {
        background: var(--app-surface-glass);
        border: 1px solid var(--app-surface-border);
        border-radius: 16px;
        padding: 22px 24px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      ion-skeleton-text {
        --background: rgba(148, 163, 184, 0.12);
        --background-rgb: 148, 163, 184;
        margin: 0;
        border-radius: 6px;
      }
      .sk-label {
        width: 45%;
        height: 12px;
      }
      .sk-value {
        width: 70%;
        height: 24px;
      }
      .sk-area {
        width: 100%;
        height: 200px;
      }
    `,
  ],
})
export class SectionSkeletonComponent {
  readonly cards = input(0);
  readonly charts = input(0);

  range(n: number): number[] {
    return Array.from({ length: n }, (_, i) => i);
  }
}
