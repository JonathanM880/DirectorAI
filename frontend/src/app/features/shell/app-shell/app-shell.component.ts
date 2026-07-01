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
    <div class="flex h-screen bg-[radial-gradient(circle_at_0%_0%,#232733_0%,var(--color-ink)_40%,#0d0c10_100%)]">
      <app-sidebar class="w-[260px] shrink-0"></app-sidebar>
      <div class="flex-1 flex flex-col overflow-hidden">
        <header class="relative z-50 flex items-center justify-between px-6 py-4 border-b border-white/5 bg-[#2a2d35]/40 backdrop-blur-md">
          <div class="header-left">
            <!-- Breadcrumbs or page title could go here -->
          </div>
          <div class="header-right">
            <app-notification-bell></app-notification-bell>
          </div>
        </header>
        <main class="flex-1 overflow-y-auto">
          <router-outlet></router-outlet>
        </main>
      </div>
    </div>
  `
})
export class AppShellComponent {

}
