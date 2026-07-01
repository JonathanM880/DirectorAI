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
    <div class="flex flex-col h-full bg-[#2a2d35]/40 backdrop-blur-md border-r border-white/5">
      <div class="p-6 border-b border-white/5">
        <h2 class="m-0 text-xl font-bold tracking-wider text-primary">DirectorAI</h2>
      </div>
      <nav class="flex-1 p-4 flex flex-col gap-2">
        <a
          *ngFor="let item of navItems"
          [routerLink]="item.path"
          routerLinkActive="bg-[#e8c24a]/10 text-primary border-[#e8c24a]/20 shadow-[0_4px_12px_rgba(0,0,0,0.1),inset_0_0_8px_rgba(232,194,74,0.05)]"
          [routerLinkActiveOptions]="{exact: false}"
          class="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-300 font-medium transition-all border border-transparent hover:bg-white/5 hover:text-white hover:translate-x-1 group"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-lg transition-transform group-hover:scale-110">
            <path [attr.d]="item.iconPath" />
            <circle *ngIf="item.label === 'Settings'" cx="12" cy="12" r="3"></circle>
          </svg>
          <span>{{ item.label }}</span>
        </a>
      </nav>
      <div class="p-4 border-t border-white/5">
        <button class="inline-flex items-center justify-center w-full mt-3 px-4 py-2 rounded-lg bg-transparent border border-white/10 text-gray-300 text-sm font-medium cursor-pointer transition-all hover:bg-[#d94f3d]/10 hover:border-[#d94f3d]/30 hover:text-destructive" (click)="onLogout()">Logout</button>
      </div>
    </div>
  `
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
