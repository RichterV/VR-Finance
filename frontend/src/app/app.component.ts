import { Component, inject } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';

import { ThemeService } from './core/theme.service';
import { AppLockOverlayComponent } from './shared/app-lock-overlay.component';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet, AppLockOverlayComponent],
})
export class AppComponent {
  // Instanciado já na abertura: aplica o tema e passa a seguir o do usuário logado.
  private readonly theme = inject(ThemeService);
}
