import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/dashboard/dashboard').then((m) => m.DashboardPage),
  },
  {
    path: 'transactions',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./pages/transactions/transactions').then((m) => m.TransactionsPage),
  },
  // La redirección de la raíz va antes que el marco de catálogos: aquel no tiene segmento
  // propio, así que la URL vacía también le encaja y dejaba la pantalla sin ninguna de las
  // dos listas dentro.
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    // Ruta sin segmento propio: las dos pantallas conservan sus direcciones y solo comparten
    // el marco, que es lo que mantiene vivo el conmutador al saltar de una a otra.
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/catalogues/catalogues').then((m) => m.CataloguesPage),
    children: [
      {
        path: 'categories',
        loadComponent: () => import('./pages/categories/categories').then((m) => m.CategoriesPage),
      },
      {
        path: 'tags',
        loadComponent: () => import('./pages/tags/tags').then((m) => m.TagsPage),
      },
    ],
  },
  {
    path: 'account',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/account/account').then((m) => m.AccountPage),
  },
  { path: '**', redirectTo: 'dashboard' },
];
