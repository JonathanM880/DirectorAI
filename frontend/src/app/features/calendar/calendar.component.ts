import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  signal,
  computed,
  inject
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { FullCalendarModule, FullCalendarComponent } from '@fullcalendar/angular';

import { CalendarOptions, EventClickArg, EventDropArg } from '@fullcalendar/core';
import esLocale from '@fullcalendar/core/locales/es';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';

import { SchedulingEngineService } from '../services/scheduling-engine.service';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { PostFormComponent, PostFormData } from '../../shared/components/post-form/post-form.component';
import { EditPostComponent } from '../../shared/components/edit-post/edit-post.component';
import { ScheduledPost, PostStatus, Channel, RecurrenceRule } from '@director-ai/types';

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [CommonModule, FormsModule, FullCalendarModule, StatusBadgeComponent, PostFormComponent, EditPostComponent],
  templateUrl: './calendar.component.html',
  styleUrls: ['./calendar.component.scss']
})
export class CalendarComponent implements OnInit, OnDestroy {
  /** ViewChild gives us a direct handle to the FullCalendar API post-init. */
  @ViewChild(FullCalendarComponent) calendarRef!: FullCalendarComponent;

  private schedulingEngine = inject(SchedulingEngineService);
  private router = inject(Router);


  /* ── State ──────────────────────────────────────────────── */
  loading = signal(false);
  drawerOpen = signal(false);
  newPostOpen = signal(false);
  editPostOpen = signal(false);
  submitting = signal(false);

  selectedPost = signal<ScheduledPost | null>(null);
  channels = signal<Channel[]>([]);
  drawerError = signal<string | null>(null);
  formError = signal<string | null>(null);
  toast = signal<{ message: string; type: 'success' | 'error' } | null>(null);

  currentView = signal<'dayGridMonth' | 'timeGridWeek'>('dayGridMonth');
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;

  /* ── FullCalendar Config ─────────────────────────────────── */
  calendarOptions: CalendarOptions = {
    plugins: [dayGridPlugin, timeGridPlugin, interactionPlugin],
    initialView: 'dayGridMonth',
    editable: true,
    selectable: true,
    locales: [esLocale],
    locale: 'es',
    headerToolbar: {
      left: 'prev,next today',
      center: 'title',
      right: ''           // view toggle handled in our own UI
    },
    eventClassNames: (arg) => [`event-${arg.event.extendedProps['status']}`],
    eventClick: (arg: EventClickArg) => this.onEventClick(arg),
    eventDrop: (arg: EventDropArg) => this.onEventDrop(arg),
    datesSet: (info) => this.onDatesSet(info.start, info.end),
    // 'auto' lets the month grid grow and become scrollable in dense weeks
    height: 'auto',
    nowIndicator: true,
    // true = show all events; overflow handled by CSS scroll on the day cell
    dayMaxEvents: true,
    scrollTime: '08:00:00'  // week/day views start at 8am
  };


  /* ── Lifecycle ───────────────────────────────────────────── */
  async ngOnInit() {
    this.channels.set(await this.schedulingEngine.getChannels().catch(() => []));
  }

  ngOnDestroy() {
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
  }

