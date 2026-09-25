import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login').then((m) => m.LoginPage),
  },
  {
    // Sin sesion y sin guardia de invitado: se llega aqui justamente cuando no se puede
    // entrar, pero tambien desde una sesion abierta en otra pestana.
    path: 'forgot-password',
    loadComponent: () =>
      import('./pages/forgot-password/forgot-password').then((m) => m.ForgotPasswordPage),
  },
  {
    path: 'reset-password',
    loadComponent: () =>
      import('./pages/reset-password/reset-password').then((m) => m.ResetPasswordPage),
  },
  {
    // Las dos confirmaciones son la misma pantalla con otras frases, y por eso se separan
    // aqui y no en dos componentes: lo unico que cambia es el enlace que consumen.
    path: 'verify-email',
    data: { kind: 'verify' },
    loadComponent: () => import('./pages/confirm-link/confirm-link').then((m) => m.ConfirmLinkPage),
  },
  {
    path: 'change-email',
    data: { kind: 'change' },
    loadComponent: () => import('./pages/confirm-link/confirm-link').then((m) => m.ConfirmLinkPage),
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
  // Categorías y tags viven ahora en la configuración. Las direcciones de antes siguen
  // llevando a su sitio: puede haber enlaces guardados o una pestaña abierta con ellas.
  { path: 'categories', redirectTo: '/account/categories' },
  { path: 'tags', redirectTo: '/account/tags' },
  // La redirección de la raíz va antes que el marco de catálogos: aquel no tiene segmento
  // propio, así que la URL vacía también le encaja y dejaba la pantalla sin ninguna de las
  // dos listas dentro.
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    // El plan del mes. Ruta sin segmento propio: las dos pantallas conservan sus direcciones
    // y solo comparten el marco, que es lo que mantiene vivo el conmutador al saltar.
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/catalogues/catalogues').then((m) => m.CataloguesPage),
    children: [
      {
        path: 'budgets',
        loadComponent: () => import('./pages/budgets/budgets').then((m) => m.BudgetsPage),
      },
      {
        // Los fijos son la otra mitad del plan: el presupuesto dice cuánto se piensa
        // gastar y el fijo dice qué parte de eso ya tiene dueño antes de empezar el mes.
        path: 'recurring',
        loadComponent: () => import('./pages/recurring/recurring').then((m) => m.RecurringPage),
      },
    ],
  },
  {
    path: 'account',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/account/account').then((m) => m.AccountPage),
    // Sin hija vacía a propósito: en `/account` solo se ve el menú, que en el teléfono es la
    // pantalla entera y en escritorio lleva a los datos por su cuenta.
    children: [
      {
        path: 'profile',
        loadComponent: () =>
          import('./pages/account/profile/profile').then((m) => m.AccountProfilePage),
      },
      {
        path: 'notifications',
        loadComponent: () =>
          import('./pages/account/notifications/notifications').then(
            (m) => m.AccountNotificationsPage,
          ),
      },
      {
        path: 'security',
        loadComponent: () =>
          import('./pages/account/security/security').then((m) => m.AccountSecurityPage),
      },
      {
        path: 'categories',
        loadComponent: () => import('./pages/categories/categories').then((m) => m.CategoriesPage),
      },
      {
        path: 'tags',
        loadComponent: () => import('./pages/tags/tags').then((m) => m.TagsPage),
      },
      {
        path: 'appearance',
        loadComponent: () =>
          import('./pages/account/appearance/appearance').then((m) => m.AccountAppearancePage),
      },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
