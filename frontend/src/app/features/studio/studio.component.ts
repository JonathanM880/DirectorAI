import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GenAiService } from '../../core/services/gen-ai.service';
import { NotificationService } from '../../core/services/notification.service';
import { CopyRequest } from '@director-ai/types';
import { SupabaseClient } from '@supabase/supabase-js';
import { SchedulingEngineService } from '../services/scheduling-engine.service';
import { AssetUploadService, UploadedAsset } from '../../core/services/asset-upload.service';
import { PostFormComponent } from '../../shared/components/post-form/post-form.component';
import { MaxWidthHeightWrapperComponent } from "@/shared/components/ui/max-width-wrapper/max-width-wrapper.component";

@Component({
  selector: 'app-studio',
  standalone: true,
  imports: [CommonModule, FormsModule, PostFormComponent, MaxWidthHeightWrapperComponent],
  template: `
    <div class="p-4 md:p-8 bg-background text-foreground min-h-screen">
      <app-max-width-height-wrapper>
        <div class="flex flex-col gap-8 w-full">
          <!-- Page Title -->
          <div class="flex items-center justify-between flex-wrap gap-4">
            <h2 class="text-2xl font-bold text-white">Estudio de IA</h2>
          </div>

          <div class="flex flex-wrap gap-8 w-full items-stretch">
            <!-- Left Card: AI Inputs -->
            <div class="w-full md:w-[380px] shrink-0 flex flex-col border border-border rounded-3xl p-6 bg-transparent">
              <div class="flex flex-col gap-4">
                <div class="flex flex-col gap-2">
                  <label class="font-medium text-muted-foreground text-sm">Modo</label>
                  <select class="p-2.5 rounded-md border border-border bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary/50" [ngModel]="mode()" (ngModelChange)="mode.set($event)">
                    <option value="copy">Texto para redes sociales</option>
                    <option value="brainstorm">Lluvia de ideas</option>
                    <option value="image">Generación de imágenes</option>
                    <option value="campaign">Automatización de campañas</option>
                  </select>
                </div>

                <div class="flex flex-col gap-2" *ngIf="mode() === 'copy'">
                  <label class="font-medium text-muted-foreground text-sm">Tono</label>
                  <select class="p-2.5 rounded-md border border-border bg-background text-foreground font-sans focus:outline-none focus:ring-2 focus:ring-primary/50" [ngModel]="tone()" (ngModelChange)="tone.set($event)">
                    <option value="professional">Profesional</option>
                    <option value="casual">Informal</option>
                    <option value="urgent">Urgente</option>
                    <option value="educational">Educativo</option>
                  </select>
                </div>

                <div class="flex flex-col gap-2">
                  <label class="font-medium text-muted-foreground text-sm">Indicación / Tema</label>
                  <textarea class="p-2.5 rounded-md border border-border bg-background text-foreground font-sans resize-y focus:outline-none focus:ring-2 focus:ring-primary/50" [ngModel]="prompt()" (ngModelChange)="prompt.set($event)" rows="5" placeholder="¿Qué quieres generar?"></textarea>
                </div>

                <button class="w-full py-2.5 px-4 rounded-md border-none cursor-pointer font-semibold bg-primary text-primary-foreground disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90 transition-colors" (click)="generate()" [disabled]="isGenerating()">
                  <span *ngIf="isGenerating()" class="w-4 h-4 border-2 border-primary-foreground/20 border-t-primary-foreground rounded-full animate-spin inline-block align-middle mr-2"></span>
                  {{ isGenerating() ? 'Generando...' : 'Generar con IA' }}
                </button>
              </div>
            </div>

            <!-- Right Card: Output display -->
            <div class="flex-1 min-w-[320px] md:min-w-[500px] flex flex-col border border-border rounded-3xl p-6 bg-transparent min-h-[450px]">
              <div *ngIf="!output() && !generatedImageUrl() && !isGenerating()" class="m-auto text-muted-foreground italic">
                Selecciona tus preferencias y haz clic en Generar.
              </div>
              
              <div *ngIf="output() || generatedImageUrl()" class="flex-1 overflow-x-hidden">
                <img *ngIf="mode() === 'image' && generatedImageUrl()" [src]="generatedImageUrl()!" alt="Imagen generada por IA" class="w-full rounded-lg mt-2 object-cover">
                <pre *ngIf="mode() === 'campaign' && output()" class="whitespace-pre-wrap break-words font-sans m-0 text-white">{{ output() }}</pre>
                <p *ngIf="mode() !== 'image' && mode() !== 'campaign' && output()" class="m-0 text-white whitespace-pre-wrap text-lg leading-relaxed">{{ output() }}</p>
              </div>

              <div class="mt-6 flex gap-3" *ngIf="!isGenerating() && (output() || generatedImageUrl())">
                <button class="py-2.5 px-4 rounded-md cursor-pointer font-semibold bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors border-none disabled:opacity-50" (click)="saveToAssets()" [disabled]="isSaving()">
                  <span *ngIf="isSaving()" class="w-4 h-4 border-2 border-secondary-foreground/20 border-t-secondary-foreground rounded-full animate-spin inline-block align-middle mr-2"></span>
                  {{ isSaving() ? 'Guardando...' : 'Guardar en Recursos' }}
                </button>
                <button class="py-2.5 px-4 rounded-md cursor-pointer font-semibold bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors border-none disabled:opacity-50" (click)="scheduleNow()" [disabled]="isSaving()">Programar ahora</button>
            </div>
          </div>
        </div>
      </div>
    </app-max-width-height-wrapper>

      <!-- Toast Alert Banner -->
      @if (toast(); as t) {
        <div class="absolute bottom-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-full text-sm font-semibold z-[999] animate-in slide-in-from-bottom-4 shadow-lg shadow-black/20" [class.bg-[#00E676]]="t.type === 'success'" [class.text-black]="t.type === 'success'" [class.bg-red-500]="t.type === 'error'" [class.text-white]="t.type === 'error'" role="status" aria-live="polite">
          {{ t.message }}
        </div>
      }

      <div class="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99999] flex items-center justify-center animate-in fade-in duration-150" *ngIf="scheduleFormOpen()" (click)="scheduleFormOpen.set(false)" role="dialog" aria-modal="true" aria-label="Programar publicación">
        <div class="bg-background border border-white/10 rounded-xl shadow-2xl w-[900px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-4rem)] flex flex-col overflow-hidden animate-in slide-in-from-bottom-6 duration-200" (click)="$event.stopPropagation()">
          <div class="flex items-center justify-between p-5 md:px-6 border-b border-white/10 shrink-0">
            <h2 class="m-0 text-lg font-display uppercase tracking-wider text-foreground">Programar publicación</h2>
            <button class="w-8 h-8 flex items-center justify-center bg-white/5 border-none rounded-md text-muted-foreground cursor-pointer hover:bg-white/10 hover:text-foreground transition-all" (click)="scheduleFormOpen.set(false)" aria-label="Cerrar">✕</button>
          </div>
          <div class="flex-1 overflow-y-auto p-6 pb-0">
            <app-post-form
              [initialText]="initialTextForForm"
              [initialAssets]="initialAssetsForForm"
              (saved)="onScheduleSaved($event)"
              (formCancel)="scheduleFormOpen.set(false)">
            </app-post-form>
          </div>
        </div>
      </div>

    </div>
  `,
  styles: []
})
export class StudioComponent implements OnInit, OnDestroy {
  private schedulingEngine = inject(SchedulingEngineService);
  private genAiService = inject(GenAiService);
  private supabase = inject(SupabaseClient);
  private notificationService = inject(NotificationService);
  private assetUpload = inject(AssetUploadService);

