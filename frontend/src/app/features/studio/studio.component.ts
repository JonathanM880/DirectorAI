import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GenAiService } from '../../core/services/gen-ai.service';
import { NotificationService } from '../../core/services/notification.service';
import { CopyRequest } from '@director-ai/types';
import { SupabaseClient } from '@supabase/supabase-js';

@Component({
  selector: 'app-studio',
  standalone: true,
  imports: [CommonModule, FormsModule],
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

        <div class="form-group" *ngIf="mode() === 'copy' || mode() === 'brainstorm'">
          <label>Platform</label>
          <select [ngModel]="platform()" (ngModelChange)="platform.set($event)">
            <option value="twitter">X (Twitter)</option>
            <option value="linkedin">LinkedIn</option>
            <option value="instagram">Instagram</option>
            <option value="telegram">Telegram</option>
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
    </div>
  `,
  styles: [`
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
  `]
})
export class StudioComponent implements OnInit {
  private genAiService = inject(GenAiService);
  private supabase = inject(SupabaseClient);
  private notificationService = inject(NotificationService);

  mode = signal<'copy' | 'brainstorm' | 'image' | 'campaign'>('copy');
  platform = signal<any>('twitter');
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
    // We would fetch actual usage from BillingService via an Edge Function
    // For now, mock it:
    this.usage.set(12);
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
          platform: this.platform(),
          tone: this.tone()
        };

        this.genAiService.streamGenerate(request).subscribe({
          next: (chunk) => {
            this.output.update(curr => curr + chunk);
          },
          complete: () => {
            this.isGenerating.set(false);
            this.usage.update(u => u + 1); // Optimistic update
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
          platform: this.platform()
        });
        // Access the ideas array inside BrainstormResult
        this.output.set(result.ideas.join('\n\n'));
        this.isGenerating.set(false);
        this.usage.update(u => u + 1);
      } else if (this.mode() === 'image') {
        // Image generation doesn't stream, it just returns a URL or error
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
          platform: this.platform()
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
        // If it's just a regular copy/brainstorm, mock a simple array
        postsToSave = [{ text: this.output(), offsetMinutes: 0 }];
      }
      
      // Ensure user profile exists
      const { data: profile } = await this.supabase.from('users_profile').select('id').eq('id', session.user.id).maybeSingle();
      if (!profile) {
        await this.supabase.from('users_profile').insert({ id: session.user.id, email: session.user.email });
      }

      // Ensure channel exists
      let { data: channel, error: selErr } = await this.supabase.from('channels').select('id').limit(1).maybeSingle();
      if (!channel) {
        const { data: newChannel, error: insErr } = await this.supabase.from('channels').insert({
          user_id: session.user.id,
          platform: this.platform() || 'telegram',
          name: 'My Channel',
          channel_identifier: '@test_stream',
          is_active: true
        }).select().single();
        if (insErr) throw insErr;
        channel = newChannel;
      }

      // Insert recurrence rule
      const { data: rule, error: rErr } = await this.supabase.from('recurrence_rules').insert({
        user_id: session.user.id,
        frequency: 'daily',
        interval: 1
      }).select().single();
      if (rErr) throw rErr;

      for (const post of postsToSave) {
        let assetIds: string[] = [];

        // 1. Text Asset
        if (post.text) {
          const file = new Blob([post.text], { type: 'text/plain' });
          const fileName = `generated-${Date.now()}-${Math.floor(Math.random()*1000)}.txt`;
          const { data: uploadData, error: uploadErr } = await this.supabase.storage.from('assets').upload(`${session.user.id}/${fileName}`, file);
          if (uploadErr) throw uploadErr;
          
          if (uploadData) {
            const { data: assetData } = await this.supabase.from('assets').insert({
              user_id: session.user.id,
              filename: fileName,
              mime_type: 'text/plain',
              size_bytes: file.size,
              storage_path: uploadData.path,
              folder: '/',
              tags: ['ai_generated'],
              source: 'ai_generated'
            }).select().single();
            if (assetData) assetIds.push(assetData.id);
          }
        }

        // 2. Image Asset
        if (post.imagePrompt) {
          try {
            const imgRes = await fetch(post.imageUrl || 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=800');
            const imgBlob = await imgRes.blob();
            const imgName = `generated-img-${Date.now()}-${Math.floor(Math.random()*1000)}.jpg`;
            const { data: imgUpload, error: imgUploadErr } = await this.supabase.storage.from('assets').upload(`${session.user.id}/${imgName}`, imgBlob);
            if (imgUploadErr) throw imgUploadErr;
            
            if (imgUpload) {
              const { data: imgAsset } = await this.supabase.from('assets').insert({
                user_id: session.user.id,
                filename: imgName,
                mime_type: 'image/jpeg',
                size_bytes: imgBlob.size,
                storage_path: imgUpload.path,
                folder: '/',
                tags: ['ai_generated', 'image'],
                source: 'ai_generated'
              }).select().single();
              if (imgAsset) assetIds.push(imgAsset.id);
            }
          } catch (e) {
            console.error('Failed to save image asset', e);
            throw e;
          }
        }

        // 3. Schedule Post
        const scheduledAt = new Date(Date.now() + (post.offsetMinutes || 0) * 60000);
        await this.supabase.from('scheduled_posts').insert({
          user_id: session.user.id,
          channel_id: channel!.id,
          text_content: post.text,
          media_asset_ids: assetIds,
          scheduled_at: scheduledAt.toISOString(),
          status: 'scheduled',
          recurrence_rule_id: rule.id
        });
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
      alert('Error saving to DB: ' + err.message);
    }
  }

  scheduleNow() {
    // Open schedule modal
  }
}
