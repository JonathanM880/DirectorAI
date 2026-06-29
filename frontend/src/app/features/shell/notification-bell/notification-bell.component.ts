import { Component, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../../core/services/notification.service';

@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="notification-bell" (click)="toggleDropdown()">
      <button class="bell-btn">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="bell-icon">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/>
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>
        </svg>
        @if (unreadCount() > 0) {
          <span class="badge">{{ unreadCount() }}</span>
        }
      </button>

      @if (isDropdownOpen()) {
        <div class="dropdown" (click)="$event.stopPropagation()">
          <div class="dropdown-header">
            <h3>Notifications</h3>
            <button class="mark-all-btn" (click)="markAllAsRead()">Mark all as read</button>
          </div>
          <div class="dropdown-list">
            @for (notification of notificationService.notifications(); track notification.id) {
              <div class="notification-item" [class.unread]="!notification.read">
                <div class="notification-content">
                  <div class="notification-title">{{ notification.title }}</div>
                  <div class="notification-message">{{ notification.message }}</div>
                  <div class="notification-time">{{ notification.timestamp | date:'short' }}</div>
                </div>
              </div>
            } @empty {
              <div class="empty-state">No notifications</div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styleUrl: './notification-bell.component.scss'
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
