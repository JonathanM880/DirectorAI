import {
  Component,
  OnInit,
  OnDestroy,
  signal,
  computed,
  inject
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import {
  SchedulingEngineService,
  AuditLogEntry
} from '../services/scheduling-engine.service';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { ScheduledPost, Channel } from '@director-ai/types';

/**
 * Backoff delay formula from retry-engine.ts:
 *   delay = MIN(1000 * (2 ^ retryCount), 300_000) ms
 * Re-implemented as a pure function here to power the UI preview.
 * Source: supabase/functions/_shared/retry-engine.ts — computeBaseDelay()
 */
function computeBaseDelay(retryCount: number): number {
  const BASE_DELAY_MS = 1000;
  const MAX_DELAY_MS = 300_000;
  return Math.min(BASE_DELAY_MS * Math.pow(2, retryCount), MAX_DELAY_MS);
}

function formatDelay(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`;
  return `${(ms / 3_600_000).toFixed(2)}h`;
}

type TabId = 'recurrence' | 'retry' | 'log' | 'failed';

interface ChannelRetryConfig {
  channel: Channel;
  maxRetries: number;
  saving: boolean;
}

interface RepublishState {
  postId: string;
  newDate: string;
  submitting: boolean;
  error: string | null;
}

const PAGE_SIZE = 10;

@Component({
  selector: 'app-automation',
  standalone: true,
  imports: [CommonModule, FormsModule, StatusBadgeComponent],
  templateUrl: './automation.component.html',
  styleUrls: ['./automation.component.scss']
})
export class AutomationComponent implements OnInit, OnDestroy {
  private schedulingEngine = inject(SchedulingEngineService);
  private router = inject(Router);

  /* ── Tab state ───────────────────────────────────────────── */
  activeTab = signal<TabId>('recurrence');

  /* ── Recurrence ──────────────────────────────────────────── */
  recurringPosts = signal<ScheduledPost[]>([]);
  recurrenceLoading = signal(false);

  /* ── Retry Rules ─────────────────────────────────────────── */
  channelRetryConfigs = signal<ChannelRetryConfig[]>([]);
  retryLoading = signal(false);
  previewMaxRetries = signal(3);

  backoffRows = computed(() => {
    const max = Math.max(1, Math.min(10, this.previewMaxRetries()));
    return Array.from({ length: max }, (_, i) => {
      const delay = computeBaseDelay(i + 1);
      const pct = (delay / 300_000) * 100;
      return { attempt: i + 1, delay, pct, label: formatDelay(delay) };
    });
  });

  /* ── Activity Log ────────────────────────────────────────── */
  logRows = signal<AuditLogEntry[]>([]);
  logTotal = signal(0);
  logPage = signal(0);
  logLoading = signal(false);
  logFilterAction = signal('');
  logFilterPlatform = signal('');
  logFilterFrom = signal('');
  logFilterTo = signal('');

  get logTotalPages(): number {
    return Math.ceil(this.logTotal() / PAGE_SIZE);
  }
  get logStart(): number { return this.logPage() * PAGE_SIZE + 1; }
  get logEnd(): number   { return Math.min((this.logPage() + 1) * PAGE_SIZE, this.logTotal()); }

  /* ── Failed Posts ────────────────────────────────────────── */
  failedPosts = signal<ScheduledPost[]>([]);
  failedLoading = signal(false);
  republishState = signal<RepublishState | null>(null);

  /* ── Toast ───────────────────────────────────────────────── */
  toast = signal<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;

  /* ── Lifecycle ───────────────────────────────────────────── */
  async ngOnInit() {
    await this.loadTab('recurrence');
  }

  ngOnDestroy() {
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
  }

  /* ── Tab navigation ──────────────────────────────────────── */
  async selectTab(tab: TabId) {
    this.activeTab.set(tab);
    await this.loadTab(tab);
  }

  private async loadTab(tab: TabId) {
    switch (tab) {
      case 'recurrence': await this.loadRecurring(); break;
      case 'retry':      await this.loadRetryRules(); break;
      case 'log':        await this.loadLog(); break;
      case 'failed':     await this.loadFailed(); break;
    }
  }

  /* ── Recurrence ──────────────────────────────────────────── */
  private async loadRecurring() {
    this.recurrenceLoading.set(true);
    try {
      const posts = await this.schedulingEngine.getRecurringPosts();
      this.recurringPosts.set(posts);
    } catch (err: any) {
      this.showToast(err.message || 'Failed to load recurring posts', 'error');
    } finally {
      this.recurrenceLoading.set(false);
    }
  }

  async togglePostStatus(post: ScheduledPost) {
    const newStatus = post.status === 'scheduled' ? 'cancelled' : 'scheduled';
    try {
      if (newStatus === 'cancelled') {
        await this.schedulingEngine.cancelPost(post.id);
        this.showToast('Recurrence paused', 'info');
      } else {
        // Re-activate: reschedule to next logical time (now + 1 min as placeholder)
        const next = new Date(Date.now() + 60_000);
        await this.schedulingEngine.reschedulePost(post.id, next);
        this.showToast('Recurrence resumed', 'success');
      }
      await this.loadRecurring();
    } catch (err: any) {
      this.showToast(err.message || 'Failed to update post', 'error');
    }
  }

  frequencyLabel(post: ScheduledPost): string {
    const rule = (post as any).recurrenceRule;
    if (!rule) return 'Unknown';
    return `Every ${rule.interval} ${rule.frequency}`;
  }

  nextRunLabel(post: ScheduledPost): string {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(post.scheduledAt);
  }

  /* ── Retry Rules ─────────────────────────────────────────── */
  private async loadRetryRules() {
    this.retryLoading.set(true);
    try {
      const channels = await this.schedulingEngine.getChannels();
      this.channelRetryConfigs.set(
        channels.map(ch => ({ channel: ch, maxRetries: 3, saving: false }))
      );
    } catch (err: any) {
      this.showToast(err.message || 'Failed to load channels', 'error');
    } finally {
      this.retryLoading.set(false);
    }
  }

  async saveChannelRetries(config: ChannelRetryConfig) {
    config.saving = true;
    this.channelRetryConfigs.set([...this.channelRetryConfigs()]);
    try {
      await this.schedulingEngine.updateChannelMaxRetries(config.channel.id, config.maxRetries);
      this.previewMaxRetries.set(config.maxRetries);
      this.showToast(`Retry limit updated for ${config.channel.name}`, 'success');
    } catch (err: any) {
      this.showToast(err.message || 'Failed to save retry settings', 'error');
    } finally {
      config.saving = false;
      this.channelRetryConfigs.set([...this.channelRetryConfigs()]);
    }
  }

  onMaxRetriesChange(config: ChannelRetryConfig) {
    this.previewMaxRetries.set(config.maxRetries);
  }

  /* ── Activity Log ────────────────────────────────────────── */
  private async loadLog() {
    this.logLoading.set(true);
    try {
      const result = await this.schedulingEngine.getAuditLog({
        page: this.logPage(),
        pageSize: PAGE_SIZE,
        action: this.logFilterAction() || undefined,
        platform: this.logFilterPlatform() || undefined,
        from: this.logFilterFrom() ? new Date(this.logFilterFrom()) : undefined,
        to: this.logFilterTo() ? new Date(this.logFilterTo()) : undefined
      });
      this.logRows.set(result.rows);
      this.logTotal.set(result.total);
    } catch (err: any) {
      this.showToast(err.message || 'Failed to load activity log', 'error');
    } finally {
      this.logLoading.set(false);
    }
  }

  async applyLogFilters() {
    this.logPage.set(0);
    await this.loadLog();
  }

  async goLogPage(delta: number) {
    const newPage = this.logPage() + delta;
    if (newPage < 0 || newPage >= this.logTotalPages) return;
    this.logPage.set(newPage);
    await this.loadLog();
  }

  formatOccurred(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    }).format(date);
  }

  platformIcon(platform: string): string {
    const icons: Record<string, string> = {
      telegram: '✈️', twitter: '🐦', instagram: '📸', linkedin: '💼'
    };
    return icons[platform] || '📡';
  }

  /* ── Failed Posts ────────────────────────────────────────── */
  private async loadFailed() {
    this.failedLoading.set(true);
    try {
      const posts = await this.schedulingEngine.getFailedPosts();
      this.failedPosts.set(posts);
    } catch (err: any) {
      this.showToast(err.message || 'Failed to load failed posts', 'error');
    } finally {
      this.failedLoading.set(false);
    }
  }

  openRepublishForm(post: ScheduledPost) {
    // Default to 10 minutes from now
    const defaultDt = new Date(Date.now() + 10 * 60_000);
    const localStr = new Date(defaultDt.getTime() - defaultDt.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
    this.republishState.set({
      postId: post.id,
      newDate: localStr,
      submitting: false,
      error: null
    });
  }

  cancelRepublish() {
    this.republishState.set(null);
  }

  async confirmRepublish(post: ScheduledPost) {
    const state = this.republishState();
    if (!state || state.postId !== post.id) return;

    const newDate = new Date(state.newDate);
    if (newDate <= new Date()) {
      this.republishState.set({ ...state, error: 'Date must be in the future' });
      return;
    }

    this.republishState.set({ ...state, submitting: true, error: null });
    try {
      // SchedulingEngine.reschedulePost handles the 'failed' → 'scheduled' transition
      await this.schedulingEngine.reschedulePost(post.id, newDate);
      this.showToast('Post re-queued for publishing ✓', 'success');
      this.republishState.set(null);
      await this.loadFailed();
    } catch (err: any) {
      this.republishState.set({ ...state, submitting: false, error: err.message || 'Failed to republish' });
    }
  }

  navigateToCalendar() {
    this.router.navigate(['/calendar']);
  }

  /* ── Helpers ─────────────────────────────────────────────── */
  private showToast(message: string, type: 'success' | 'error' | 'info') {
    this.toast.set({ message, type });
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => this.toast.set(null), 3500);
  }

  get failedCount(): number { return this.failedPosts().length; }
  get recurringCount(): number { return this.recurringPosts().length; }
}
