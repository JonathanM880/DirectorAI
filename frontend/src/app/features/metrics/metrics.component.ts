import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartOptions } from 'chart.js';
import { PostMetricsService } from '../../core/services/post-metrics.service';

@Component({
  selector: 'app-metrics',
  standalone: true,
  imports: [CommonModule, FormsModule, BaseChartDirective],
  template: `
    <div class="p-4 md:p-5 bg-background text-foreground h-full overflow-y-auto">
      <div class="flex justify-between items-center mb-5">
        <h2 class="m-0 text-2xl font-bold font-display">Platform Metrics</h2>
        
        <div class="flex items-end gap-4">
          <div class="flex bg-white/5 rounded-md p-1 gap-1">
            <button class="px-3 py-1.5 rounded text-sm bg-transparent border-none text-muted-foreground cursor-pointer" [class.bg-white]="viewMode() === 'global'" [style.background-opacity]="viewMode() === 'global' ? '0.1' : '0'" [class.text-foreground]="viewMode() === 'global'" [class.shadow-sm]="viewMode() === 'global'" (click)="setViewMode('global')">Global Channel Stats</button>
            <button class="px-3 py-1.5 rounded text-sm bg-transparent border-none text-muted-foreground cursor-pointer" [class.bg-white]="viewMode() === 'individual'" [style.background-opacity]="viewMode() === 'individual' ? '0.1' : '0'" [class.text-foreground]="viewMode() === 'individual'" [class.shadow-sm]="viewMode() === 'individual'" (click)="setViewMode('individual')">Individual Post Analytics</button>
          </div>

          <div class="flex flex-col gap-1">
            <label class="text-sm text-muted-foreground">Channel</label>
            <select disabled class="px-3 py-2 rounded-md border border-border bg-white/5 text-foreground disabled:opacity-50 disabled:cursor-not-allowed">
              <option value="telegram_main">Telegram (Main Channel)</option>
            </select>
          </div>
          
          <button class="px-4 py-2 rounded-md font-medium flex items-center gap-2 cursor-pointer bg-transparent border border-border text-foreground hover:bg-white/5 transition-colors" (click)="exportToCSV()">
            <span class="icon">⬇️</span> Export CSV
          </button>
        </div>
      </div>

      <!-- GLOBAL VIEW -->
      <ng-container *ngIf="viewMode() === 'global'">
        <div *ngIf="isLoading()" class="flex flex-col items-center justify-center p-10 bg-white/5 border border-dashed border-border rounded-lg mt-4 text-muted-foreground">
          <div class="w-10 h-10 border-4 border-white/10 border-t-primary rounded-full animate-spin mb-4"></div>
          <p class="m-0">Loading aggregate metrics...</p>
        </div>

        <div *ngIf="!isLoading() && globalPosts().length === 0" class="flex flex-col items-center justify-center p-10 bg-white/5 border border-dashed border-border rounded-lg mt-4 text-muted-foreground">
          <p class="m-0">No published posts in this period</p>
        </div>

        <ng-container *ngIf="!isLoading() && globalPosts().length > 0">
          <div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-5 mt-4 mb-5">
            <div class="bg-white/5 border border-border p-5 rounded-lg">
              <div class="text-muted-foreground text-sm mb-2">Total Views</div>
              <div class="text-3xl font-bold">{{ globalTotalViews() | number }}</div>
            </div>
            <div class="bg-white/5 border border-border p-5 rounded-lg">
              <div class="text-muted-foreground text-sm mb-2">Total Posts</div>
              <div class="text-3xl font-bold">{{ globalPosts().length | number }}</div>
            </div>
            <div class="bg-white/5 border border-border p-5 rounded-lg">
              <div class="text-muted-foreground text-sm mb-2">Avg Views per Post</div>
              <div class="text-3xl font-bold">{{ (globalTotalViews() / globalPosts().length) | number:'1.0-0' }}</div>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-5 mb-5">
            <div class="bg-white/5 border border-border rounded-lg p-5 h-[300px]">
              <h3 class="mt-0 mb-4 text-lg font-display">Views Trend (Last 30 Days)</h3>
              <canvas baseChart
                [data]="viewsChartData()"
                [options]="viewsChartOptions"
                [type]="'line'">
              </canvas>
            </div>
          </div>

          <div class="bg-white/5 border border-border rounded-lg p-5">
            <h3 class="mt-0 mb-4 text-lg font-display">Published Posts</h3>
            <table class="w-full border-collapse">
              <thead>
                <tr>
                  <th class="p-3 text-left border-b border-border text-muted-foreground font-medium">Date</th>
                  <th class="p-3 text-left border-b border-border text-muted-foreground font-medium">Content Snippet</th>
                  <th class="p-3 text-left border-b border-border text-muted-foreground font-medium">Views</th>
                  <th class="p-3 text-left border-b border-border text-muted-foreground font-medium">Reactions</th>
                  <th class="p-3 text-left border-b border-border text-muted-foreground font-medium">Forwards</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let post of globalPosts()" class="hover:bg-white/5">
                  <td class="p-3 text-left border-b border-border whitespace-nowrap">{{ post.publishedAt | date:'shortDate' }}</td>
                  <td class="p-3 text-left border-b border-border max-w-[300px] whitespace-nowrap overflow-hidden text-ellipsis" [title]="post.content">{{ post.content }}</td>
                  <td class="p-3 text-left border-b border-border">{{ post.views | number }}</td>
                  <td class="p-3 text-left border-b border-border">{{ getReactionsCount(post.reactions) | number }}</td>
                  <td class="p-3 text-left border-b border-border">{{ post.forwards | number }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </ng-container>
      </ng-container>

      <!-- INDIVIDUAL VIEW -->
      <ng-container *ngIf="viewMode() === 'individual'">
        <div *ngIf="individualPostId(); else noPostSelected">
          <div>
            <h3 class="mt-4 mb-4 text-xl font-display font-bold">Individual Post Analytics</h3>
            
            <div *ngIf="isLoading()" class="flex flex-col items-center justify-center p-10 bg-white/5 border border-dashed border-border rounded-lg mt-4 text-muted-foreground">
              <div class="w-10 h-10 border-4 border-white/10 border-t-primary rounded-full animate-spin mb-4"></div>
              <p class="m-0">Loading real Telegram data...</p>
            </div>

            <div *ngIf="!isLoading() && individualMetrics() === null" class="flex flex-col items-center justify-center p-10 bg-white/5 border border-dashed border-border rounded-lg mt-4 text-muted-foreground">
              <p class="m-0 mb-2">No engagement data available yet</p>
              <small class="opacity-70">The Telegram API request returned no views/reactions for this post.</small>
            </div>

            <div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-5 mt-4 mb-5" *ngIf="!isLoading() && individualMetrics() !== null">
              <div class="bg-white/5 border border-border p-5 rounded-lg">
                <div class="text-muted-foreground text-sm mb-2">Post Views</div>
                <div class="text-3xl font-bold">{{ individualMetrics()?.views !== null && individualMetrics()?.views !== undefined ? (individualMetrics()?.views | number) : 'N/A' }}</div>
              </div>
              <div class="bg-white/5 border border-border p-5 rounded-lg">
                <div class="text-muted-foreground text-sm mb-2">Reactions</div>
                <div class="text-3xl font-bold">{{ getReactionsCount(individualMetrics()?.reactions) !== null ? (getReactionsCount(individualMetrics()?.reactions) | number) : 'N/A' }}</div>
                
                <div class="flex gap-2 flex-wrap mt-3" *ngIf="getReactionsCount(individualMetrics()?.reactions)">
                  <div class="bg-white/5 px-2 py-1 rounded-full text-sm flex items-center gap-1 border border-border" *ngFor="let entry of getReactionEntries(individualMetrics()?.reactions)">
                    <span>{{ entry.emoji }}</span>
                    <span>{{ entry.count }}</span>
                  </div>
                </div>
              </div>
              <div class="bg-white/5 border border-border p-5 rounded-lg">
                <div class="text-muted-foreground text-sm mb-2">Forwards</div>
                <div class="text-3xl font-bold">{{ individualMetrics()?.forwards !== null && individualMetrics()?.forwards !== undefined ? (individualMetrics()?.forwards | number) : 'N/A' }}</div>
              </div>
              <div class="bg-white/5 border border-border p-5 rounded-lg">
                <div class="text-muted-foreground text-sm mb-2">Replies</div>
                <div class="text-3xl font-bold">{{ individualMetrics()?.replies !== null && individualMetrics()?.replies !== undefined ? (individualMetrics()?.replies | number) : 'N/A' }}</div>
              </div>
            </div>
          </div>
        </div>

        <ng-template #noPostSelected>
          <div class="flex flex-col items-center justify-center p-10 bg-white/5 border border-dashed border-border rounded-lg mt-4 text-muted-foreground">
            <p class="m-0 mb-2">No post selected.</p>
            <small class="opacity-70">Please navigate from the Calendar by clicking "View Metrics" on a specific post.</small>
          </div>
        </ng-template>
      </ng-container>
    </div>
  `,
  styles: []
})
export class MetricsComponent implements OnInit {
  private postMetricsService = inject(PostMetricsService);

