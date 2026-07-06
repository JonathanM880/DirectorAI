import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BaseChartDirective } from 'ng2-charts';
import { ChartConfiguration, ChartOptions } from 'chart.js';
import { PostMetricsService } from '../../core/services/post-metrics.service';
import { MaxWidthHeightWrapperComponent } from "@/shared/components/ui/max-width-wrapper/max-width-wrapper.component";

@Component({
  selector: 'app-metrics',
  standalone: true,
  imports: [CommonModule, FormsModule, BaseChartDirective, MaxWidthHeightWrapperComponent],
  template: `
    <div class="p-4 md:p-8 bg-background text-foreground min-h-screen">
      <app-max-width-height-wrapper>
        <div class="flex flex-col gap-8 w-full">
          <!-- Page Title & Header Actions -->
          <div class="flex justify-between items-center flex-wrap gap-4">
            <h2 class="text-2xl font-bold text-white">Métricas</h2>
            
            <div class="flex flex-wrap items-center gap-4">
              <div class="flex bg-secondary p-1 rounded-lg gap-1">
                <button class="px-3 py-1.5 rounded text-sm bg-transparent border-none text-muted-foreground cursor-pointer" [class.bg-white/10]="viewMode() === 'global'" [class.text-white]="viewMode() === 'global'" [class.font-semibold]="viewMode() === 'global'" (click)="setViewMode('global')">Estadísticas globales</button>
                <button class="px-3 py-1.5 rounded text-sm bg-transparent border-none text-muted-foreground cursor-pointer" [class.bg-white/10]="viewMode() === 'individual'" [class.text-white]="viewMode() === 'individual'" [class.font-semibold]="viewMode() === 'individual'" (click)="setViewMode('individual')">Análisis de publicaciones</button>
              </div>

              <div class="flex flex-col gap-1">
                <select disabled class="px-3 py-2 rounded-md border border-border bg-background text-foreground disabled:opacity-50 disabled:cursor-not-allowed text-sm">
                  <option value="telegram_main">Telegram (Canal principal)</option>
                </select>
              </div>
              
              <button class="px-4 py-2.5 rounded-md font-semibold flex items-center gap-2 cursor-pointer bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors border-none" (click)="exportToCSV()">
                <span class="icon">⬇️</span> Exportar CSV
              </button>
            </div>
          </div>

          <!-- GLOBAL VIEW -->
          <ng-container *ngIf="viewMode() === 'global'">
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
                  <div class="text-3xl font-bold text-white">{{ globalPosts().length | number }}</div>
                </div>
                <div class="border border-border rounded-3xl p-6 bg-transparent flex flex-col justify-center">
                  <div class="text-muted-foreground text-sm mb-2 font-medium">Promedio de vistas por publicación</div>
                  <div class="text-3xl font-bold text-white">{{ (globalTotalViews() / globalPosts().length) | number:'1.0-0' }}</div>
                </div>
              </div>

              <!-- Chart Card -->
              <div class="w-full border border-border rounded-3xl p-6 bg-transparent h-[350px]">
                <h3 class="mt-0 mb-4 text-lg font-bold text-white">Tendencia de vistas (últimos 30 días)</h3>
                <div class="w-full h-[250px]">
                  <canvas baseChart
                    [data]="viewsChartData()"
                    [options]="viewsChartOptions"
                    [type]="'line'">
                  </canvas>
                </div>
              </div>

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
                      </tr>
                    </thead>
                    <tbody>
                      <tr *ngFor="let post of globalPosts()" class="hover:bg-white/[0.01] border-t border-border transition-colors">
                        <td class="p-3 text-white whitespace-nowrap text-xs">{{ post.publishedAt | date:'shortDate' }}</td>
                        <td class="p-3 text-white max-w-[300px] whitespace-nowrap overflow-hidden text-ellipsis text-xs" [title]="post.content">{{ post.content }}</td>
                        <td class="p-3 text-white text-xs">{{ post.views | number }}</td>
                        <td class="p-3 text-white text-xs">{{ getReactionsCount(post.reactions) | number }}</td>
                        <td class="p-3 text-white text-xs">{{ post.forwards | number }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </ng-container>
          </ng-container>

          <!-- INDIVIDUAL VIEW -->
          <ng-container *ngIf="viewMode() === 'individual'">
            <div *ngIf="individualPostId(); else noPostSelected">
              <div class="flex flex-col gap-6">
                <h3 class="text-xl font-bold text-white">Análisis de publicaciones individuales</h3>
                
                <div *ngIf="isLoading()" class="flex flex-col items-center justify-center p-10 border border-dashed border-border rounded-3xl text-muted-foreground bg-transparent">
                  <div class="w-10 h-10 border-4 border-white/10 border-t-primary rounded-full animate-spin mb-4"></div>
                  <p class="m-0">Cargando datos reales de Telegram...</p>
                </div>

                <div *ngIf="!isLoading() && individualMetrics() === null" class="flex flex-col items-center justify-center p-10 border border-dashed border-border rounded-3xl text-muted-foreground bg-transparent">
                  <p class="m-0 mb-2">Aún no hay datos de interacción disponibles</p>
                  <small class="opacity-70">La solicitud a la API de Telegram no devolvió vistas ni reacciones para esta publicación.</small>
                </div>

                <div class="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-8 w-full items-stretch" *ngIf="!isLoading() && individualMetrics() !== null">
                  <div class="border border-border rounded-3xl p-6 bg-transparent flex flex-col justify-center">
                    <div class="text-muted-foreground text-sm mb-2 font-medium">Vistas de la publicación</div>
                    <div class="text-3xl font-bold text-white">{{ individualMetrics()?.views !== null && individualMetrics()?.views !== undefined ? (individualMetrics()?.views | number) : 'N/A' }}</div>
                  </div>
                  <div class="border border-border rounded-3xl p-6 bg-transparent flex flex-col justify-center">
                    <div class="text-muted-foreground text-sm mb-2 font-medium">Reacciones</div>
                    <div class="text-3xl font-bold text-white">{{ getReactionsCount(individualMetrics()?.reactions) !== null ? (getReactionsCount(individualMetrics()?.reactions) | number) : 'N/A' }}</div>
                    
                    <div class="flex gap-2 flex-wrap mt-3" *ngIf="getReactionsCount(individualMetrics()?.reactions)">
                      <div class="bg-white/5 px-2.5 py-1 rounded-full text-xs flex items-center gap-1 border border-border text-white" *ngFor="let entry of getReactionEntries(individualMetrics()?.reactions)">
                        <span>{{ entry.emoji }}</span>
                        <span>{{ entry.count }}</span>
                      </div>
                    </div>
                  </div>
                  <div class="border border-border rounded-3xl p-6 bg-transparent flex flex-col justify-center">
                    <div class="text-muted-foreground text-sm mb-2 font-medium">Reenvíos</div>
                    <div class="text-3xl font-bold text-white">{{ individualMetrics()?.forwards !== null && individualMetrics()?.forwards !== undefined ? (individualMetrics()?.forwards | number) : 'N/A' }}</div>
                  </div>
                  <div class="border border-border rounded-3xl p-6 bg-transparent flex flex-col justify-center">
                    <div class="text-muted-foreground text-sm mb-2 font-medium">Respuestas</div>
                    <div class="text-3xl font-bold text-white">{{ individualMetrics()?.replies !== null && individualMetrics()?.replies !== undefined ? (individualMetrics()?.replies | number) : 'N/A' }}</div>
                  </div>
                </div>
              </div>
            </div>

            <ng-template #noPostSelected>
              <div class="flex flex-col items-center justify-center p-10 border border-dashed border-border rounded-3xl text-muted-foreground bg-transparent">
                <p class="m-0 mb-2">Ninguna publicación seleccionada.</p>
                <small class="opacity-70">Por favor, navega desde el Calendario haciendo clic en "Ver métricas" en una publicación específica.</small>
              </div>
            </ng-template>
          </ng-container>
        </div>
      </app-max-width-height-wrapper>
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
    const headers = ['Fecha', 'Contenido', 'Vistas', 'Reacciones', 'Reenvios'];

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
        'Publicacion individual',
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
    link.setAttribute('download', `metricas_telegram_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