  /* ── Load Posts ──────────────────────────────────────────── */
  private async loadPosts(from: Date, to: Date) {
    this.loading.set(true);
    try {
      const posts: any[] = await this.schedulingEngine.getUpcomingPosts(from, to);
      const events: any[] = [];
      
      for (const post of posts) {
        if (!post.content.text?.trim()) {
          continue; // Filter out corrupted or empty posts
        }

        if (!post.recurrenceRule) {
          if (post.scheduledAt >= from && post.scheduledAt <= to) {
            events.push({
              id: post.id,
              title: post.content.text.slice(0, 60),
              start: post.scheduledAt.toISOString(),
              extendedProps: { status: post.status, post }
            });
          }
          continue;
        }

        const rule: any = post.recurrenceRule;
        let current = new Date(post.scheduledAt);
        const endDate = rule.endDate ? new Date(rule.endDate) : to;
        if (rule.endDate) {
          endDate.setHours(23, 59, 59, 999);
        }
        const limitDate = endDate < to ? endDate : to;
        const interval = rule.interval || 1;
        let occurrenceIdx = 0;

        while (current <= limitDate) {
          if (current >= from) {
            const isFuture = current > new Date();
            const displayStatus = isFuture && post.status === 'published' ? 'scheduled' : post.status;
            events.push({
              id: `${post.id}_${occurrenceIdx}`,
              title: post.content.text.slice(0, 60),
              start: current.toISOString(),
              extendedProps: { status: displayStatus, post }
            });
          }
          
          let nextDate = new Date(current);
          if (rule.frequency === 'daily') {
            nextDate.setDate(nextDate.getDate() + interval);
          } else if (rule.frequency === 'weekly') {
            nextDate.setDate(nextDate.getDate() + 7 * interval);
          } else if (rule.frequency === 'monthly') {
            nextDate.setMonth(nextDate.getMonth() + interval);
          } else {
            break;
          }
          nextDate.setHours(post.scheduledAt.getHours(), post.scheduledAt.getMinutes());
          current = nextDate;
          
          if (rule.maxOccurrences && occurrenceIdx >= rule.maxOccurrences - 1) {
            break;
          }
          occurrenceIdx++;
        }
      }

      this.calendarOptions = {
        ...this.calendarOptions,
        events
      };
    } catch (err: any) {
      this.showToast(err.message || 'Error al cargar las publicaciones', 'error');
    } finally {
      this.loading.set(false);
    }
  }

  /* ── Calendar Callbacks ──────────────────────────────────── */
  onDatesSet(start: Date, end: Date) {
    this.loadPosts(start, end);
  }

  onEventClick(arg: EventClickArg) {
    const clickedDate = arg.event.start;
    const isFuture = clickedDate && clickedDate > new Date();
    
    this.selectedPost.set({ 
      ...arg.event.extendedProps['post'], 
      scheduledAt: clickedDate || arg.event.extendedProps['post'].scheduledAt, 
      status: isFuture ? 'scheduled' : arg.event.extendedProps['post'].status 
    });
    
    this.drawerError.set(null);
    this.drawerOpen.set(true);
  }

  async onEventDrop(arg: EventDropArg) {
    const newDate = arg.event.start;
    if (!newDate) { arg.revert(); return; }

    if (newDate <= new Date()) {
      this.showToast('No se puede reprogramar para una fecha pasada', 'error');
      arg.revert();
      return;
    }

    const postId = arg.event.id;
    try {
      await this.schedulingEngine.reschedulePost(postId, newDate);
      this.showToast('Publicación reprogramada exitosamente ✓', 'success');
      // Update selected post if drawer is open
      if (this.selectedPost()?.id === postId) {
        const updated = this.selectedPost()!;
        this.selectedPost.set({ ...updated, scheduledAt: newDate });
      }
    } catch (err: any) {
      this.showToast(err.message || 'Reprogramación fallida', 'error');
      arg.revert();
    }
  }

  /* ── View Toggle ─────────────────────────────────────────── */
  /**
   * Switch between Month and Week views.
   *
   * BUG FIX: The previous implementation mutated calendarOptions.initialView,
   * which FullCalendar only reads once at bootstrap time. After mount, the only
   * correct way to change view is via the Calendar API: calendarRef.getApi().changeView().
   */
  setView(view: 'dayGridMonth' | 'timeGridWeek') {
    this.currentView.set(view);
    if (this.calendarRef) {
      this.calendarRef.getApi().changeView(view);
    }
  }

  /* ── Drawer Actions ──────────────────────────────────────── */
  closeDrawer() {
    this.drawerOpen.set(false);
    setTimeout(() => this.selectedPost.set(null), 300);
  }

  openEditForm() {
    this.editPostOpen.set(true);
    this.drawerOpen.set(false);
  }