  initialTextForForm = '';
  initialAssetsForForm: UploadedAsset[] = [];
  scheduleFormOpen = signal(false);

  mode = signal<'copy' | 'brainstorm' | 'image' | 'campaign'>('copy');
  tone = signal<any>('professional');
  prompt = signal('');

  isGenerating = signal(false);
  isSaving = signal(false);
  output = signal('');
  generatedImageUrl = signal<string | null>(null);
  
  // Toast status
  toast = signal<{ message: string; type: 'success' | 'error' } | null>(null);
  private toastTimeout: ReturnType<typeof setTimeout> | null = null;

  async ngOnInit() {
  }

  ngOnDestroy() {
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }
  }

  showToast(message: string, type: 'success' | 'error') {
    this.toast.set({ message, type });
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }
    this.toastTimeout = setTimeout(() => this.toast.set(null), 3500);
  }

  async generate() {
    if (!this.prompt()) return;
    
    this.isGenerating.set(true);
    this.output.set('');

    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      
      if (this.mode() === 'copy') {
        const request: CopyRequest = {
          userId: session?.user.id || '',
          prompt: this.prompt(),
          platform: 'telegram', // Valor hardcodeado para mantener la firma
          tone: this.tone()
        };

        this.genAiService.streamGenerate(request).subscribe({
          next: (chunk) => {
            this.output.update(curr => curr + chunk);
          },
          complete: () => {
            this.isGenerating.set(false);
            this.output.set(stripOuterQuotes(this.output()));
          },
          error: (err) => {
            console.error('Generation error', err);
            this.isGenerating.set(false);
            this.output.set('Error: ' + err.message);
          }
        });
      } else if (this.mode() === 'brainstorm') {
        const result = await this.genAiService.brainstorm({
          topic: this.prompt(),
          count: 5,
          platform: 'telegram' // Valor hardcodeado para mantener la firma
        });
        
        this.output.set(result.ideas.map((idea: string) => stripOuterQuotes(idea)).join('\n\n'));
        this.isGenerating.set(false);
      } else if (this.mode() === 'image') {
        this.generatedImageUrl.set(null);
        const result = await this.genAiService.generateImage({
          userId: session?.user.id || '',
          prompt: this.prompt(),
          aspectRatio: '1:1'
        });
        
        if (result.error) {
          this.output.set('Error: ' + result.error);
        } else {
          this.generatedImageUrl.set(result.url);
          this.output.set('');
        }
        
        this.isGenerating.set(false);
      } else if (this.mode() === 'campaign') {
        const result = await this.genAiService.parseCampaign({
          userId: session?.user.id || '',
          prompt: this.prompt(),
          platform: 'telegram' // Valor hardcodeado para mantener la firma
        });
        
        let formatted = '';
        result.posts.forEach((p: any, i: number) => {
          formatted += `📌 Publicación ${i + 1}\n`;
          if (p.imagePrompt) formatted += `📷 Concepto de imagen: ${p.imagePrompt}\n`;
          formatted += `📝 Texto:\n${p.text}\n`;
          formatted += `⏱️ Margen: +${p.offsetMinutes} mins\n\n`;
        });
        this.output.set(stripOuterQuotes(formatted.trim()));
        
        this.isGenerating.set(false);
        (this as any).lastCampaignResult = result.posts;
      }
    } catch (err: any) {
      console.error(err);
      this.isGenerating.set(false);
      this.output.set('Error: ' + err.message);
    }
  }

  async saveToAssets() {
    try {
      this.isSaving.set(true);
      const { data: { session } } = await this.supabase.auth.getSession();
      if (!session) {
        this.isSaving.set(false);
        return;
      }
      
      let postsToSave = (this as any).lastCampaignResult || [];
      if (this.mode() === 'image') {
        const url = this.generatedImageUrl();
        if (!url) throw new Error('No hay imagen generada para guardar');
        postsToSave = [{ imagePrompt: this.prompt(), imageUrl: url, offsetMinutes: 0 }];
      } else if (this.mode() !== 'campaign' || postsToSave.length === 0) {
        postsToSave = [{ text: this.output(), offsetMinutes: 0 }];
      }

      for (const post of postsToSave) {
        if (post.text) {
          const fileName = `generated-${Date.now()}-${Math.floor(Math.random()*1000)}.txt`;
          const file = new File([post.text], fileName, { type: 'text/plain' });
          await this.assetUpload.upload(file);
        }

        if (post.imagePrompt) {
          try {
            const imgRes = await fetch(post.imageUrl || 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=800');
            const imgBlob = await imgRes.blob();
            const imgName = `generated-img-${Date.now()}-${Math.floor(Math.random()*1000)}.jpg`;
            const file = new File([imgBlob], imgName, { type: 'image/jpeg' });
            await this.assetUpload.upload(file, 'user_upload');
          } catch (e) {
            console.error('Failed to save image asset', e);
            throw e;
          }
        }
      }
      
      this.isSaving.set(false);
      
      this.notificationService.notify(
        'assets_saved',
        'success',
        'Recursos guardados',
        `Se han guardado correctamente ${postsToSave.length} elemento(s) en tu biblioteca de recursos.`
      );
      this.showToast(`Se han guardado correctamente ${postsToSave.length} elemento(s) en tu biblioteca de recursos.`, 'success');
    } catch (err: any) {
      console.error(err);
      this.isSaving.set(false);
      this.showToast('Error al guardar en recursos: ' + err.message, 'error');
    }
  }

  async scheduleNow() {
    try {
      this.isSaving.set(true);
      const { data: { session } } = await this.supabase.auth.getSession();
      if (!session) {
        this.isSaving.set(false);
        return;
      }

      this.initialTextForForm = '';
      this.initialAssetsForForm = [];

      if (this.mode() === 'image') {
        const url = this.generatedImageUrl();
        if (!url) throw new Error('No hay imagen generada');
        
        const imgRes = await fetch(url);
        const imgBlob = await imgRes.blob();
        const imgName = `generated-img-${Date.now()}-${Math.floor(Math.random()*1000)}.jpg`;
        const file = new File([imgBlob], imgName, { type: 'image/jpeg' });
        
        const asset = await this.assetUpload.upload(file, 'ai_generated');
        this.initialAssetsForForm = [asset];
        this.initialTextForForm = this.prompt();
      } else if (this.mode() === 'campaign') {
        const postsToSave = (this as any).lastCampaignResult || [];
        if (postsToSave.length > 0) {
          const firstPost = postsToSave[0];
          this.initialTextForForm = firstPost.text || '';
          if (firstPost.imagePrompt) {
            const imgRes = await fetch(firstPost.imageUrl || 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=800');
            const imgBlob = await imgRes.blob();
            const imgName = `generated-img-${Date.now()}-${Math.floor(Math.random()*1000)}.jpg`;
            const file = new File([imgBlob], imgName, { type: 'image/jpeg' });
            const asset = await this.assetUpload.upload(file, 'ai_generated');
            this.initialAssetsForForm = [asset];
          }
        }
      } else {
        this.initialTextForForm = this.output();
      }

      this.isSaving.set(false);
      this.scheduleFormOpen.set(true);
    } catch (err: any) {
      console.error(err);
      this.isSaving.set(false);
      alert('Error al preparar el formulario de programación: ' + err.message);
    }
  }

  async onScheduleSaved(formData: any) {
    try {
      this.isSaving.set(true);
      await this.schedulingEngine.schedulePost({
        channelId: formData.channelId,
        content: {
          text: formData.text,
          mediaAssetIds: formData.mediaAssetIds,
          mediaType: formData.mediaType,
        },
        scheduledAt: formData.publishImmediately ? new Date() : formData.scheduledAt,
        recurrenceRule: formData.recurrenceRule,
        publishImmediately: formData.publishImmediately
      } as any);

      this.scheduleFormOpen.set(false);
      this.isSaving.set(false);
      this.notificationService.notify(
        'post_scheduled',
        'success',
        'Publicaci�n programada',
        'Tu publicaci�n se ha programado correctamente.'
      );
    } catch (err: any) {
      console.error(err);
      this.isSaving.set(false);
      alert('Error al programar la publicaci�n: ' + err.message);
    }
  }
}


function stripOuterQuotes(text: string): string {
  text = text.trim();
  const quoteChars = ['"', "'", '“', '”', '`'];
  if (text.length >= 2) {
    const first = text[0];
    const last = text[text.length - 1];
    if (quoteChars.includes(first) && quoteChars.includes(last)) {
      if ((first === '"' && last === '"') ||
          (first === "'" && last === "'") ||
          (first === '`' && last === '`') ||
          (first === '“' && last === '”')) {
        return text.slice(1, -1).trim();
      }
    }
  }
  return text;
}