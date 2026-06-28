import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AuthNavbarComponent } from './auth-navbar/auth-navbar.component';

@Component({
  selector: 'app-auth-shell',
  standalone: true,
  imports: [RouterOutlet, AuthNavbarComponent],
  template: `
    <div class="auth-shell">
      <app-auth-navbar></app-auth-navbar>
      <main class="auth-content">
        <router-outlet></router-outlet>
      </main>
    </div>
  `
})
export class AuthShellComponent {}
