import { Routes } from '@angular/router';
import { authGuard, auditorGuard, clientGuard } from '@core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
  {
    path: 'login',
    loadComponent: () => import('./features/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'auditor',
    canActivate: [auditorGuard],
    children: [
      {
        path: '',
        redirectTo: 'clients',
        pathMatch: 'full',
      },
      {
        path: 'clients',
        loadComponent: () =>
          import('./features/auditor/client-select/client-select.component').then((m) => m.ClientSelectComponent),
      },
      {
        path: 'pbc',
        loadComponent: () =>
          import('./features/auditor/pbc-workspace/pbc-workspace.component').then((m) => m.PbcWorkspaceComponent),
      },
      {
        path: 'pbc-editor',
        loadComponent: () =>
          import('./features/auditor/pbc-editor/pbc-editor.component').then((m) => m.PbcEditorComponent),
      },
      {
        path: 'trial-balance',
        loadComponent: () =>
          import('./features/auditor/trial-balance/trial-balance.component').then((m) => m.TrialBalanceComponent),
      },
    ],
  },
  {
    path: 'client',
    canActivate: [clientGuard],
    children: [
      {
        path: '',
        redirectTo: 'portal',
        pathMatch: 'full',
      },
      {
        path: 'portal',
        loadComponent: () =>
          import('./features/client/portal/portal.component').then((m) => m.PortalComponent),
      },
      {
        path: 'pbc-items',
        loadComponent: () =>
          import('./features/client/pbc-items/pbc-items.component').then((m) => m.PbcItemsComponent),
      },
      {
        path: 'pbc-item-detail',
        loadComponent: () =>
          import('./features/client/pbc-item-detail/pbc-item-detail.component').then((m) => m.PbcItemDetailComponent),
      },
    ],
  },
  {
    path: '**',
    redirectTo: 'login',
  },
];
