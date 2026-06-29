import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HlmResizableImports } from '@spartan-ng/helm/resizable';
import { ScheduledPostsService } from '../../../core/services/scheduled-posts.service';
import { PostMetricsService } from '../../../core/services/post-metrics.service';
import { AuditLogService } from '../../../core/services/audit-log.service';
import { ChannelsService } from '../../../core/services/channels.service';

@Component({
  selector: 'app-resizable-group',
  standalone: true,
  imports: [CommonModule, HlmResizableImports],
  host: {
    class: 'block w-full h-full'
  },
  template: `
    <hlm-resizable-group direction="horizontal" class="h-full w-full max-w-4xl rounded-lg border">
      
      <hlm-resizable-panel>
        <div class="flex flex-col h-full items-center justify-center p-6 text-center bg-transparent hover:bg-white/[0.01] transition-colors">
          <span class="text-3xl font-bold tracking-tight text-white">{{ postsPublishedThisMonth() }}</span>
          <span class="text-xs text-gray-400 mt-2 font-medium">Posts publicados este mes</span>
        </div>
      </hlm-resizable-panel>
      
      <hlm-resizable-handle />
      
      <hlm-resizable-panel>
        <div class="flex flex-col h-full items-center justify-center p-6 text-center bg-transparent hover:bg-white/[0.01] transition-colors">
          <span class="text-3xl font-bold tracking-tight text-white">{{ viewsThisMonth() }}</span>
          <span class="text-xs text-gray-400 mt-2 font-medium">Vistas este mes</span>
        </div>
      </hlm-resizable-panel>
      
      <hlm-resizable-handle />
      
      <hlm-resizable-panel>
        <div class="flex flex-col h-full items-center justify-center p-6 text-center bg-transparent hover:bg-white/[0.01] transition-colors">
          <span class="text-3xl font-bold tracking-tight text-white">{{ reactionsThisMonth() }}</span>
          <span class="text-xs text-gray-400 mt-2 font-medium">Reacciones este mes</span>
        </div>
      </hlm-resizable-panel>
      
      <hlm-resizable-handle />
      
      <hlm-resizable-panel>
        <div class="flex flex-col h-full items-center justify-center p-6 text-center bg-transparent hover:bg-white/[0.01] transition-colors">
          <span class="text-3xl font-bold tracking-tight text-white">{{ failuresThisMonth() }}</span>
          <span class="text-xs text-gray-400 mt-2 font-medium">Fallos este mes</span>
        </div>
      </hlm-resizable-panel>
      
      <hlm-resizable-handle />
      
      <hlm-resizable-panel>
        <div class="flex flex-col h-full items-center justify-center p-6 text-center bg-transparent hover:bg-white/[0.01] transition-colors">
          <span class="text-3xl font-bold tracking-tight text-white">{{ activeChannels() }}</span>
          <span class="text-xs text-gray-400 mt-2 font-medium">Canales activos</span>
        </div>
      </hlm-resizable-panel>

    </hlm-resizable-group>
  `
})
export class ResizableGroupComponent implements OnInit {
  private scheduledPostsService = inject(ScheduledPostsService);
  private postMetricsService = inject(PostMetricsService);
  private auditLogService = inject(AuditLogService);
  private channelsService = inject(ChannelsService);

  postsPublishedThisMonth = signal<number>(0);
  viewsThisMonth = signal<number>(0);
  reactionsThisMonth = signal<number>(0);
  failuresThisMonth = signal<number>(0);
  activeChannels = signal<number>(0);

  async ngOnInit() {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

      // 1. Fetch channels and filter active
      const channels = await this.channelsService.getChannels();
      this.activeChannels.set(channels.filter(c => c.isActive).length);

      // 2. Fetch published posts this month
      const publishedPosts = await this.scheduledPostsService.getPublishedPosts(startOfMonth, endOfMonth);
      this.postsPublishedThisMonth.set(publishedPosts.length);

      // 3. For each post, fetch views and reactions
      let totalViews = 0;
      let totalReactions = 0;
      for (const post of publishedPosts) {
        try {
          const metrics = await this.postMetricsService.getPostMetrics(post.id);
          if (metrics) {
            totalViews += metrics.views || 0;
            const postReactions = Object.values(metrics.reactions || {}).reduce((sum, val) => sum + (val || 0), 0);
            totalReactions += postReactions;
          }
        } catch (metricsErr) {
          console.error(`Error loading metrics for post ${post.id}:`, metricsErr);
        }
      }
      this.viewsThisMonth.set(totalViews);
      this.reactionsThisMonth.set(totalReactions);

      // 4. Fetch failures this month from audit log
      const auditResult = await this.auditLogService.getAuditLog({
        page: 0,
        pageSize: 1,
        action: 'failed',
        from: startOfMonth,
        to: endOfMonth
      });
      this.failuresThisMonth.set(auditResult.total);

    } catch (error) {
      console.error('Error loading dashboard statistics:', error);
    }
  }
}