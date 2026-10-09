import { Routes } from '@angular/router';

import { authGuard, masterGuard, moduleGuard, passwordChangeGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'trocar-senha',
    canActivate: [passwordChangeGuard],
    loadComponent: () => import('./pages/trocar-senha/trocar-senha.page').then((m) => m.TrocarSenhaPage),
  },
  {
    path: 'servidor-indisponivel',
    loadComponent: () =>
      import('./pages/servidor-indisponivel/servidor-indisponivel.page').then((m) => m.ServidorIndisponivelPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/main-layout.component').then((m) => m.MainLayoutComponent),
    children: [
      {
        path: 'home',
        loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
      },
      {
        path: 'dados',
        loadComponent: () => import('./pages/dados/dados.page').then((m) => m.DadosPage),
      },
      {
        path: 'veiculos',
        canActivate: [moduleGuard],
        data: { module: 'veiculos' },
        loadComponent: () => import('./pages/veiculos/veiculos.page').then((m) => m.VeiculosPage),
      },
      {
        path: 'empresa',
        canActivate: [moduleGuard],
        data: { module: 'empresa' },
        loadComponent: () => import('./pages/empresa/empresa.page').then((m) => m.EmpresaPage),
      },
      {
        path: 'ferramentas',
        canActivate: [moduleGuard],
        data: { module: 'ferramentas' },
        loadComponent: () => import('./pages/ferramentas/ferramentas.page').then((m) => m.FerramentasPage),
      },
      {
        path: 'exportar-dados',
        canActivate: [moduleGuard],
        data: { module: 'exportar_dados' },
        loadComponent: () => import('./pages/exportar-dados/exportar-dados.page').then((m) => m.ExportarDadosPage),
      },
      {
        path: 'admin',
        canActivate: [masterGuard],
        loadComponent: () => import('./pages/admin/admin.page').then((m) => m.AdminPage),
      },
      {
        path: '',
        redirectTo: 'home',
        pathMatch: 'full',
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'home',
  },
];