  viewMode = signal<'global' | 'individual'>('global');
  individualPostId = signal<string | null>(null);
  individualMetrics = signal<any | null>(null);
  globalPosts = signal<any[]>([]);
  isLoading = signal<boolean>(false);

  viewsChartOptions: ChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888' } },
      y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#888' } }
    }
  };

  viewsChartData = computed<ChartConfiguration['data']>(() => {
    const posts = this.globalPosts();
    const sorted = [...posts].sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());
    
    return {
      labels: sorted.map(p => p.publishedAt.toLocaleDateString()),
      datasets: [{
        data: sorted.map(p => p.views || 0),
        label: 'Views',
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34, 197, 94, 0.2)',
        fill: true,
        tension: 0.4
      }]
    };
  });

  globalTotalViews = computed(() => {
    return this.globalPosts().reduce((acc, p) => acc + (p.views || 0), 0);
  });

  constructor() {
    const nav = window.history.state;
    if (nav && nav.postId) {
      this.individualPostId.set(nav.postId);
      this.viewMode.set('individual');
    }
  }

  ngOnInit() {
    this.loadAggregateData();
    if (this.individualPostId()) {
      this.loadIndividualData();
    }
  }

  setViewMode(mode: 'global' | 'individual') {
    this.viewMode.set(mode);
  }

  async loadAggregateData() {
    this.isLoading.set(true);
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const metrics = await this.postMetricsService.getAggregateMetrics(thirtyDaysAgo, now);
      this.globalPosts.set(metrics || []);
    } catch (e) {
      console.error('Failed to load aggregate metrics', e);
      this.globalPosts.set([]);
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadIndividualData() {
    const postId = this.individualPostId();
    if (postId) {
      this.isLoading.set(true);
      try {
        const metrics = await this.postMetricsService.fetchTelegramMetrics(postId);
        this.individualMetrics.set(metrics);
      } catch (e) {
        console.error('Failed to load individual metrics', e);
        this.individualMetrics.set(null);
      } finally {
        this.isLoading.set(false);
      }
    }
  }

  getReactionsCount(reactions: any): number | null {
    if (reactions === null || reactions === undefined) return null;
    let total = 0;
    if (typeof reactions === 'object' && reactions !== null) {
      for (const val of Object.values(reactions)) {
        if (typeof val === 'number') total += val;
      }
    }
    return total;
  }

  getReactionEntries(reactions: any): { emoji: string, count: number }[] {
    if (reactions === null || reactions === undefined) return [];
    const entries: { emoji: string, count: number }[] = [];
    if (typeof reactions === 'object' && reactions !== null) {
      for (const [key, val] of Object.entries(reactions)) {
        if (typeof val === 'number') {
          entries.push({ emoji: key, count: val });
        }
      }
    }
    return entries;
  }

  exportToCSV() {
    const mode = this.viewMode();
    let rows: any[] = [];
    const headers = ['Date', 'Content', 'Views', 'Reactions', 'Forwards'];

    if (mode === 'global') {
      const posts = this.globalPosts();
      if (!posts.length) return;
      rows = posts.map(post => [
        post.publishedAt.toISOString(),
        `"${(post.content || '').replace(/"/g, '""')}"`,
        post.views || 0,
        this.getReactionsCount(post.reactions) || 0,
        post.forwards || 0
      ]);
    } else {
      const metrics = this.individualMetrics();
      if (!metrics) return;
      rows = [[
        new Date().toISOString(),
        'Individual Post',
        metrics.views || 0,
        this.getReactionsCount(metrics.reactions) || 0,
        metrics.forwards || 0
      ]];
    }

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `metrics_telegram_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
