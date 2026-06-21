import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { BroadcastTickerComponent } from '../broadcast-ticker/broadcast-ticker.component';
import { NotificationBellComponent } from '../notification-bell/notification-bell.component';

@Component({
  selector: 'app-app-shell',
  standalone: true,
  imports: [
    CommonModule,
    RouterOutlet,
    SidebarComponent,
    BroadcastTickerComponent,
    NotificationBellComponent
  ],
  template: `
    <div class="app-shell">
      <app-sidebar class="sidebar"></app-sidebar>
      <div class="main-content">
        <header class="header">
          <div class="header-left">
            <h1>DirectorAI</h1>
          </div>
          <div class="header-right">
            <app-notification-bell></app-notification-bell>
          </div>
        </header>
        <main class="content">
          <router-outlet></router-outlet>
        </main>
        <app-broadcast-ticker class="ticker"></app-broadcast-ticker>
      </div>
    </div>
  `,
  styleUrl: './app-shell.component.scss'
})
export class AppShellComponent {

}
