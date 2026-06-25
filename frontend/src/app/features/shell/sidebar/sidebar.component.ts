import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';

interface NavItem {
  path: string;
  label: string;
  icon: string;
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
          <span class="icon">{{ item.icon }}</span>
          <span class="label">{{ item.label }}</span>
        </a>
      </nav>
      <div class="sidebar-footer">
        <span class="plan-badge">Starter Plan</span>
      </div>
    </div>
  `,
  styleUrl: './sidebar.component.scss',
})
export class SidebarComponent {
  navItems: NavItem[] = [
    { path: '/app/dashboard', label: 'Dashboard', icon: '📊' },
    { path: '/app/studio', label: 'AI Studio', icon: '🤖' },
    { path: '/app/assets', label: 'Assets', icon: '📁' },
    { path: '/app/calendar', label: 'Calendar', icon: '📅' },
    { path: '/app/metrics', label: 'Metrics', icon: '📈' },
    { path: '/app/automation', label: 'Automation', icon: '⚙️' },
    { path: '/app/settings', label: 'Settings', icon: '🔧' },
  ];
}
