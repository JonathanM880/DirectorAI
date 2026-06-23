import { Component, Output, EventEmitter, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SchedulingEngineService } from '../../services/scheduling-engine.service';
import { Channel, RecurrenceRule } from '@director-ai/types';

export interface PostFormData {
  text: string;
  channelId: string;
  scheduledAt: Date;
  recurrenceRule?: RecurrenceRule;
}

@Component({
  selector: 'app-post-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <form (ngSubmit)="submit()" class="post-form" id="post-form-inline">
      <div class="form-group">
        <label for="pf-content">Content</label>
        <textarea
          id="pf-content"
          name="text"
          [(ngModel)]="text"
          placeholder="Write your post content…"
          rows="4"
          required
        ></textarea>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label for="pf-channel">Channel</label>
          @if (loading()) {
            <span class="loading-text">Loading channels…</span>
          } @else if (channels().length === 0) {
            <span class="empty-text">No channels. Add one in Settings.</span>
          } @else {
            <select id="pf-channel" name="channel" [(ngModel)]="channelId" required>
              @for (ch of channels(); track ch.id) {
                <option [value]="ch.id">{{ platformIcon(ch.platform) }} {{ ch.name }}</option>
              }
            </select>
          }
        </div>

        <div class="form-group">
          <label for="pf-date">Schedule Date & Time</label>
          <input
            type="datetime-local"
            id="pf-date"
            name="scheduledAt"
            [(ngModel)]="scheduledAt"
            required
          />
        </div>
      </div>

      <div class="form-group">
        <label class="checkbox-label">
          <input
            type="checkbox"
            id="pf-recurrence"
            [(ngModel)]="enableRecurrence"
            name="enableRecurrence"
          />
          <span>Recurring post</span>
        </label>

        @if (enableRecurrence) {
          <div class="recurrence-row">
            <div class="form-group">
              <label for="pf-frequency">Frequency</label>
              <select id="pf-frequency" name="frequency" [(ngModel)]="frequency">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div class="form-group">
              <label for="pf-interval">Interval</label>
              <input type="number" id="pf-interval" name="interval"
                [(ngModel)]="interval" min="1" max="30" />
            </div>
            <div class="form-group">
              <label for="pf-end-date">End Date</label>
              <input type="date" id="pf-end-date" name="endDate"
                [(ngModel)]="endDate" />
            </div>
          </div>
        }
      </div>

      @if (error()) {
        <div class="form-error" role="alert">⚠️ {{ error() }}</div>
      }

      <div class="form-actions">
        <button type="submit" id="pf-submit" [disabled]="submitting()">
          {{ submitting() ? 'Scheduling…' : 'Schedule Post' }}
        </button>
      </div>
    </form>
  `,
  styles: [`
    .post-form { display: flex; flex-direction: column; gap: var(--space-4); }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--space-4);
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);

      label {
        font-size: 0.75rem;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: var(--color-gray-400);
        font-family: var(--font-mono);
        font-weight: 600;
      }

      textarea, select, input {
        padding: var(--space-3) var(--space-4);
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: var(--radius-md);
        color: var(--color-paper);
        font-family: var(--font-body);
        font-size: 0.9375rem;
        &:focus {
          outline: none;
          border-color: var(--color-signal);
          box-shadow: 0 0 0 3px rgba(232,194,74,0.15);
        }
        option { background: var(--color-steel); }
      }
      textarea { resize: vertical; min-height: 100px; }
    }

    .checkbox-label {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      font-size: 0.875rem !important;
      text-transform: none !important;
      letter-spacing: 0 !important;
      color: var(--color-gray-300) !important;
      cursor: pointer;
      input { width: 18px; height: 18px; accent-color: var(--color-signal); }
    }

    .recurrence-row {
      display: grid;
      grid-template-columns: 1fr 1fr 1fr;
      gap: var(--space-3);
      margin-top: var(--space-3);
      padding: var(--space-3);
      background: rgba(255,255,255,0.03);
      border-radius: var(--radius-md);
    }

    .form-error {
      color: var(--color-fault);
      font-size: 0.8125rem;
    }

    .loading-text, .empty-text {
      font-size: 0.875rem;
      color: var(--color-gray-500);
      font-style: italic;
    }

    .form-actions button {
      padding: var(--space-3) var(--space-6);
      background: var(--color-signal);
      border: none;
      border-radius: var(--radius-md);
      color: #000;
      font-weight: 700;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all var(--transition-fast);
      &:hover:not(:disabled) { background: #f0cd5a; }
      &:disabled { opacity: 0.5; cursor: not-allowed; }
    }
  `]
})
export class PostFormComponent implements OnInit {
  @Output() saved = new EventEmitter<PostFormData>();

  private schedulingEngine = inject(SchedulingEngineService);

  channels = signal<Channel[]>([]);
  loading = signal(true);
  submitting = signal(false);
  error = signal<string | null>(null);

  text = '';
  channelId = '';
  scheduledAt = '';
  enableRecurrence = false;
  frequency: 'daily' | 'weekly' | 'monthly' = 'weekly';
  interval = 1;
  endDate = '';

  async ngOnInit() {
    try {
      const chs = await this.schedulingEngine.getChannels();
      this.channels.set(chs);
      if (chs.length > 0) this.channelId = chs[0].id;
    } catch {
      // channels remain empty; user will see message
    } finally {
      this.loading.set(false);
    }
  }

  submit() {
    this.error.set(null);

    if (!this.text.trim()) { this.error.set('Content is required'); return; }
    if (!this.channelId)   { this.error.set('Channel is required'); return; }
    if (!this.scheduledAt) { this.error.set('Schedule date is required'); return; }

    const dt = new Date(this.scheduledAt);
    if (dt <= new Date()) { this.error.set('Scheduled time must be in the future'); return; }

    let recurrenceRule: RecurrenceRule | undefined;
    if (this.enableRecurrence) {
      recurrenceRule = {
        frequency: this.frequency,
        interval: Math.max(1, this.interval),
        endDate: this.endDate ? new Date(this.endDate) : undefined
      };
    }

    this.saved.emit({
      text: this.text,
      channelId: this.channelId,
      scheduledAt: dt,
      recurrenceRule
    });
  }

  platformIcon(platform: string): string {
    const icons: Record<string, string> = {
      telegram: '✈️', twitter: '🐦', instagram: '📸', linkedin: '💼'
    };
    return icons[platform] || '📡';
  }
}