import { Component } from '@angular/core';
import { IonApp, IonRouterOutlet } from '@ionic/angular';

import { AppLockOverlayComponent } from './shared/app-lock-overlay.component';

@Component({
  selector: 'app-root',
  templateUrl: 'app.component.html',
  imports: [IonApp, IonRouterOutlet, AppLockOverlayComponent],
})
export class AppComponent {
  constructor() {}
}
