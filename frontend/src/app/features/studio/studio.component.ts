import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GenAiService } from '../../core/services/gen-ai.service';
import { NotificationService } from '../../core/services/notification.service';
import { CopyRequest } from '@director-ai/types';
import { SupabaseClient } from '@supabase/supabase-js';
import { AssetUploadService, UploadedAsset } from '../../core/services/asset-upload.service';
import { PostFormComponent } from '../../shared/components/post-form/post-form.component';

@Component({
  selector: 'app-studio',
  standalone: true,
  imports: [CommonModule, FormsModule, PostFormComponent],
  template: `
    <div class="studio-container">
      <div class="sidebar">
        <h2>AI Studio</h2>
        
        <div class="form-group">
          <label>Mode</label>
          <select [ngModel]="mode()" (ngModelChange)="mode.set($event)">
            <option value="copy">Social Media Copy</option>
            <option value="brainstorm">Brainstorm Ideas</option>
            <option value="image">Image Generation</option>
            <option value="campaign">Campaign Automation</option>
          </select>
        </div>

        <div class="form-group" *ngIf="mode() === 'copy'">
          <label>Tone</label>
          <select [ngModel]="tone()" (ngModelChange)="tone.set($event)">
            <option value="professional">Professional</option>
            <option value="casual">Casual</option>
            <option value="urgent">Urgent</option>
            <option value="educational">Educational</option>
          </select>
        </div>

        <div class="form-group">
          <label>Prompt / Topic</label>
          <textarea [ngModel]="prompt()" (ngModelChange)="prompt.set($event)" rows="5" placeholder="What do you want to generate?"></textarea>
        </div>

        <button class="btn btn-primary" (click)="generate()" [disabled]="isGenerating()">
          {{ isGenerating() ? 'Generating...' : 'Generate with AI' }}
        </button>
      </div>

      <div class="main-panel">
        <div class="usage-meter">
          Generations this month: {{ usage() }}/{{ usageLimit() }}
          <div class="progress-bar">
            <div class="progress" [style.width.%]="(usage() / usageLimit()) * 100"></div>
          </div>
        </div>

        <div class="output-area">
          <div *ngIf="!output() && !isGenerating()" class="empty-state">
            Select your preferences and click Generate.
          </div>
          
          <div *ngIf="output()" class="output-content">
            <img *ngIf="generatedImageUrl" [src]="generatedImageUrl" alt="AI Generated Image" class="generated-preview">
            <pre *ngIf="!generatedImageUrl && mode() === 'campaign'">{{ output() }}</pre>
            <p *ngIf="!generatedImageUrl && mode() !== 'campaign'">{{ output() }}</p>
          </div>

          <div class="actions" *ngIf="output() && !isGenerating()">
            <button class="btn" (click)="saveToAssets()" [disabled]="isSaving()">
              {{ isSaving() ? 'Saving...' : 'Save to Assets' }}
            </button>
            <button class="btn" (click)="scheduleNow()" [disabled]="isSaving()">Schedule Now</button>
          </div>
        </div>
      </div>

      <div class="new-post-overlay" *ngIf="scheduleFormOpen()" (click)="scheduleFormOpen.set(false)" role="dialog" aria-modal="true" aria-label="Schedule post">
        <div class="new-post-panel" (click)="$event.stopPropagation()">
          <div class="panel-header">
            <h2>Schedule Post</h2>
            <button class="close-btn" (click)="scheduleFormOpen.set(false)" aria-label="Close">✕</button>
          </div>
          <div class="panel-body" style="padding: 1.5rem; padding-bottom: 0;">
            <app-post-form
              [initialText]="initialTextForForm"
              [initialAssets]="initialAssetsForForm"
              (saved)="onScheduleSaved($event)"
              (cancel)="scheduleFormOpen.set(false)">
            </app-post-form>
          </div>
        </div>
      </div>

    </div>
  `,
  styles: [`
    /* Se mantienen los mismos estilos originales */
    .studio-container {
      display: grid;
      grid-template-columns: 350px 1fr;
      height: 100%;
      background: var(--color-ink);
      color: var(--color-paper);
    }
    .sidebar {
      padding: var(--space-4);
      border-right: 1px solid var(--color-steel);
      background: rgba(42, 45, 53, 0.3);
    }
    .main-panel {
      padding: var(--space-4);
      display: flex;
      flex-direction: column;
    }
    .form-group {
      margin-bottom: var(--space-3);
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .form-group label {
      font-weight: 500;
      color: var(--color-gray-200);
      font-size: 0.9rem;
    }
    input, select, textarea {
      padding: 10px;
      border-radius: 6px;
      border: 1px solid var(--color-steel);
      background: var(--color-ink);
      color: var(--color-paper);
      font-family: 'Inter', sans-serif;
    }
    .btn {
      padding: 10px 16px;
      border-radius: 6px;
      border: none;
      cursor: pointer;
      font-weight: 600;
      font-family: 'Inter', sans-serif;
      transition: background 0.2s;
    }
    .btn-primary {
      background: var(--color-signal);
      color: var(--color-ink);
      width: 100%;
    }
    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .usage-meter {
      align-self: flex-end;
      font-size: 0.85rem;
      color: var(--color-gray-300);
      margin-bottom: var(--space-4);
    }
    .progress-bar {
      width: 200px;
      height: 6px;
      background: var(--color-steel);
      border-radius: 3px;
      margin-top: 4px;
      overflow: hidden;
    }
    .progress {
      height: 100%;
      background: var(--color-live);
      transition: width 0.3s ease;
    }
    .output-area {
      flex: 1;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid var(--color-steel);
      border-radius: 8px;
      padding: var(--space-4);
      display: flex;
      flex-direction: column;
    }
    .empty-state {
      margin: auto;
      color: var(--color-gray-400);
    }
    .output-content {
      flex: 1;
      white-space: pre-wrap;
      font-size: 1.1rem;
      line-height: 1.6;
      overflow-x: hidden;
    }
    .output-content pre {
      white-space: pre-wrap;
      word-wrap: break-word;
      font-family: inherit;
      margin: 0;
    }
    .generated-preview {
      width: 100%;
      border-radius: 8px;
      margin-top: 10px;
    }
    .actions {
      margin-top: var(--space-4);
      display: flex;
      gap: 12px;
    }
    .new-post-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(4px);
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      animation: fadeIn 0.15s ease-out;
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    .new-post-panel {
      background: var(--color-steel);
      border-radius: var(--radius-xl);
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 32px 64px rgba(0, 0, 0, 0.6);
      width: 900px;
      max-width: calc(100vw - 2rem);
      max-height: calc(100vh - 4rem);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      animation: slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @keyframes slideUp {
      from { transform: translateY(24px); opacity: 0; }
      to   { transform: translateY(0);    opacity: 1; }
    }
    .panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-5) var(--space-6);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      flex-shrink: 0;
    }
    .panel-header h2 {
      margin: 0;
      font-size: 1.125rem;
      font-family: var(--font-display);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-paper);
    }
    .panel-header .close-btn {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.06);
      border: none;
      border-radius: var(--radius-md);
      color: var(--color-gray-400);
      cursor: pointer;
      transition: all var(--transition-fast);
    }
    .panel-header .close-btn:hover {
      background: rgba(255, 255, 255, 0.12);
      color: var(--color-paper);
    }
    .panel-body {
      flex: 1;
      overflow-y: auto;
    }
  `]
})
export class StudioComponent implements OnInit {
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
  
