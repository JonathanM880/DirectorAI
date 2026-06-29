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
    <div class="metrics-container">
      <div class="header">
        <h2>Platform Metrics</h2>
        
        <div class="controls">
          <div class="view-toggle">
            <button class="btn" [class.btn-active]="viewMode() === 'global'" (click)="setViewMode('global')">Global Channel Stats</button>
            <button class="btn" [class.btn-active]="viewMode() === 'individual'" (click)="setViewMode('individual')">Individual Post Analytics</button>
          </div>

          <div class="control-group">
            <label>Channel</label>
            <select disabled>
              <option value="telegram_main">Telegram (Main Channel)</option>
            </select>
          </div>
          
          <button class="btn btn-outline" (click)="exportToCSV()">
            <span class="icon">⬇️</span> Export CSV
          </button>
        </div>
      </div>

      <!-- GLOBAL VIEW -->
      <ng-container *ngIf="viewMode() === 'global'">
        <div *ngIf="isLoading()" class="loading-state">
          <div class="spinner"></div>
          <p>Loading aggregate metrics...</p>
        </div>

        <div *ngIf="!isLoading() && globalPosts().length === 0" class="empty-state">
          <p>No published posts in this period</p>
        </div>

        <ng-container *ngIf="!isLoading() && globalPosts().length > 0">
          <div class="kpi-cards">
            <div class="card">
              <div class="label">Total Views</div>
              <div class="value">{{ globalTotalViews() | number }}</div>
            </div>
            <div class="card">
              <div class="label">Total Posts</div>
              <div class="value">{{ globalPosts().length | number }}</div>
            </div>
            <div class="card">
              <div class="label">Avg Views per Post</div>
              <div class="value">{{ (globalTotalViews() / globalPosts().length) | number:'1.0-0' }}</div>
            </div>
          </div>

          <div class="charts-row">
            <div class="chart-container">
              <h3>Views Trend (Last 30 Days)</h3>
              <canvas baseChart
                [data]="viewsChartData()"
                [options]="viewsChartOptions"
                [type]="'line'">
              </canvas>
            </div>
          </div>

          <div class="table-container">
            <h3>Published Posts</h3>
            <table class="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Content Snippet</th>
                  <th>Views</th>
                  <th>Reactions</th>
                  <th>Forwards</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let post of globalPosts()">
                  <td>{{ post.publishedAt | date:'shortDate' }}</td>
                  <td class="content-cell" [title]="post.content">{{ post.content }}</td>
                  <td>{{ post.views | number }}</td>
                  <td>{{ getReactionsCount(post.reactions) | number }}</td>
                  <td>{{ post.forwards | number }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </ng-container>
      </ng-container>

      <!-- INDIVIDUAL VIEW -->
      <ng-container *ngIf="viewMode() === 'individual'">
        <div *ngIf="individualPostId(); else noPostSelected">
          <div class="individual-view">
            <h3>Individual Post Analytics</h3>
            
            <div *ngIf="isLoading()" class="loading-state">
              <div class="spinner"></div>
              <p>Loading real Telegram data...</p>
            </div>

            <div *ngIf="!isLoading() && individualMetrics() === null" class="empty-state">
              <p>No engagement data available yet</p>
              <small>The Telegram API request returned no views/reactions for this post.</small>
            </div>

            <div class="kpi-cards" *ngIf="!isLoading() && individualMetrics() !== null">
              <div class="card">
                <div class="label">Post Views</div>
                <div class="value">{{ individualMetrics()?.views !== null && individualMetrics()?.views !== undefined ? (individualMetrics()?.views | number) : 'N/A' }}</div>
              </div>
              <div class="card">
                <div class="label">Reactions</div>
                <div class="value">{{ getReactionsCount(individualMetrics()?.reactions) !== null ? (getReactionsCount(individualMetrics()?.reactions) | number) : 'N/A' }}</div>
                
                <div class="reaction-bar" *ngIf="getReactionsCount(individualMetrics()?.reactions)">
                  <div class="reaction-pill" *ngFor="let entry of getReactionEntries(individualMetrics()?.reactions)">
                    <span class="emoji">{{ entry.emoji }}</span>
                    <span class="count">{{ entry.count }}</span>
                  </div>
                </div>
              </div>
              <div class="card">
                <div class="label">Forwards</div>
                <div class="value">{{ individualMetrics()?.forwards !== null && individualMetrics()?.forwards !== undefined ? (individualMetrics()?.forwards | number) : 'N/A' }}</div>
              </div>
              <div class="card">
                <div class="label">Replies</div>
                <div class="value">{{ individualMetrics()?.replies !== null && individualMetrics()?.replies !== undefined ? (individualMetrics()?.replies | number) : 'N/A' }}</div>
              </div>
            </div>
          </div>
        </div>

        <ng-template #noPostSelected>
          <div class="empty-state">
            <p>No post selected.</p>
            <small>Please navigate from the Calendar by clicking "View Metrics" on a specific post.</small>
          </div>
        </ng-template>
      </ng-container>
    </div>
  `,
  styles: [`
    .metrics-container {
      padding: var(--space-4) var(--space-5);
      background: var(--color-ink);
      color: var(--color-paper);
      height: 100%;
      overflow-y: auto;
    }
    .reaction-bar {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 12px;
    }
    .reaction-pill {
      background: rgba(255, 255, 255, 0.05);
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 0.85rem;
      display: flex;
      align-items: center;
      gap: 4px;
      border: 1px solid var(--color-steel);
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: var(--space-5);
    }
    .controls {
      display: flex;
      gap: 16px;
      align-items: flex-end;
    }
    .view-toggle {
      display: flex;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 6px;
      padding: 4px;
      gap: 4px;
    }
    .view-toggle .btn {
      background: transparent;
      border: none;
      color: var(--color-gray-300);
      padding: 6px 12px;
      font-size: 0.85rem;
    }
    .view-toggle .btn.btn-active {
      background: var(--color-steel);
      color: var(--color-paper);
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    }
    .control-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .control-group label {
      font-size: 0.85rem;
      color: var(--color-gray-300);
    }
    select {
      padding: 8px 12px;
      border-radius: 6px;
      border: 1px solid var(--color-steel);
      background: rgba(255, 255, 255, 0.05);
      color: var(--color-paper);
    }
    select:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .btn {
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .btn-outline {
      background: transparent;
      border: 1px solid var(--color-steel);
      color: var(--color-paper);
    }
    .btn-outline:hover {
      background: rgba(255, 255, 255, 0.05);
    }
    .kpi-cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      gap: 20px;
      margin-top: var(--space-4);
      margin-bottom: var(--space-5);
    }
    .card {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--color-steel);
      padding: 20px;
      border-radius: 8px;
    }
    .card .label {
      color: var(--color-gray-300);
      font-size: 0.9rem;
      margin-bottom: 8px;
    }
    .card .value {
      font-size: 2rem;
      font-weight: 700;
    }
    .loading-state, .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px;
      background: rgba(255, 255, 255, 0.02);
      border: 1px dashed var(--color-steel);
      border-radius: 8px;
      margin-top: var(--space-4);
      color: var(--color-gray-300);
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid rgba(255,255,255,0.1);
      border-radius: 50%;
      border-top-color: var(--color-live);
      animation: spin 1s ease-in-out infinite;
      margin-bottom: 16px;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .charts-row {
      display: grid;
      grid-template-columns: 1fr;
      gap: 20px;
      margin-bottom: var(--space-5);
    }
    .chart-container {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--color-steel);
      border-radius: 8px;
      padding: 20px;
      height: 300px;
    }
    .chart-container h3 {
      margin-top: 0;
      margin-bottom: 16px;
      font-size: 1.1rem;
    }
    .table-container {
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--color-steel);
      border-radius: 8px;
      padding: 20px;
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
    }
    .data-table th, .data-table td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid var(--color-steel);
    }
    .data-table th {
      color: var(--color-gray-300);
      font-weight: 500;
    }
    .content-cell {
      max-width: 300px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `]
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
