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
import { FullCalendarModule } from '@fullcalendar/angular';
import { CalendarOptions, EventClickArg, EventDropArg } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';

import { SchedulingEngineService } from '../services/scheduling-engine.service';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { ScheduledPost, PostStatus, Channel, RecurrenceRule } from '@director-ai/types';

interface NewPostForm {
  text: string;
  channelId: string;
  scheduledAt: string;
  enableRecurrence: boolean;
  recurrence: {
    frequency: 'daily' | 'weekly' | 'monthly';
    interval: number;
    endDate: string;
  };
}

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule, FullCalendarModule, StatusBadgeComponent],
  templateUrl: './calendar.component.html',
  styleUrls: ['./calendar.component.scss']
})
export class CalendarComponent implements OnInit, OnDestroy {
  private schedulingEngine = inject(SchedulingEngineService);
  private router = inject(Router);

  /* ── State ──────────────────────────────────────────────── */
  loading = signal(false);
  drawerOpen = signal(false);
  newPostOpen = signal(false);
  submitting = signal(false);

  selectedPost = signal<ScheduledPost | null>(null);
  channels = signal<Channel[]>([]);
  drawerError = signal<string | null>(null);
  formError = signal<string | null>(null);
  toast = signal<{ message: string; type: 'success' | 'error' } | null>(null);

  currentView = signal<'dayGridMonth' | 'timeGridWeek'>('dayGridMonth');
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;

  newPostForm: NewPostForm = {
    text: '',
    channelId: '',
    scheduledAt: '',
    enableRecurrence: false,
    recurrence: { frequency: 'weekly', interval: 1, endDate: '' }
  };

