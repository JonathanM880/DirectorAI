import { Routes } from '@angular/router';
import { AppShellComponent } from './app-shell/app-shell.component';
import { AuthGuard } from '../../core/guards/auth.guard';
import { FeatureGateGuard } from '../../core/guards/feature-gate.guard';

export const shellRoutes: Routes = [
  {
    path: '',
    component: AppShellComponent,
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () => import('../dashboard/dashboard.component').then(m => m.DashboardComponent)
      },
      {
        path: 'studio',
        canActivate: [FeatureGateGuard],
        data: { feature: 'ai_generation' },
        loadComponent: () => import('../studio/studio.component').then(m => m.StudioComponent)
      },
      {
        path: 'assets',
        loadComponent: () => import('../assets/assets.component').then(m => m.AssetsComponent)
      },
      {
        path: 'calendar',
        loadComponent: () => import('../calendar/calendar.component').then(m => m.CalendarComponent)
      },
      {
        path: 'metrics',
        // AuthGuard runs first as a backstop; FeatureGateGuard checks plan access second.
        canActivate: [AuthGuard, FeatureGateGuard],
        data: { feature: 'analytics' },
        loadComponent: () => import('../metrics/metrics.component').then(m => m.MetricsComponent)
      },

      {
        path: 'automation',
        canActivate: [FeatureGateGuard],
        data: { feature: 'recurrence_rules' },
        loadComponent: () => import('../automation/automation.component').then(m => m.AutomationComponent)
      },
      {
        path: 'settings',
        loadComponent: () => import('../settings/settings.component').then(m => m.SettingsComponent)
      },
      { path: '**', redirectTo: 'dashboard' }
    ]
  }
];
