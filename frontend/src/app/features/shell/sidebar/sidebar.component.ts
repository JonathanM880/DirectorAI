import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, Router } from '@angular/router';
import { AngularAuthService } from '../../../core/services/auth.service';

interface NavItem {
  path: string;
  label: string;
  iconPath: string;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  template: `
    <div class="sidebar">
      <div class="sidebar-header">
        <h2>DirectorAI</h2>
      </div>
      <nav class="sidebar-nav">
        <a
          *ngFor="let item of navItems"
          [routerLink]="item.path"
          routerLinkActive="active"
          class="nav-item"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="icon">
            <path [attr.d]="item.iconPath" />
            <circle *ngIf="item.label === 'Settings'" cx="12" cy="12" r="3"></circle>
          </svg>
          <span class="label">{{ item.label }}</span>
        </a>
      </nav>
      <div class="sidebar-footer">
        <button class="logout-btn" (click)="onLogout()">Logout</button>
      </div>
    </div>
  `,
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {
  navItems: NavItem[] = [
    { path: '/app/dashboard', label: 'Dashboard', iconPath: 'M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z' }, // grid layout
    { path: '/app/studio', label: 'AI Studio', iconPath: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z M12 22V12 M12 12 3.5 7 M12 12l8.5-5' }, // hexagon/box
    { path: '/app/assets', label: 'Assets', iconPath: 'M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-1.22-1.8A2 2 0 0 0 7.53 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z' }, // folder
    { path: '/app/calendar', label: 'Calendar', iconPath: 'M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z' }, // calendar
    { path: '/app/metrics', label: 'Metrics', iconPath: 'M22 12h-4l-3 9L9 3l-3 9H2' }, // activity line
    { path: '/app/automation', label: 'Automation', iconPath: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z' }, // zap
    { path: '/app/settings', label: 'Settings', iconPath: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1Z' }, // settings gear
  ];

  constructor(private authService: AngularAuthService, private router: Router) {}

  async onLogout() {
    await this.authService.signOut();
    this.router.navigate(['/auth/login']);
  }
}
