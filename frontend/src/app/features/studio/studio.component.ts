import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GenAiService } from '../../core/services/gen-ai.service';
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
            <p>{{ output() }}</p>
          </div>

          <div class="actions" *ngIf="output() && !isGenerating()">
            <button class="btn" (click)="saveToAssets()">Save to Assets</button>
            <button class="btn" (click)="scheduleNow()">Schedule Now</button>
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

  mode = signal<'copy' | 'brainstorm' | 'image'>('copy');
  platform = signal<any>('twitter');
  tone = signal<any>('professional');
  prompt = signal('');

  isGenerating = signal(false);
  output = signal('');
  
  usage = signal(0);
  usageLimit = signal(100);

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
          // Display the image using an HTML tag in the output if it was supported,
          // but for now we'll just display the markdown or link to it
          this.output.set(`[Image Generated](${result.url})\n\n(Note: OpenRouter does not support free image generation, so this may be a fallback or error)`);
        }
        
        this.isGenerating.set(false);
        this.usage.update(u => u + 1);
      }
    } catch (err: any) {
      console.error(err);
      this.isGenerating.set(false);
      this.output.set('Error: ' + err.message);
    }
  }

  saveToAssets() {
    // call AssetStorageService
  }

  scheduleNow() {
    // Open schedule modal
  }
}
