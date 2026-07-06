import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartOptions } from 'chart.js';
import { PostMetricsService } from '../../core/services/post-metrics.service';
import { PostMetrics, PostAnalytics } from '@director-ai/types';

type DatePreset = '7d' | '30d' | 'all';

@Component({
  selector: 'app-metrics',
  standalone: true,
  imports: [CommonModule, FormsModule, BaseChartDirective],
  template: `
    <div class="p-4 md:p-8 bg-background text-foreground min-h-screen">
      <div class="mx-auto" [style.max-width.px]="1280">
        <div class="flex flex-col gap-8 w-full">

          <!-- Page Title & Header Actions -->
          <div class="flex justify-between items-center flex-wrap gap-4">
            <h2 class="text-2xl font-bold text-white">Métricas</h2>
            <div class="flex flex-wrap items-center gap-4">
              <div class="flex bg-secondary p-1 rounded-lg gap-1">
                <button class="px-3 py-1.5 rounded text-sm bg-transparent border-none text-muted-foreground cursor-pointer" [class.bg-white/10]="viewMode() === 'global'" [class.text-white]="viewMode() === 'global'" [class.font-semibold]="viewMode() === 'global'" (click)="setViewMode('global')">Estadísticas globales</button>
                <button class="px-3 py-1.5 rounded text-sm bg-transparent border-none text-muted-foreground cursor-pointer" [class.bg-white/10]="viewMode() === 'individual'" [class.text-white]="viewMode() === 'individual'" [class.font-semibold]="viewMode() === 'individual'" (click)="setViewMode('individual')">Análisis de publicaciones</button>
              </div>
              <button class="px-4 py-2.5 rounded-md font-semibold flex items-center gap-2 cursor-pointer bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors border-none" (click)="exportToCSV()">
                <span class="icon">&#11015;&#65039;</span> Exportar CSV
              </button>
            </div>
          </div>

          <!-- GLOBAL VIEW -->
          <ng-container *ngIf="viewMode() === 'global'">
            <div class="flex flex-wrap items-center gap-2">
              <button class="px-3 py-1.5 rounded-md text-sm border-none cursor-pointer transition-colors" [class.bg-primary]="datePreset() === '7d'" [class.text-white]="datePreset() === '7d'" [class.bg-secondary]="datePreset() !== '7d'" [class.text-muted-foreground]="datePreset() !== '7d'" (click)="setDatePreset('7d')">Últimos 7 días</button>
              <button class="px-3 py-1.5 rounded-md text-sm border-none cursor-pointer transition-colors" [class.bg-primary]="datePreset() === '30d'" [class.text-white]="datePreset() === '30d'" [class.bg-secondary]="datePreset() !== '30d'" [class.text-muted-foreground]="datePreset() !== '30d'" (click)="setDatePreset('30d')">Últimos 30 días</button>
              <button class="px-3 py-1.5 rounded-md text-sm border-none cursor-pointer transition-colors" [class.bg-primary]="datePreset() === 'all'" [class.text-white]="datePreset() === 'all'" [class.bg-secondary]="datePreset() !== 'all'" [class.text-muted-foreground]="datePreset() !== 'all'" (click)="setDatePreset('all')">Todo</button>
            </div>

            <div *ngIf="isLoading()" class="flex flex-col items-center justify-center p-10 border border-dashed border-border rounded-3xl mt-4 text-muted-foreground bg-transparent">
              <div class="w-10 h-10 border-4 border-white/10 border-t-primary rounded-full animate-spin mb-4"></div>
              <p class="m-0">Cargando métricas agregadas...</p>
            </div>

            <div *ngIf="!isLoading() && globalPosts().length === 0" class="flex flex-col items-center justify-center p-10 border border-dashed border-border rounded-3xl mt-4 text-muted-foreground bg-transparent">
              <p class="m-0">No hay publicaciones publicadas en este periodo</p>
            </div>

            <ng-container *ngIf="!isLoading() && globalPosts().length > 0">
              <!-- KPI Cards Grid -->
              <div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-8 w-full items-stretch">
                <div class="border border-border rounded-3xl p-6 bg-transparent flex flex-col justify-center">
                  <div class="text-muted-foreground text-sm mb-2 font-medium">Vistas totales</div>
                  <div class="text-3xl font-bold text-white">{{ globalTotalViews() | number }}</div>
                </div>
                <div class="border border-border rounded-3xl p-6 bg-transparent flex flex-col justify-center">
                  <div class="text-muted-foreground text-sm mb-2 font-medium">Publicaciones totales</div>
                  <div class="text-3xl font-bold text-white">{{ totalPosts() | number }}</div>
                </div>
                <div class="border border-border rounded-3xl p-6 bg-transparent flex flex-col justify-center">
                  <div class="text-muted-foreground text-sm mb-2 font-medium">Promedio de vistas por publicación</div>
                  <div class="text-3xl font-bold text-white">{{ (globalTotalViews() / globalPosts().length) | number:'1.0-0' }}</div>
                </div>
              </div>

              <!-- Chart Card -->
              <div class="w-full border border-border rounded-3xl p-6 bg-transparent h-[350px]">
                <h3 class="mt-0 mb-4 text-lg font-bold text-white">Tendencia de vistas</h3>
                <div class="w-full h-[250px]">
                  <canvas baseChart
                    [data]="viewsChartData()"
                    [options]="viewsChartOptions"
                    [type]="'line'">
                  </canvas>
                </div>
              </div>
            </ng-container>
          </ng-container>

          <!-- INDIVIDUAL VIEW -->
          <ng-container *ngIf="viewMode() === 'individual'">
            <div class="flex items-center gap-4">
              <h3 class="text-xl font-bold text-white">Análisis de publicaciones</h3>
            </div>
          </ng-container>

          <!-- SHARED TABLE (shown in both views when there are posts) -->
          <ng-container *ngIf="globalPosts().length > 0">
            <!-- Table Card -->
            <div class="w-full border border-border rounded-3xl p-6 bg-transparent flex flex-col">
              <h3 class="mt-0 mb-4 text-lg font-bold text-white">Publicaciones publicadas</h3>
              <div class="w-full overflow-hidden border border-border rounded-2xl bg-transparent">
                <table class="w-full border-collapse text-left">
                  <thead class="bg-white/[0.02] border-b border-border">
                    <tr>
                      <th class="p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Fecha</th>
                      <th class="p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Fragmento de contenido</th>
                      <th class="p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Vistas</th>
                      <th class="p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Reacciones</th>
                      <th class="p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Reenvíos</th>
                      <th class="p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr *ngFor="let post of globalPosts()" class="hover:bg-white/[0.03] border-t border-border transition-colors cursor-pointer" [class.bg-white/[0.05]]="selectedPostId() === post.id" (click)="selectPost(post.id)">
                      <td class="p-3 text-white whitespace-nowrap text-xs">{{ post.publishedAt | date:'shortDate' }}</td>
                      <td class="p-3 text-white max-w-[300px] whitespace-nowrap overflow-hidden text-ellipsis text-xs" [title]="post.content">{{ post.content }}</td>
                      <td class="p-3 text-white text-xs">{{ post.views | number }}</td>
                      <td class="p-3 text-white text-xs">{{ getReactionsCount(post.reactions) | number }}</td>
                      <td class="p-3 text-white text-xs">{{ post.forwards | number }}</td>
                      <td class="p-3 text-white text-xs text-right">
                        <span class="text-primary hover:underline">Ver métricas</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <!-- Pagination -->
              <div class="flex items-center justify-between mt-4">
                <span class="text-sm text-muted-foreground">
                  Página {{ currentPage() }} de {{ totalPages() }} ({{ totalPosts() }} publicaciones)
                </span>
                <div class="flex gap-2">
                  <button class="px-3 py-1.5 rounded-md text-sm border border-border bg-transparent text-muted-foreground cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/5 transition-colors" [disabled]="currentPage() <= 1" (click)="prevPage()">Anterior</button>
                  <button class="px-3 py-1.5 rounded-md text-sm border border-border bg-transparent text-muted-foreground cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed hover:bg-white/5 transition-colors" [disabled]="currentPage() >= totalPages()" (click)="nextPage()">Siguiente</button>
                </div>
              </div>

              <!-- Selected post analytics -->
              <div *ngIf="selectedPostAnalytics()" class="mt-6 border border-border rounded-3xl p-6 bg-transparent">
                <div class="flex items-center justify-between mb-4">
                  <h4 class="text-lg font-bold text-white">Métricas de la publicación</h4>
                  <button class="px-3 py-1 rounded-md text-sm bg-secondary text-secondary-foreground border-none cursor-pointer hover:bg-secondary/80 transition-colors" (click)="clearSelectedPost()">Cerrar</button>
                </div>
                <div *ngIf="selectedPostLoading()" class="flex items-center justify-center p-6 text-muted-foreground">
                  <div class="w-6 h-6 border-2 border-white/10 border-t-primary rounded-full animate-spin mr-2"></div>
                  Cargando...
                </div>
                <div *ngIf="!selectedPostLoading() && selectedPostAnalytics()" class="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-6 w-full items-stretch">
                  <div class="border border-border rounded-2xl p-4 bg-transparent flex flex-col justify-center">
                    <div class="text-muted-foreground text-xs mb-1 font-medium">Fecha de publicación</div>
                    <div class="text-2xl font-bold text-white">{{ selectedPostAnalytics()?.publishedAt | date:'short' }}</div>
                  </div>
                  <div class="border border-border rounded-2xl p-4 bg-transparent flex flex-col justify-center">
                    <div class="text-muted-foreground text-xs mb-1 font-medium">Tiempo en vivo</div>
                    <div class="text-2xl font-bold text-white">{{ selectedPostAnalytics()?.timeSincePublished }}</div>
                  </div>
                  <div class="border border-border rounded-2xl p-4 bg-transparent flex flex-col justify-center">
                    <div class="text-muted-foreground text-xs mb-1 font-medium"># Post en canal</div>
                    <div class="text-2xl font-bold text-white">{{ selectedPostAnalytics()?.postNumberInChannel | number }}</div>
                  </div>
                  <div class="border border-border rounded-2xl p-4 bg-transparent flex flex-col justify-center">
                    <div class="text-muted-foreground text-xs mb-1 font-medium">Canal</div>
                    <div class="text-2xl font-bold text-white truncate">{{ selectedPostAnalytics()?.channelName }}</div>
                  </div>
                  <div class="border border-border rounded-2xl p-4 bg-transparent flex flex-col justify-center">
                    <div class="text-muted-foreground text-xs mb-1 font-medium">Hora de publicación</div>
                    <div class="text-2xl font-bold text-white">{{ selectedPostAnalytics()?.publishHour }}</div>
                  </div>
                  <div class="border border-border rounded-2xl p-4 bg-transparent flex flex-col justify-center">
                    <div class="text-muted-foreground text-xs mb-1 font-medium">Día de la semana</div>
                    <div class="text-2xl font-bold text-white">{{ selectedPostAnalytics()?.publishDayOfWeek }}</div>
                  </div>
                  <div class="border border-border rounded-2xl p-4 bg-transparent flex flex-col justify-center">
                    <div class="text-muted-foreground text-xs mb-1 font-medium">Tipo de contenido</div>
                    <div class="text-2xl font-bold text-white">{{ selectedPostAnalytics()?.contentType }}</div>
                  </div>
                  <div class="border border-border rounded-2xl p-4 bg-transparent flex flex-col justify-center">
                    <div class="text-muted-foreground text-xs mb-1 font-medium">Intentos</div>
                    <div class="text-2xl font-bold text-white">{{ selectedPostAnalytics()?.attempts | number }}</div>
                  </div>
                </div>
              </div>

              <!-- Selected post legacy metrics (from post_metrics table) -->
              <div *ngIf="selectedPostMetrics() && !selectedPostAnalytics()" class="mt-6 border border-border rounded-3xl p-6 bg-transparent">
                <div class="flex items-center justify-between mb-4">
                  <h4 class="text-lg font-bold text-white">Interacción de la publicación</h4>
                  <button class="px-3 py-1 rounded-md text-sm bg-secondary text-secondary-foreground border-none cursor-pointer hover:bg-secondary/80 transition-colors" (click)="clearSelectedPost()">Cerrar</button>
                </div>
                <div class="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-6 w-full items-stretch">
                  <div class="border border-border rounded-2xl p-4 bg-transparent flex flex-col justify-center">
                    <div class="text-muted-foreground text-xs mb-1 font-medium">Vistas</div>
                    <div class="text-2xl font-bold text-white">{{ selectedPostMetrics()?.views ?? 'N/A' }}</div>
                  </div>
                  <div class="border border-border rounded-2xl p-4 bg-transparent flex flex-col justify-center">
                    <div class="text-muted-foreground text-xs mb-1 font-medium">Reacciones</div>
                    <div class="text-2xl font-bold text-white">{{ getReactionsCount(selectedPostMetrics()?.reactions) ?? 'N/A' }}</div>
                    <div class="flex gap-2 flex-wrap mt-2" *ngIf="getReactionsCount(selectedPostMetrics()?.reactions)">
                      <div class="bg-white/5 px-2 py-0.5 rounded-full text-xs flex items-center gap-1 border border-border text-white" *ngFor="let entry of getReactionEntries(selectedPostMetrics()?.reactions)">
                        <span>{{ entry.emoji }}</span>
                        <span>{{ entry.count }}</span>
                      </div>
                    </div>
                  </div>
                  <div class="border border-border rounded-2xl p-4 bg-transparent flex flex-col justify-center">
                    <div class="text-muted-foreground text-xs mb-1 font-medium">Reenvíos</div>
                    <div class="text-2xl font-bold text-white">{{ selectedPostMetrics()?.forwards ?? 'N/A' }}</div>
                  </div>
                  <div class="border border-border rounded-2xl p-4 bg-transparent flex flex-col justify-center">
                    <div class="text-muted-foreground text-xs mb-1 font-medium">Respuestas</div>
                    <div class="text-2xl font-bold text-white">{{ selectedPostMetrics()?.replies ?? 'N/A' }}</div>
                  </div>
                </div>
              </div>
            </div>
          </ng-container>

          <!-- Empty state (only in individual view, when no posts exist) -->
          <ng-container *ngIf="viewMode() === 'individual' && globalPosts().length === 0 && !isLoading()">
            <div class="flex flex-col items-center justify-center p-10 border border-dashed border-border rounded-3xl text-muted-foreground bg-transparent">
              <p class="m-0 mb-2">No hay publicaciones publicadas</p>
              <small class="opacity-70">Las publicaciones aparecerán aquí una vez que se hayan publicado.</small>
            </div>
          </ng-container>
        </div>
      </div>
    </div>
  `,
  styles: []
})
export class MetricsComponent implements OnInit {
  private postMetricsService = inject(PostMetricsService);

