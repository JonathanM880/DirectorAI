import { Routes } from '@angular/router';
import { AuthGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/landing/landing-page.component').then(m => m.LandingPageComponent)
  },
  {
    path: 'auth',
    loadChildren: () => import('./features/auth/auth.routes').then(m => m.authRoutes)
  },
  {
    path: 'app',
    canActivate: [AuthGuard],
    loadChildren: () => import('./features/shell/shell.routes').then(m => m.shellRoutes)
  },
  { path: '**', redirectTo: '', pathMatch: 'full' }
];
