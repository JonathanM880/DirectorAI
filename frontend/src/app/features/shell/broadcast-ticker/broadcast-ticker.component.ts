import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

interface TickerItem {
  id: string;
  title: string;
  platform: string;
  timestamp: Date;
}

@Component({
  selector: 'app-broadcast-ticker',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="ticker" (mouseenter)="isPaused.set(true)" (mouseleave)="isPaused.set(false)">
      <div class="ticker-track" [class.paused]="isPaused()">
        <span class="ticker-item" *ngFor="let item of tickerItems(); let i = index">
          <span class="platform">{{ item.platform }}</span>
          <span class="title">{{ item.title }}</span>
          <span class="timestamp">{{ item.timestamp | date:'short' }}</span>
          @if (i < tickerItems().length - 1) {
            <span class="separator">•</span>
          }
        </span>
        <!-- Duplicate for infinite scroll -->
        <span class="ticker-item" *ngFor="let item of tickerItems(); let i = index">
          <span class="platform">{{ item.platform }}</span>
          <span class="title">{{ item.title }}</span>
          <span class="timestamp">{{ item.timestamp | date:'short' }}</span>
          @if (i < tickerItems().length - 1) {
            <span class="separator">•</span>
          }
        </span>
      </div>
    </div>
  `,
  styleUrl: './broadcast-ticker.component.scss'
})
export class BroadcastTickerComponent {
  isPaused = signal(false);
  tickerItems = signal<TickerItem[]>([
    {
      id: '1',
      title: 'Summer Sale Announcement',
      platform: 'Telegram',
      timestamp: new Date(Date.now() - 3600000)
    },
    {
      id: '2',
      title: 'New Product Launch',
      platform: 'Telegram',
      timestamp: new Date(Date.now() - 7200000)
    },
    {
      id: '3',
      title: 'Weekly Newsletter',
      platform: 'Telegram',
      timestamp: new Date(Date.now() - 10800000)
    }
  ]);
}
