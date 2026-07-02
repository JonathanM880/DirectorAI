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
import { Router, RouterModule } from '@angular/router';

import {
  SchedulingEngineService,
  AuditLogEntry,
  RecurringPost,
  RecurrenceRuleRow
} from '../services/scheduling-engine.service';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { ScheduledPost, Channel } from '@director-ai/types';


type TabId = 'recurrence' | 'log' | 'failed';

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
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './automation.component.html',
  styleUrls: ['./automation.component.scss']
})
export class AutomationComponent implements OnInit, OnDestroy {
  private schedulingEngine = inject(SchedulingEngineService);
  private router = inject(Router);

  /* ── Tab state ───────────────────────────────────────────── */
  activeTab = signal<TabId>('recurrence');

  /* ── Recurrence ───────────────────────────────────────────────────── */
  // RecurringPost extends ScheduledPost and includes the joined recurrenceRule object
  recurringPosts = signal<RecurringPost[]>([]);
  recurrenceLoading = signal(false);


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
      this.showToast(err.message || 'Error al cargar las publicaciones recurrentes', 'error');
    } finally {
      this.recurrenceLoading.set(false);
    }
  }

  async togglePostStatus(post: RecurringPost) {
    const newStatus = post.status === 'scheduled' ? 'cancelled' : 'scheduled';
    try {
      if (newStatus === 'cancelled') {
        await this.schedulingEngine.cancelPost(post.id);
        this.showToast('Recurrencia pausada', 'info');
      } else {
        // Re-activate: reschedule to next logical time (now + 1 min as placeholder)
        const next = new Date(Date.now() + 60_000);
        await this.schedulingEngine.reschedulePost(post.id, next);
        this.showToast('Recurrencia reanudada', 'success');
      }
      await this.loadRecurring();
    } catch (err: any) {
      this.showToast(err.message || 'Error al actualizar la publicación', 'error');
    }
  }

  frequencyLabel(post: RecurringPost): string {
    const rule: RecurrenceRuleRow = post.recurrenceRule;
    const freq = rule.frequency.toLowerCase();
    if (rule.interval > 1) {
      const units: Record<string, string> = {
        daily: 'días',
        weekly: 'semanas',
        monthly: 'meses',
        yearly: 'años'
      };
      return `Cada ${rule.interval} ${units[freq] || freq}`;
    } else {
      const unitsSingle: Record<string, string> = {
        daily: 'día',
        weekly: 'semana',
        monthly: 'mes',
        yearly: 'año'
      };
      return `Cada ${unitsSingle[freq] || freq}`;
    }
  }

  nextRunLabel(post: RecurringPost): string {
    if (!post.scheduledAt) return 'No programada';
    return new Intl.DateTimeFormat('es-ES', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    }).format(post.scheduledAt);
  }

  isCampaignActive(post: RecurringPost): boolean {
    if (post.status === 'cancelled') return false;
    if (post.recurrenceRule && post.recurrenceRule.end_date) {
      const endDate = new Date(post.recurrenceRule.end_date);
      if (new Date() > endDate) return false;
    }
    return true;
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
      this.showToast(err.message || 'Error al cargar el registro de actividad', 'error');
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
    return new Intl.DateTimeFormat('es-ES', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    }).format(date);
  }

  translateAction(action: string): string {
    const map: Record<string, string> = {
      published: 'Publicado',
      failed: 'Fallido',
      retried: 'Reintentado',
      cancelled: 'Cancelado',
      edited: 'Editado',
      deleted: 'Eliminado'
    };
    return map[action.toLowerCase()] || action;
  }

  translatePlatform(platform: string): string {
    if (!platform) return '-';
    const map: Record<string, string> = {
      telegram: 'Telegram',
      twitter: 'Twitter',
      instagram: 'Instagram',
      linkedin: 'LinkedIn'
    };
    return map[platform.toLowerCase()] || platform;
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
      this.showToast(err.message || 'Error al cargar las publicaciones fallidas', 'error');
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
      this.republishState.set({ ...state, error: 'La fecha debe estar en el futuro' });
      return;
    }

    this.republishState.set({ ...state, submitting: true, error: null });
    try {
      // SchedulingEngine.reschedulePost handles the 'failed' → 'scheduled' transition
      await this.schedulingEngine.reschedulePost(post.id, newDate);
      this.showToast('Publicación encolada de nuevo para publicar ✓', 'success');
      this.republishState.set(null);
      await this.loadFailed();
    } catch (err: any) {
      this.republishState.set({ ...state, submitting: false, error: err.message || 'Error al volver a publicar' });
    }
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