  usage = signal(0);
  usageLimit = signal(100);

  get generatedImageUrl(): string | null {
    if (this.mode() !== 'image' || !this.output()) return null;
    const match = this.output().match(/\((https?:\/\/[^\)]+)\)/);
    return match ? match[1] : null;
  }

  async ngOnInit() {
    this.usage.set(100);
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
            this.usage.update(u => u + 1); 
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
        
        this.output.set(result.ideas.join('\n\n'));
        this.isGenerating.set(false);
        this.usage.update(u => u + 1);
      } else if (this.mode() === 'image') {
        const result = await this.genAiService.generateImage({
          prompt: this.prompt(),
          size: '1024x1024'
        });
        
        if (result.error) {
          this.output.set('Error: ' + result.error);
        } else {
          this.output.set(`[Image Generated](${result.url})`);
        }
        
        this.isGenerating.set(false);
        this.usage.update(u => u + 1);
      } else if (this.mode() === 'campaign') {
        const result = await this.genAiService.parseCampaign({
          userId: session?.user.id || '',
          prompt: this.prompt(),
          platform: 'telegram' // Valor hardcodeado para mantener la firma
        });
        
        let formatted = '';
        result.posts.forEach((p: any, i: number) => {
          formatted += `📌 Post ${i + 1}\n`;
          if (p.imagePrompt) formatted += `📷 Image Concept: ${p.imagePrompt}\n`;
          formatted += `📝 Text:\n${p.text}\n`;
          formatted += `⏱️ Offset: +${p.offsetMinutes} mins\n\n`;
        });
        this.output.set(formatted.trim());
        
        this.isGenerating.set(false);
        this.usage.update(u => u + 1);
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
        const match = this.output().match(/\((https?:\/\/[^\)]+)\)/);
        const url = match ? match[1] : 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=800';
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
            await this.assetUpload.upload(file);
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
        'Assets Saved',
        `Successfully saved ${postsToSave.length} item(s) to your assets library.`
      );
    } catch (err: any) {
      console.error(err);
      this.isSaving.set(false);
      alert('Error saving to assets: ' + err.message);
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
        const match = this.output().match(/\((https?:\/\/[^\)]+)\)/);
        const url = match ? match[1] : 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=800';
        
        const imgRes = await fetch(url);
        const imgBlob = await imgRes.blob();
        const imgName = `generated-img-${Date.now()}-${Math.floor(Math.random()*1000)}.jpg`;
        const file = new File([imgBlob], imgName, { type: 'image/jpeg' });
        
        const asset = await this.assetUpload.upload(file);
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
            const asset = await this.assetUpload.upload(file);
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
      alert('Error preparing schedule form: ' + err.message);
    }
  }

  async onScheduleSaved(formData: any) {
    try {
      this.isSaving.set(true);
      const { data: { session } } = await this.supabase.auth.getSession();
      if (!session) {
        this.isSaving.set(false);
        return;
      }

      let recurrenceRuleId: string | undefined = undefined;
      if (formData.recurrenceRule) {
        const { data: rule, error: rErr } = await this.supabase.from('recurrence_rules').insert({
          user_id: session.user.id,
          frequency: formData.recurrenceRule.frequency,
          interval: formData.recurrenceRule.interval,
          end_date: formData.recurrenceRule.endDate ? formData.recurrenceRule.endDate.toISOString() : null
        }).select().single();
        if (rErr) throw rErr;
        recurrenceRuleId = rule.id;
      }

      const { error } = await this.supabase.from('scheduled_posts').insert({
        user_id: session.user.id,
        channel_id: formData.channelId,
        text_content: formData.text,
        media_asset_ids: formData.mediaAssetIds,
        scheduled_at: formData.scheduledAt.toISOString(),
        status: formData.publishImmediately ? 'published' : 'scheduled',
        recurrence_rule_id: recurrenceRuleId
      });

      if (error) throw error;

      this.scheduleFormOpen.set(false);
      this.isSaving.set(false);
      this.notificationService.notify(
        'post_scheduled',
        'success',
        'Post Scheduled',
        'Your post has been successfully scheduled.'
      );
    } catch (err: any) {
      console.error(err);
      this.isSaving.set(false);
      alert('Error scheduling post: ' + err.message);
    }
  }
}
