import { Component, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../../core/services/notification.service';

@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="relative" (click)="toggleDropdown()">
      <button class="relative p-2 border-none rounded-md bg-white/5 hover:bg-white/10 text-foreground text-xl transition-colors cursor-pointer">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
        </svg>
        @if (unreadCount() > 0) {
          <span class="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 rounded-full bg-destructive text-white text-xs font-bold leading-5 text-center">{{ unreadCount() }}</span>
        }
      </button>

      @if (isDropdownOpen()) {
        <div class="absolute top-[calc(100%+0.5rem)] right-0 w-[380px] max-h-[480px] rounded-lg bg-background border border-border shadow-2xl z-[999999] overflow-hidden flex flex-col" (click)="$event.stopPropagation()">
          <div class="flex justify-between items-center px-5 py-4 border-b border-border">
            <h3 class="m-0 text-base font-semibold text-foreground">Notificaciones</h3>
            <button class="border-none bg-transparent text-primary text-sm font-medium cursor-pointer hover:underline" (click)="markAllAsRead()">Marcar todo como leído</button>
          </div>
          <div class="flex-1 overflow-y-auto">
            @for (notification of notificationService.notifications(); track notification.id) {
              <div class="px-5 py-4 border-b border-border cursor-pointer transition-colors hover:bg-white/5" [class.bg-yellow-500]="!notification.read" [style.background-opacity]="!notification.read ? '0.05' : '1'">
                <div>
                  <div class="text-[0.9375rem] font-semibold text-foreground mb-1">{{ notification.title }}</div>
                  <div class="text-sm text-muted-foreground mb-2">{{ notification.message }}</div>
                  <div class="text-xs text-muted-foreground/70">{{ notification.timestamp | date:'short' }}</div>
                </div>
              </div>
            } @empty {
              <div class="p-8 text-center text-muted-foreground">No hay notificaciones</div>
            }
          </div>
        </div>
      }
    </div>
  `
})
export class NotificationBellComponent {
  notificationService = inject(NotificationService);
  isDropdownOpen = signal(false);

  unreadCount = computed(() => this.notificationService.notifications().filter(n => !n.read).length);

  toggleDropdown() {
    this.isDropdownOpen.set(!this.isDropdownOpen());
  }

  markAllAsRead() {
    this.notificationService.markAllAsRead();
  }
}