  async cancelSelectedPost() {
    const post = this.selectedPost();
    if (!post) return;

    if (post.status !== 'scheduled') {
      this.drawerError.set(`No se puede cancelar una publicación con estado "${post.status}"`);
      return;
    }

    try {
      await this.schedulingEngine.cancelPost(post.id);
      this.showToast('Publicación cancelada exitosamente ✓', 'success');
      this.closeDrawer();
      // Reload current view range
      const calApi = (document.querySelector('full-calendar') as any)?.__zone_symbol__calendarApi;
      if (calApi) calApi.refetchEvents();
    } catch (err: any) {
      this.drawerError.set(err.message || 'No se pudo cancelar la publicación');
    }
  }

  goToMetrics() {
    const post = this.selectedPost();
    if (post) {
      this.router.navigate(['/app/metrics'], { state: { postId: post.id } });
    }
  }

  /* ── New Post Panel ──────────────────────────────────────── */
  openNewPostPanel() {
    this.formError.set(null);
    this.newPostOpen.set(true);
  }

  closeNewPostPanel() {
    this.newPostOpen.set(false);
  }

  async onPostFormSaved(data: PostFormData) {
    this.submitting.set(true);
    this.formError.set(null);
    try {
      const isPublishNow = (data as any).publishImmediately;
      const createdPost = await this.schedulingEngine.schedulePost({
        channelId: data.channelId,
        content: {
          text: data.text,
          mediaAssetIds: data.mediaAssetIds,
          mediaType: data.mediaType,
        },
        scheduledAt: data.scheduledAt,
        recurrenceRule: data.recurrenceRule,
        publishImmediately: isPublishNow
      } as any);
      
      const calApi = this.calendarRef?.getApi();
      const refreshEvents = async () => {
        if (calApi) {
          const view = calApi.view;
          await this.loadPosts(view.activeStart, view.activeEnd);
          calApi.refetchEvents();
        }
      };

      if (isPublishNow) {
        this.showToast('Encolando publicación inmediata...', 'success');
        
        let attempts = 0;
        const maxAttempts = 10;
        
        const checkStatus = async () => {
          if (attempts >= maxAttempts) {
            this.showToast('La publicación tarda en responder. Revisa el historial de actividad.', 'success');
            await refreshEvents();
            return;
          }
          attempts++;
          
          try {
            const post = await this.schedulingEngine.getPostById(createdPost.id);
            if (post) {
              if (post.status === 'published') {
                this.showToast('¡Publicación publicada en Telegram exitosamente! ✓', 'success');
                await refreshEvents();
              } else if (post.status === 'failed') {
                this.showToast('Error al publicar en Telegram. Revisa el historial.', 'error');
                await refreshEvents();
              } else {
                setTimeout(checkStatus, 1500);
              }
            } else {
              setTimeout(checkStatus, 1500);
            }
          } catch (e) {
            setTimeout(checkStatus, 1500);
          }
        };
        setTimeout(checkStatus, 1500);
      } else {
        this.showToast('Publicación programada exitosamente ✓', 'success');
        await refreshEvents();
      }

      this.closeNewPostPanel();
    } catch (err: any) {
      this.formError.set(err.message || 'No se pudo programar la publicación');
    } finally {
      this.submitting.set(false);
    }
  }

  async onEditSaved(data: PostFormData) {
    const post = this.selectedPost();
    if (!post) return;

    this.submitting.set(true);
    this.formError.set(null);
    try {
      await this.schedulingEngine.updatePost(post.id, {
        channelId: data.channelId,
        content: {
          text: data.text,
          mediaAssetIds: data.mediaAssetIds,
          mediaType: data.mediaType,
        },
        scheduledAt: data.scheduledAt,
        recurrenceRule: data.recurrenceRule
      });
      this.showToast('Publicación actualizada exitosamente ✓', 'success');
      
      const calApi = this.calendarRef?.getApi();
      if (calApi) {
        const view = calApi.view;
        await this.loadPosts(view.activeStart, view.activeEnd);
        calApi.refetchEvents();
      }

      this.editPostOpen.set(false);
    } catch (err: any) {
      this.formError.set(err.message || 'No se pudo actualizar la publicación');
    } finally {
      this.submitting.set(false);
    }
  }

  /* ── Helpers ─────────────────────────────────────────────── */
  formatDate(date: Date): string {
    return new Intl.DateTimeFormat('es-ES', {
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