  /* ── FullCalendar Config ─────────────────────────────────── */
  calendarOptions: CalendarOptions = {
    plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
    initialView: 'dayGridMonth',
    editable: true,
    selectable: true,
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: ''           // view toggle handled in our own UI
    },
    eventClassNames: (arg) => [`event-${arg.event.extendedProps['status']}`],
    eventClick: (arg: EventClickArg) => this.onEventClick(arg),
    eventDrop: (arg: EventDropArg) => this.onEventDrop(arg),
    datesSet: (info) => this.onDatesSet(info.start, info.end),
    height: '100%',
    nowIndicator: true,
    dayMaxEvents: 4,
    moreLinkContent: (args) => `+${args.num} more`
  };

  /* ── Lifecycle ───────────────────────────────────────────── */
  async ngOnInit() {
    this.channels.set(await this.schedulingEngine.getChannels().catch(() => []));
    if (this.channels().length > 0) {
      this.newPostForm.channelId = this.channels()[0].id;
    }
  }

  ngOnDestroy() {
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
  }

  /* ── Load Posts ──────────────────────────────────────────── */
  private async loadPosts(from: Date, to: Date) {
    this.loading.set(true);
    try {
      const posts = await this.schedulingEngine.getUpcomingPosts(from, to);
      this.calendarOptions = {
        ...this.calendarOptions,
        events: posts.map(post => ({
          id: post.id,
          title: post.content.text?.slice(0, 60) || '(No text)',
          start: post.scheduledAt.toISOString(),
          extendedProps: {
            status: post.status,
            post
          }
        }))
      };
    } catch (err: any) {
      this.showToast(err.message || 'Failed to load posts', 'error');
    } finally {
      this.loading.set(false);
    }
  }

  /* ── Calendar Callbacks ──────────────────────────────────── */
  onDatesSet(start: Date, end: Date) {
    this.loadPosts(start, end);
  }

  onEventClick(arg: EventClickArg) {
    const post = arg.event.extendedProps['post'] as ScheduledPost;
    this.selectedPost.set(post);
    this.drawerError.set(null);
    this.drawerOpen.set(true);
  }

  async onEventDrop(arg: EventDropArg) {
    const newDate = arg.event.start;
    if (!newDate) { arg.revert(); return; }

    if (newDate <= new Date()) {
      this.showToast('Cannot reschedule to a past date', 'error');
      arg.revert();
      return;
    }

    const postId = arg.event.id;
    try {
      await this.schedulingEngine.reschedulePost(postId, newDate);
      this.showToast('Post rescheduled ✓', 'success');
      // Update selected post if drawer is open
      if (this.selectedPost()?.id === postId) {
        const updated = this.selectedPost()!;
        this.selectedPost.set({ ...updated, scheduledAt: newDate });
      }
    } catch (err: any) {
      this.showToast(err.message || 'Reschedule failed', 'error');
      arg.revert();
    }
  }

  /* ── View Toggle ─────────────────────────────────────────── */
  setView(view: 'dayGridMonth' | 'timeGridWeek') {
    this.currentView.set(view);
    this.calendarOptions = { ...this.calendarOptions, initialView: view };
  }

  /* ── Drawer Actions ──────────────────────────────────────── */
  closeDrawer() {
    this.drawerOpen.set(false);
    setTimeout(() => this.selectedPost.set(null), 300);
  }

  openEditForm() {
    const post = this.selectedPost();
    if (!post) return;
    // Pre-fill form with current post data
    const localDt = new Date(post.scheduledAt.getTime() - post.scheduledAt.getTimezoneOffset() * 60000)
      .toISOString().slice(0, 16);
    this.newPostForm = {
      text: post.content.text || '',
      channelId: post.channelId,
      scheduledAt: localDt,
      enableRecurrence: false,
      recurrence: { frequency: 'weekly', interval: 1, endDate: '' }
    };
    this.closeDrawer();
    this.newPostOpen.set(true);
  }

  async cancelSelectedPost() {
    const post = this.selectedPost();
    if (!post) return;

    if (post.status !== 'scheduled') {
      this.drawerError.set(`Cannot cancel a post with status "${post.status}"`);
      return;
    }

    try {
      await this.schedulingEngine.cancelPost(post.id);
      this.showToast('Post cancelled', 'success');
      this.closeDrawer();
      // Reload current view range
      const calApi = (document.querySelector('full-calendar') as any)?.__zone_symbol__calendarApi;
      if (calApi) calApi.refetchEvents();
    } catch (err: any) {
      this.drawerError.set(err.message || 'Failed to cancel post');
    }
  }

  goToMetrics() {
    this.router.navigate(['/metrics']);
  }

  /* ── New Post Panel ──────────────────────────────────────── */
  openNewPostPanel() {
    this.formError.set(null);
    this.newPostOpen.set(true);
  }

  closeNewPostPanel() {
    this.newPostOpen.set(false);
    this.resetForm();
  }

  resetForm() {
    this.newPostForm = {
      text: '',
      channelId: this.channels()[0]?.id || '',
      scheduledAt: '',
      enableRecurrence: false,
      recurrence: { frequency: 'weekly', interval: 1, endDate: '' }
    };
    this.formError.set(null);
  }

  async submitNewPost() {
    this.formError.set(null);

    if (!this.newPostForm.text.trim()) {
      this.formError.set('Post content is required');
      return;
    }
    if (!this.newPostForm.channelId) {
      this.formError.set('Please select a channel');
      return;
    }
    if (!this.newPostForm.scheduledAt) {
      this.formError.set('Please set a scheduled date and time');
      return;
    }

    const scheduledAt = new Date(this.newPostForm.scheduledAt);
    if (scheduledAt <= new Date()) {
      this.formError.set('Scheduled time must be in the future');
      return;
    }

    let recurrenceRule: RecurrenceRule | undefined;
    if (this.newPostForm.enableRecurrence) {
      recurrenceRule = {
        frequency: this.newPostForm.recurrence.frequency,
        interval: Math.max(1, this.newPostForm.recurrence.interval),
        endDate: this.newPostForm.recurrence.endDate
          ? new Date(this.newPostForm.recurrence.endDate)
          : undefined
      };
    }

    this.submitting.set(true);
    try {
      await this.schedulingEngine.schedulePost({
        channelId: this.newPostForm.channelId,
        content: { text: this.newPostForm.text },
        scheduledAt,
        recurrenceRule
      });
      this.showToast('Post scheduled ✓', 'success');
      this.closeNewPostPanel();
    } catch (err: any) {
      this.formError.set(err.message || 'Failed to schedule post');
    } finally {
      this.submitting.set(false);
    }
  }

  /* ── Helpers ─────────────────────────────────────────────── */
  formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }

  platformIcon(platform: string): string {
    const icons: Record<string, string> = {
      telegram: '✈️',
      twitter: '🐦',
      instagram: '📸',
      linkedin: '💼'
    };
    return icons[platform] || '📡';
  }

  private showToast(message: string, type: 'success' | 'error') {
    this.toast.set({ message, type });
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => this.toast.set(null), 3500);
  }

  get hasChannels(): boolean { return this.channels().length > 0; }
  get isDrawerOpen(): boolean { return this.drawerOpen(); }
}