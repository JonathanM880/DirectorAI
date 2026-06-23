import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartOptions, ChartType } from 'chart.js';
import { MetricsService, ChannelSummary, PostMetric } from '../../core/services/metrics.service';

@Component({
  selector: 'app-metrics',
  standalone: true,
  imports: [CommonModule, FormsModule, BaseChartDirective],
  template: `
    <div class="metrics-container">
      <div class="header">
        <h2>Platform Metrics</h2>
        
        <div class="controls">
          <div class="control-group">
            <label>Channel</label>
            <select [ngModel]="selectedChannel()" (ngModelChange)="onChannelChange($event)">
              <option value="telegram_main">Telegram (Main Channel)</option>
              <option value="twitter_official">X (Official)</option>
              <option value="linkedin_corp">LinkedIn (Corporate)</option>
            </select>
          </div>
          
          <div class="control-group">
            <label>Date Range</label>
            <select [ngModel]="dateRange()" (ngModelChange)="onDateRangeChange($event)">
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="custom">Custom Range...</option>
            </select>
          </div>

          <button class="btn btn-outline" (click)="exportCSV()">
            <span class="icon">⬇️</span> Export CSV
          </button>
        </div>
      </div>

      <div class="kpi-cards" *ngIf="summary()">
        <div class="card">
          <div class="label">Total Views</div>
          <div class="value">{{ summary()?.totalViews | number }}</div>
          <div class="trend positive">↑ 12% vs last period</div>
        </div>
        <div class="card">
          <div class="label">Total Likes</div>
          <div class="value">{{ summary()?.totalLikes | number }}</div>
          <div class="trend positive">↑ 5% vs last period</div>
        </div>
      </div>

      <div class="charts-row">
        <div class="chart-container">
          <h3>Views Trend</h3>
          <canvas baseChart
            [data]="viewsChartData"
            [options]="viewsChartOptions"
            [type]="'line'">
          </canvas>
        </div>
        
        <div class="chart-container">
          <h3>Engagement Rate</h3>
          <canvas baseChart
            [data]="engagementChartData"
            [options]="engagementChartOptions"
            [type]="'bar'">
          </canvas>
        </div>
      </div>

      <div class="table-container">
        <h3>Top Posts</h3>
        <table class="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Content Snippet</th>
              <th>Views</th>
              <th>Likes</th>
            </tr>
          </thead>
          <tbody>
            <tr *ngFor="let post of summary()?.topPosts">
              <td>{{ post.date | date:'shortDate' }}</td>
              <td class="content-cell">{{ post.content }}</td>
              <td>{{ post.views | number }}</td>
              <td>{{ post.likes | number }}</td>
            </tr>
          </tbody>
        </table>
      </div>
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
      margin-bottom: 8px;
    }
    .card .trend {
      font-size: 0.85rem;
    }
    .card .trend.positive { color: var(--color-live); }

    .charts-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
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
  private metricsService = inject(MetricsService);

  selectedChannel = signal('telegram_main');
  dateRange = signal('30');
  
  summary = signal<ChannelSummary | null>(null);

  viewsChartData: ChartConfiguration['data'] = { datasets: [], labels: [] };
  engagementChartData: ChartConfiguration['data'] = { datasets: [], labels: [] };

  viewsChartOptions: ChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#888' } },
      y: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#888' } }
    }
  };

  engagementChartOptions: ChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#888' } },
      y: { grid: { color: 'rgba(255,255,255,0.1)' }, ticks: { color: '#888' } }
    }
  };

  ngOnInit() {
    // Required to register Chart.js components in standalone mode without global register
    // but ng2-charts usually handles it if imported properly.
    this.loadData();
  }

  onChannelChange(channel: string) {
    this.selectedChannel.set(channel);
    this.loadData();
  }

  onDateRangeChange(range: string) {
    if (range === 'custom') {
      // Open date picker logic here
    }
    this.dateRange.set(range);
    this.loadData();
  }

  loadData() {
    this.metricsService.getChannelSummary(this.selectedChannel()).subscribe(data => {
      this.summary.set(data);
    });

    this.metricsService.getEngagementTrend(this.selectedChannel(), 'day').subscribe(trend => {
      this.viewsChartData = {
        labels: trend.labels,
        datasets: [{
          data: trend.data,
          label: 'Views',
          borderColor: '#3ec88a',
          backgroundColor: 'rgba(62, 200, 138, 0.1)',
          fill: true,
          tension: 0.4
        }]
      };
    });

    this.metricsService.getEngagementTrend(this.selectedChannel(), 'week').subscribe(trend => {
      this.engagementChartData = {
        labels: trend.labels,
        datasets: [{
          data: trend.data,
          label: 'Engagement %',
          backgroundColor: '#ffb020'
        }]
      };
    });
  }

  exportCSV() {
    const data = this.summary()?.topPosts;
    if (!data) return;

    const headers = ['Date', 'Content', 'Views', 'Likes'];
    const rows = data.map(post => [
      post.date.toISOString(),
      `"${post.content.replace(/"/g, '""')}"`,
      post.views,
      post.likes
    ]);

    const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `metrics_${this.selectedChannel()}_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
