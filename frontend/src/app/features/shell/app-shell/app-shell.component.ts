import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { NotificationBellComponent } from '../notification-bell/notification-bell.component';

@Component({
  selector: 'app-app-shell',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    SidebarComponent,
    NotificationBellComponent
  ],
  template: `
    <div class="app-shell">
      <app-sidebar class="sidebar"></app-sidebar>
      <div class="main-content">
        <header class="header">
          <div class="header-left">
            <!-- Breadcrumbs or page title could go here -->
          </div>
          <div class="header-right">
            <app-notification-bell></app-notification-bell>
          </div>
        </header>
        <main class="content">
          <router-outlet></router-outlet>
        </main>
      </div>
    </div>
  `,
  styleUrl: './app-shell.component.scss'
})
export class AppShellComponent {

}
