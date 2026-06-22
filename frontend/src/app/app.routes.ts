import { Routes } from '@angular/router';
import { AuthGuard } from './core/guards/auth.guard';
import { FeatureGateGuard } from './core/guards/feature-gate.guard';

export const routes: Routes = [
  // Auth routes (public)
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then(m => m.authRoutes)
  },
  // Authenticated routes (protected by AuthGuard)
  {
    path: '',
    canActivate: [AuthGuard],
    loadChildren: () => import('./features/shell/shell.routes').then(m => m.shellRoutes)
  },
  // Fallback
  { path: '**', redirectTo: '', pathMatch: 'full' }
];
