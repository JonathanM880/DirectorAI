import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PostStatus } from '@director-ai/types';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="status-badge" [class]="statusClass">
      {{ status | titlecase }}
    </span>
  `,
  styleUrl: './status-badge.component.scss'
})
export class StatusBadgeComponent {
  @Input({ required: true }) status!: PostStatus;

  get statusClass(): string {
    switch (this.status) {
      case 'published':
        return 'published';
      case 'scheduled':
        return 'scheduled';
      case 'failed':
        return 'failed';
      case 'retrying':
        return 'retrying';
      case 'publishing':
        return 'publishing';
      case 'cancelled':
        return 'cancelled';
      default:
        return 'draft';
    }
  }
}
