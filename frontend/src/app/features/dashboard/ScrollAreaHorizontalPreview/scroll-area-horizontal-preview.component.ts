import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HlmScrollAreaImports } from '@spartan-ng/helm/scroll-area';
import { NgScrollbarModule } from 'ngx-scrollbar';
import { SchedulingEngineService } from '../../services/scheduling-engine.service';
import { ScheduledPostsService } from '../../../core/services/scheduled-posts.service';
import { PostMetricsService } from '../../../core/services/post-metrics.service';
import { ChannelsService } from '../../../core/services/channels.service';

interface PostPreviewItem {
  id: string;
  content: string;
  channelName: string;
  dateLabel: string;
  type: 'upcoming' | 'published';
  views?: number;
  reactions?: number;
}

@Component({
  selector: 'spartan-scroll-area-horizontal-preview',
  standalone: true,
  imports: [CommonModule, HlmScrollAreaImports, NgScrollbarModule],
  template: `
    <ng-scrollbar hlm class="w-full border whitespace-nowrap rounded-md bg-transparent">
      <div class="flex w-max space-x-4 p-4 items-stretch">
        @for (post of items(); track post.id) {
          <figure class="shrink-0 flex flex-col">
            <div class="aspect-[3/4] w-[200px] bg-white/[0.02] hover:bg-white/[0.04] transition-colors border border-border rounded-md p-4 whitespace-normal flex flex-col justify-between overflow-y-auto">
              <p class="text-sm text-gray-200 leading-relaxed overflow-hidden text-ellipsis line-clamp-6">
                {{ post.content }}
              </p>
              @if (post.type === 'published') {
                <div class="mt-2 text-xs text-gray-400 border-t border-border pt-2 flex flex-col gap-0.5">
                  <div class="flex justify-between">
                    <span>Vistas:</span>
                    <span class="font-semibold text-white">{{ post.views }}</span>
                  </div>
                  <div class="flex justify-between">
                    <span>Reacciones:</span>
                    <span class="font-semibold text-white">{{ post.reactions }}</span>
                  </div>
                </div>
              }
            </div>
            <figcaption class="text-muted-foreground pt-2 text-xs w-[200px]">
              <span class="text-white font-semibold block truncate">
                {{ post.channelName }}
              </span>
              <span class="block text-[10px] text-gray-400 mt-0.5">
                {{ post.dateLabel }}
              </span>
            </figcaption>
          </figure>
        } @empty {
          <div class="text-sm text-gray-400 py-6 px-4">
            No hay posts para mostrar.
          </div>
        }
      </div>
    </ng-scrollbar>
  `
})
export class ScrollAreaHorizontalPreview implements OnInit {
  @Input() type: 'upcoming' | 'published' = 'upcoming';

  private schedulingEngineService = inject(SchedulingEngineService);
  private scheduledPostsService = inject(ScheduledPostsService);
  private postMetricsService = inject(PostMetricsService);
  private channelsService = inject(ChannelsService);

  items = signal<PostPreviewItem[]>([]);

  async ngOnInit() {
    await this.loadData();
  }

  private async loadData() {
    try {
      // 1. Fetch channels to map names
      const channelsList = await this.channelsService.getChannels();
      const channelMap = new Map<string, typeof channelsList[0]>();
      for (const ch of channelsList) {
        channelMap.set(ch.id, ch);
      }

      if (this.type === 'upcoming') {
        const upcoming: any[] = [];
        const now = new Date();
        const from = new Date();
        const to = new Date();
        to.setDate(to.getDate() + 90); // 90 days lookahead

        const posts = await this.schedulingEngineService.getUpcomingPosts(from, to);

        for (const post of posts) {
          if (!post.content?.text?.trim()) {
            continue;
          }

          const channel = channelMap.get(post.channelId);
          const channelName = channel ? `${channel.name} (${channel.platform})` : `Canal (${post.platform})`;

          if (!post.recurrenceRule) {
            if (post.scheduledAt >= now) {
              upcoming.push({
                id: post.id,
                content: post.content.text,
                channelName,
                dateLabel: this.formatDate(post.scheduledAt),
                type: 'upcoming',
                dateValue: post.scheduledAt.getTime()
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
            if (current >= now) {
              upcoming.push({
                id: `${post.id}_${occurrenceIdx}`,
                content: post.content.text,
                channelName,
                dateLabel: this.formatDate(current),
                type: 'upcoming',
                dateValue: current.getTime()
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

        // Sort ascending by scheduled date and take top 10
        upcoming.sort((a, b) => a.dateValue - b.dateValue);
        this.items.set(upcoming.slice(0, 10));

      } else {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

        const posts = await this.scheduledPostsService.getPublishedPosts(startOfMonth, endOfMonth);
        const list: PostPreviewItem[] = [];

        for (const post of posts) {
          const channel = channelMap.get(post.channelId);
          const channelName = channel ? `${channel.name} (${channel.platform})` : `Canal (${post.platform})`;

          let views = 0;
          let reactions = 0;
          try {
            const metrics = await this.postMetricsService.getPostMetrics(post.id);
            if (metrics) {
              views = metrics.views || 0;
              reactions = Object.values(metrics.reactions || {}).reduce((sum, val) => sum + (val || 0), 0);
            }
          } catch (err) {
            console.error(`Error loading metrics for post ${post.id}:`, err);
          }

          list.push({
            id: post.id,
            content: post.content?.text || '',
            channelName,
            dateLabel: this.formatDate(post.publishedAt || post.scheduledAt),
            type: 'published',
            views,
            reactions
          });
        }

        this.items.set(list);
      }
    } catch (error) {
      console.error('Error loading scroll area preview items:', error);
    }
  }

  private formatDate(date: Date): string {
    return date.toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}
