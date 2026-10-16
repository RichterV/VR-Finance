import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideIonicAngular } from '@ionic/angular';

import { HomeRefreshService } from '../core/home-refresh.service';
import { HomePage } from './home.page';

describe('HomePage', () => {
  let component: HomePage;
  let fixture: ComponentFixture<HomePage>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideIonicAngular(), provideRouter([])] });
    fixture = TestBed.createComponent(HomePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('turns a burst of saved entries into a single reload', () => {
    vi.useFakeTimers();
    try {
      const refresh = TestBed.inject(HomeRefreshService);
      const antes = component.reloadToken();
      for (let i = 0; i < 5; i++) refresh.request();
      vi.advanceTimersByTime(1000);
      expect(component.reloadToken()).toBe(antes + 1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('only changes the cutoff when the checkbox is on', () => {
    expect(component.corte()).toEqual({ ateAno: component.anoMensal(), ateMes: component.mes() });
    component.toggleLimitarAteMesSelecionado();
    expect(component.corte()).toBeUndefined();
  });

  it('says up to when the sections are counting, only while the cutoff is on', () => {
    component.mes.set(10);
    component.anoMensal.set(2026);
    expect(component.corteSubtitulo()).toBe('(até outubro/2026)');
    expect(component.anualSubtitulo()).toBe('(2026, até outubro)');
    component.toggleLimitarAteMesSelecionado();
    expect(component.corteSubtitulo()).toBe('');
    expect(component.anualSubtitulo()).toBe('(2026)');
    expect(component.inflacaoSubtitulo()).toBe('(últimos 12 meses)');
  });
});
