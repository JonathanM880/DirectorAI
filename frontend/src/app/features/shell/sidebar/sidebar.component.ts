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
  styleUrl: './sidebar.component.scss'
})
export class SidebarComponent {
  navItems: NavItem[] = [
    { path: '/dashboard', label: 'Dashboard', icon: '📊' },
    { path: '/studio', label: 'AI Studio', icon: '🤖' },
    { path: '/assets', label: 'Assets', icon: '📁' },
    { path: '/calendar', label: 'Calendar', icon: '📅' },
    { path: '/metrics', label: 'Metrics', icon: '📈' },
    { path: '/automation', label: 'Automation', icon: '⚙️' },
    { path: '/settings', label: 'Settings', icon: '🔧' }
  ];
}
