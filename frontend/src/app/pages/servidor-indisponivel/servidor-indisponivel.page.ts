import { Component, signal } from '@angular/core';
import { Router } from '@angular/router';
import { IonButton, IonContent } from '@ionic/angular';

@Component({
  selector: 'app-servidor-indisponivel',
  templateUrl: './servidor-indisponivel.page.html',
  styleUrls: ['./servidor-indisponivel.page.scss'],
  imports: [IonContent, IonButton],
})
export class ServidorIndisponivelPage {
  readonly retrying = signal(false);

  constructor(private readonly router: Router) {}

  tentarNovamente(): void {
    this.retrying.set(true);
    this.router.navigateByUrl('/home').finally(() => this.retrying.set(false));
  }
}
