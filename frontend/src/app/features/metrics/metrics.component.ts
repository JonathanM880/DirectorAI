import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PostMetricsService } from '../../core/services/post-metrics.service';
import { PostAnalytics, Channel } from '@director-ai/types';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartOptions } from 'chart.js';
import { ChannelsService } from '../../core/services/channels.service';

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
              <div class="relative">
                <button 
                  class="px-4 py-2.5 rounded-md font-semibold flex items-center gap-2 cursor-pointer bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors border-none disabled:opacity-50 disabled:cursor-not-allowed" 
                  [disabled]="totalPosts() === 0"
                  (click)="exportPanelOpen.set(!exportPanelOpen())">
                  <span>&#11015;&#65039;</span> Exportar CSV
                </button>
                <div *ngIf="exportPanelOpen() && totalPosts() > 0" class="absolute right-0 top-full mt-2 z-50 bg-secondary border border-border rounded-2xl p-4 min-w-[280px] shadow-xl">
                  <div class="flex flex-col gap-3">
                    <button class="w-full px-4 py-2 rounded-md text-sm bg-primary text-primary-foreground border-none cursor-pointer hover:opacity-90 transition-opacity" (click)="exportCurrentRange()">Exportar página actual</button>
                    <button class="w-full px-4 py-2 rounded-md text-sm bg-primary text-primary-foreground border-none cursor-pointer hover:opacity-90 transition-opacity" (click)="exportAllInRange()">Exportar todo ({{ datePresetLabel() }})</button>
                    <div class="border-t border-border my-1"></div>
                    <label class="text-xs text-muted-foreground">Rango personalizado</label>
                    <div class="flex gap-2 items-center">
                      <input type="date" [ngModel]="exportDateFrom()" (ngModelChange)="exportDateFrom.set($event)" class="flex-1 px-2 py-1.5 rounded text-xs bg-background border border-border text-white">
                      <span class="text-muted-foreground text-xs">a</span>
                      <input type="date" [ngModel]="exportDateTo()" (ngModelChange)="exportDateTo.set($event)" class="flex-1 px-2 py-1.5 rounded text-xs bg-background border border-border text-white">
                    </div>
                    <button class="w-full px-4 py-2 rounded-md text-sm bg-primary text-primary-foreground border-none cursor-pointer hover:opacity-90 transition-opacity" [disabled]="!exportDateFrom() || !exportDateTo()" (click)="exportCustomRange()">Exportar rango</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- GLOBAL VIEW -->
          <ng-container *ngIf="viewMode() === 'global'">
            <div class="flex flex-wrap items-center gap-4 mb-2">
              <div class="flex items-center gap-2">
                <button class="px-3 py-1.5 rounded-md text-sm border-none cursor-pointer transition-colors" [class.bg-primary]="datePreset() === '7d'" [class.text-white]="datePreset() === '7d'" [class.bg-secondary]="datePreset() !== '7d'" [class.text-muted-foreground]="datePreset() !== '7d'" (click)="setDatePreset('7d')">Últimos 7 días</button>
                <button class="px-3 py-1.5 rounded-md text-sm border-none cursor-pointer transition-colors" [class.bg-primary]="datePreset() === '30d'" [class.text-white]="datePreset() === '30d'" [class.bg-secondary]="datePreset() !== '30d'" [class.text-muted-foreground]="datePreset() !== '30d'" (click)="setDatePreset('30d')">Últimos 30 días</button>
                <button class="px-3 py-1.5 rounded-md text-sm border-none cursor-pointer transition-colors" [class.bg-primary]="datePreset() === 'all'" [class.text-white]="datePreset() === 'all'" [class.bg-secondary]="datePreset() !== 'all'" [class.text-muted-foreground]="datePreset() !== 'all'" (click)="setDatePreset('all')">Todo</button>
              </div>
              <div class="flex-1"></div>
              <select [ngModel]="selectedChannelId()" (ngModelChange)="setChannelFilter($event)" class="px-3 py-2 rounded-md bg-secondary border-none text-white text-sm cursor-pointer outline-none min-w-[200px]">
                <option value="all">Todos los canales</option>
                <option *ngFor="let ch of channels()" [value]="ch.id">{{ ch.name }}</option>
              </select>
            </div>

            <div *ngIf="isLoading()" class="flex flex-col items-center justify-center p-10 border border-dashed border-border rounded-3xl mt-4 text-muted-foreground bg-transparent">
              <div class="w-10 h-10 border-4 border-white/10 border-t-primary rounded-full animate-spin mb-4"></div>
              <p class="m-0">Cargando publicaciones...</p>
            </div>

            <div *ngIf="!isLoading() && apiError()" class="flex flex-col items-center justify-center p-10 border border-dashed border-destructive/50 rounded-3xl mt-4 text-destructive bg-transparent">
              <p class="m-0 text-lg font-bold">Datos no disponibles temporalmente</p>
              <small class="opacity-80 mt-2">Hubo un problema de conexión con el servidor.</small>
            </div>

            <div *ngIf="!isLoading() && !apiError() && globalPosts().length === 0" class="flex flex-col items-center justify-center p-10 border border-dashed border-border rounded-3xl mt-4 text-muted-foreground bg-transparent">
              <p class="m-0">No hay publicaciones publicadas en este periodo</p>
            </div>

            <div *ngIf="!isLoading() && globalPosts().length > 0" class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-8 w-full items-stretch">
              <div class="border border-border rounded-3xl p-6 bg-transparent flex flex-col justify-center">
                <div class="text-muted-foreground text-sm mb-2 font-medium">Publicaciones totales</div>
                <div class="text-3xl font-bold text-white">{{ totalPosts() | number }}</div>
              </div>
              <div *ngIf="selectedChannelId() === 'all'" class="border border-border rounded-3xl p-6 bg-transparent flex flex-col justify-center">
                <div class="text-muted-foreground text-sm mb-2 font-medium">Canales activos</div>
                <div class="text-3xl font-bold text-white">{{ activeChannelsCount() | number }}</div>
              </div>
              <div class="border border-border rounded-3xl p-6 bg-transparent flex flex-col justify-center">
                <div class="text-muted-foreground text-sm mb-2 font-medium">Última publicación</div>
                <div class="text-3xl font-bold text-white text-sm">{{ lastPostTime() }}</div>
              </div>
            </div>

            <!-- CURVA DE TENDENCIA (Sólo visible cuando se selecciona un canal específico) -->
            <div *ngIf="selectedChannelId() !== 'all'" class="mt-8 border border-border rounded-3xl p-6 bg-transparent w-full">
              <h3 class="mt-0 mb-4 text-lg font-bold text-white">Tendencia de publicaciones (últimos 30 días)</h3>
              <div class="w-full h-[300px]">
                <canvas baseChart
                  *ngIf="lineChartData.labels?.length"
                  [data]="lineChartData"
                  [options]="lineChartOptions"
                  type="line">
                </canvas>
                <div *ngIf="!lineChartData.labels?.length" class="w-full h-full flex items-center justify-center text-muted-foreground">
                  <span *ngIf="!isLoading()">No hay datos suficientes para graficar</span>
                </div>
              </div>
            </div>
          </ng-container>

          <!-- INDIVIDUAL VIEW -->
          <ng-container *ngIf="viewMode() === 'individual'">
            <div class="flex items-center gap-4">
              <h3 class="text-xl font-bold text-white">Análisis de publicaciones</h3>
            </div>
          </ng-container>

          <!-- SHARED TABLE -->
          <ng-container *ngIf="globalPosts().length > 0">
            <div class="w-full border border-border rounded-3xl p-6 bg-transparent flex flex-col">
              <h3 class="mt-0 mb-4 text-lg font-bold text-white">Publicaciones publicadas</h3>
              <div class="w-full overflow-hidden border border-border rounded-2xl bg-transparent">
                <table class="w-full border-collapse text-left">
                  <thead class="bg-white/[0.02] border-b border-border">
                    <tr>
                      <th class="p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Fecha</th>
                      <th class="p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Contenido</th>
                      <th class="p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Canal</th>
                      <th class="p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Tipo</th>
                      <th class="p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider">Tiempo en vivo</th>
                      <th class="p-3 text-muted-foreground font-medium text-xs uppercase tracking-wider"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr *ngFor="let post of globalPosts()" class="hover:bg-white/[0.03] border-t border-border transition-colors cursor-pointer" [class.bg-white/[0.05]]="selectedPostId() === post.id" (click)="selectPost(post.id)">
                      <td class="p-3 text-white whitespace-nowrap text-xs">{{ post.publishedAt | date:'shortDate' }}</td>
                      <td class="p-3 text-white max-w-[250px] whitespace-nowrap overflow-hidden text-ellipsis text-xs" [title]="post.content">{{ post.content }}</td>
                      <td class="p-3 text-white text-xs">{{ post.channelName }}</td>
                      <td class="p-3 text-white text-xs">{{ post.mediaType }}</td>
                      <td class="p-3 text-white text-xs">{{ formatTimeSince(post.publishedAt) }}</td>
                      <td class="p-3 text-white text-xs text-right">
                        <span class="text-primary hover:underline">Ver métricas</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

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
                <div *ngIf="!selectedPostLoading() && selectedPostApiError()" class="flex flex-col items-center justify-center p-6 text-destructive bg-transparent border border-dashed border-destructive/50 rounded-2xl">
                  <p class="m-0 text-sm font-bold">Datos no disponibles temporalmente</p>
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
            </div>
          </ng-container>

          <!-- Empty state -->
          <ng-container *ngIf="globalPosts().length === 0 && !isLoading()">
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
  private channelsService = inject(ChannelsService);

  viewMode = signal<'global' | 'individual'>('global');
  globalPosts = signal<any[]>([]);
  channels = signal<Channel[]>([]);
  selectedChannelId = signal<string>('all');
  isLoading = signal<boolean>(false);
  apiError = signal<boolean>(false);
  currentPage = signal<number>(1);
  totalPostsCount = signal<number>(0);
  datePreset = signal<DatePreset>('30d');

  selectedPostId = signal<string | null>(null);
  selectedPostAnalytics = signal<PostAnalytics | null>(null);
  selectedPostLoading = signal<boolean>(false);
  selectedPostApiError = signal<boolean>(false);

  exportPanelOpen = signal<boolean>(false);
  exportDateFrom = signal<string>('');
  exportDateTo = signal<string>('');

  readonly pageSize = 5;

  totalPosts = computed(() => this.totalPostsCount());

  totalPages = computed(() => Math.max(1, Math.ceil(this.totalPosts() / this.pageSize)));

  activeChannelsCount = computed(() => {
    const channels = new Set(this.globalPosts().map((p: any) => p.channelName));
    return channels.size;
  });

  lastPostTime = computed(() => {
    const posts = this.globalPosts();
    if (!posts.length) return 'N/A';
    const sorted = [...posts].sort((a: any, b: any) => b.publishedAt.getTime() - a.publishedAt.getTime());
    return this.formatTimeSince(sorted[0].publishedAt);
  });

  datePresetLabel = computed(() => {
    const map: Record<DatePreset, string> = { '7d': 'últimos 7 días', '30d': 'últimos 30 días', all: 'todo' };
    return map[this.datePreset()];
  });

  public lineChartData: ChartConfiguration<'line'>['data'] = {
    labels: [],
    datasets: [
      {
        data: [],
        label: 'Publicaciones',
        fill: true,
        tension: 0.4,
        borderColor: 'rgba(255, 255, 255, 0.8)',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        pointBackgroundColor: 'rgba(255, 255, 255, 1)',
      }
    ]
  };

  public lineChartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false }
    },
    scales: {
      y: {
        beginAtZero: true,
        suggestedMax: 5,
        grid: { color: 'rgba(255, 255, 255, 0.1)' },
        ticks: { 
          color: 'rgba(255, 255, 255, 0.6)',
          stepSize: 1,
          precision: 0
        }
      },
      x: {
        grid: { display: false },
        ticks: { color: 'rgba(255, 255, 255, 0.6)', maxTicksLimit: 10 }
      }
    }
  };

  constructor() {
    const nav = window.history.state;
    if (nav && nav.postId) {
      this.selectedPostId.set(nav.postId);
      this.viewMode.set('individual');
    }
  }

  ngOnInit() {
    this.loadChannels();
    this.loadAggregateData();
  }

  async loadChannels() {
    try {
      const chs = await this.channelsService.getChannels();
      this.channels.set(chs);
    } catch (e) {
      console.error('Failed to load channels', e);
    }
  }

  setChannelFilter(channelId: string) {
    this.selectedChannelId.set(channelId);
    this.currentPage.set(1);
    this.loadAggregateData();
    if (channelId !== 'all') {
      this.loadChannelTrend(channelId);
    } else {
      this.lineChartData = { ...this.lineChartData, labels: [], datasets: [{ ...this.lineChartData.datasets[0], data: [] }] };
    }
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
    this.selectedPostApiError.set(false);
    this.selectedPostAnalytics.set(null);
    try {
      const analytics = await this.postMetricsService.getPostAnalytics(postId);
      this.selectedPostAnalytics.set(analytics);
    } catch (e) {
      console.error('Failed to load post data', e);
      this.selectedPostApiError.set(true);
      this.selectedPostAnalytics.set(null);
    } finally {
      this.selectedPostLoading.set(false);
    }
  }

  clearSelectedPost() {
    this.selectedPostId.set(null);
    this.selectedPostAnalytics.set(null);
    this.selectedPostApiError.set(false);
  }

  async loadAggregateData() {
    this.isLoading.set(true);
    this.apiError.set(false);
    try {
      const { start, end } = this.getDateRange();
      const result = await this.postMetricsService.getAggregateMetrics(
        start, end, this.currentPage(), this.pageSize, this.selectedChannelId()
      );
      this.globalPosts.set(result.posts);
      this.totalPostsCount.set(result.total);
    } catch (e) {
      console.error('Failed to load aggregate metrics', e);
      this.apiError.set(true);
      this.globalPosts.set([]);
      this.totalPostsCount.set(0);
    } finally {
      this.isLoading.set(false);
    }
  }

  async loadChannelTrend(channelId: string) {
    try {
      const trend = await this.postMetricsService.getChannelTrend(channelId, 30);
      const labels = trend.map(t => new Date(t.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }));
      const data = trend.map(t => t.count);
      
      this.lineChartData = {
        labels,
        datasets: [{
          ...this.lineChartData.datasets[0],
          data
        }]
      };
    } catch (e) {
      console.error('Failed to load channel trend', e);
      this.lineChartData = { ...this.lineChartData, labels: [], datasets: [{ ...this.lineChartData.datasets[0], data: [] }] };
    }
  }

  formatTimeSince(date: Date): string {
    const diffMs = Date.now() - new Date(date).getTime();
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return 'Ahora';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}min`;
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }

  private async downloadCSV(rows: any[], filename: string) {
    const headers = ['Fecha', 'Contenido', 'Canal', 'Tipo', 'Tiempo en vivo', '# Post en canal', 'Hora', 'Día', 'Intentos'];
    let csvContent = headers.join(',');
    
    if (rows.length > 0) {
      const csvRows = rows.map(p => [
        p.publishedAt instanceof Date ? p.publishedAt.toISOString() : new Date(p.publishedAt).toISOString(),
        `"${(p.content || '').replace(/"/g, '""')}"`,
        p.channelName || '',
        p.mediaType || 'Texto',
        this.formatTimeSince(p.publishedAt),
        p.postNumber ?? '',
        p.publishedAt instanceof Date ? p.publishedAt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '',
        this.formatDayOfWeek(new Date(p.publishedAt)),
        (p.retryCount ?? 0) + 1
      ]);
      csvContent = [headers.join(','), ...csvRows.map(r => r.join(','))].join('\n');
    }
    
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    this.exportPanelOpen.set(false);
  }

  private formatDayOfWeek(date: Date): string {
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    return days[date.getDay()];
  }

  exportCurrentRange() {
    this.downloadCSV(this.globalPosts(), `metricas_pagina_${this.currentPage()}_${Date.now()}.csv`);
  }

  async exportAllInRange() {
    try {
      const { start, end } = this.getDateRange();
      const allPosts = await this.postMetricsService.getAllPostsForExport(start, end, this.selectedChannelId());
      this.downloadCSV(allPosts, `metricas_${this.datePresetLabel().replace(/\s/g, '_')}_${Date.now()}.csv`);
    } catch (e) {
      console.error('Failed to export all posts', e);
    }
  }

  async exportCustomRange() {
    if (!this.exportDateFrom() || !this.exportDateTo()) return;
    try {
      const start = new Date(this.exportDateFrom());
      const end = new Date(this.exportDateTo());
      end.setHours(23, 59, 59, 999);
      const allPosts = await this.postMetricsService.getAllPostsForExport(start, end, this.selectedChannelId());
      this.downloadCSV(allPosts, `metricas_${this.exportDateFrom()}_${this.exportDateTo()}_${Date.now()}.csv`);
    } catch (e) {
      console.error('Failed to export custom range', e);
    }
  }
}