  viewMode = signal<'global' | 'individual'>('global');
  globalPosts = signal<any[]>([]);
  isLoading = signal<boolean>(false);
  currentPage = signal<number>(1);
  totalPostsCount = signal<number>(0);
  datePreset = signal<DatePreset>('30d');

  selectedPostId = signal<string | null>(null);
  selectedPostAnalytics = signal<PostAnalytics | null>(null);
  selectedPostMetrics = signal<PostMetrics | null>(null);
  selectedPostLoading = signal<boolean>(false);

  readonly pageSize = 5;

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
        label: 'Vistas',
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

  totalPosts = computed(() => this.totalPostsCount());

  totalPages = computed(() => Math.max(1, Math.ceil(this.totalPosts() / this.pageSize)));

  constructor() {
    const nav = window.history.state;
    if (nav && nav.postId) {
      this.selectedPostId.set(nav.postId);
      this.viewMode.set('individual');
    }
  }

  ngOnInit() {
    this.loadAggregateData();
  }

  setViewMode(mode: 'global' | 'individual') {
    this.viewMode.set(mode);
  }

  setDatePreset(preset: DatePreset) {
    this.datePreset.set(preset);
    this.currentPage.set(1);
    this.loadAggregateData();
  }

  private getDateRange(): { start: Date; end: Date } {
    const now = new Date();
    const preset = this.datePreset();
    if (preset === '7d') return { start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), end: now };
    if (preset === '30d') return { start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000), end: now };
    return { start: new Date('2020-01-01'), end: now };
  }

  nextPage() {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.update(p => p + 1);
      this.loadAggregateData();
    }
  }

  prevPage() {
    if (this.currentPage() > 1) {
      this.currentPage.update(p => p - 1);
      this.loadAggregateData();
    }
  }

  async selectPost(postId: string) {
    this.selectedPostId.set(postId);
    this.selectedPostLoading.set(true);
    this.selectedPostAnalytics.set(null);
    this.selectedPostMetrics.set(null);
    try {
      const [analytics, metrics] = await Promise.all([
        this.postMetricsService.getPostAnalytics(postId),
        this.postMetricsService.getPostMetrics(postId)
      ]);
      this.selectedPostAnalytics.set(analytics);
      this.selectedPostMetrics.set(metrics);
    } catch (e) {
      console.error('Failed to load post data', e);
      this.selectedPostAnalytics.set(null);
      this.selectedPostMetrics.set(null);
    } finally {
      this.selectedPostLoading.set(false);
    }
  }

  clearSelectedPost() {
    this.selectedPostId.set(null);
    this.selectedPostAnalytics.set(null);
    this.selectedPostMetrics.set(null);
  }

  async loadAggregateData() {
    this.isLoading.set(true);
    try {
      const { start, end } = this.getDateRange();
      const result = await this.postMetricsService.getAggregateMetrics(start, end, this.currentPage(), this.pageSize);
      this.globalPosts.set(result.posts);
      this.totalPostsCount.set(result.total);
    } catch (e) {
      console.error('Failed to load aggregate metrics', e);
      this.globalPosts.set([]);
      this.totalPostsCount.set(0);
    } finally {
      this.isLoading.set(false);
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
    const rows = this.globalPosts();
    if (!rows.length) return;
    const headers = ['Fecha', 'Contenido', 'Vistas', 'Reacciones', 'Reenvios'];
    const csvRows = rows.map(post => [
      post.publishedAt.toISOString(),
      `"${(post.content || '').replace(/"/g, '""')}"`,
      post.views || 0,
      this.getReactionsCount(post.reactions) || 0,
      post.forwards || 0
    ]);
    const csvContent = [headers.join(','), ...csvRows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `metricas_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}