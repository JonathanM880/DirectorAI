import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SchedulingEngineService } from '../../../features/services/scheduling-engine.service';
import {
  AssetUploadService,
  UploadedAsset,
  mimeToMediaType
} from '../../../core/services/asset-upload.service';
import { Channel, RecurrenceRule, ScheduledPost } from '@director-ai/types';
import { HlmButtonImports } from '@spartan-ng/helm/button';
import { HlmInputImports } from '@spartan-ng/helm/input';
import { HlmFieldImports } from '@spartan-ng/helm/field';
import { HlmLabelImports } from '@spartan-ng/helm/label';

// ─────────────────────────────────────────────────────────────────────────────
// Public Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Data emitted to the parent (CalendarComponent) on successful submission.
 *
 * `mediaAssetIds` contains UUIDs from the `assets` table — push them directly
 * into `scheduled_posts.media_asset_ids[]`.
 * `mediaType` is derived from the first uploaded file's MIME type and maps to
 * the CHECK constraint on `scheduled_posts.media_type`.
 */
export interface PostFormData {
  text: string;
  channelId: string;
  scheduledAt: Date;
  recurrenceRule?: RecurrenceRule;
  /** UUIDs from the `assets` table. May be empty []. */
  mediaAssetIds: string[];
  /** Derived from the first attached file's MIME type. */
  mediaType?: 'photo' | 'video' | 'audio' | 'document';
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

@Component({
  selector: 'app-post-form',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    HlmButtonImports,
    HlmInputImports,
    HlmFieldImports,
    HlmLabelImports
  ],
  templateUrl: './post-form.component.html'
})
export class PostFormComponent implements OnInit, OnDestroy {
  @Output() saved = new EventEmitter<PostFormData & { isUpdate?: boolean }>();
  @Output() cancel = new EventEmitter<void>();
  @Input() postToEdit: ScheduledPost | null = null;
  @Input() initialText: string = '';
  @Input() initialAssets: UploadedAsset[] = [];

  private schedulingEngine = inject(SchedulingEngineService);
  private assetUpload      = inject(AssetUploadService);

  // ── Channel / form loading state ──────────────────────────────────────────
  channels   = signal<Channel[]>([]);
  loading    = signal(true);
  submitting = signal(false);
  error      = signal<string | null>(null);

  // ── Upload state ──────────────────────────────────────────────────────────
  uploadedAssets = signal<UploadedAsset[]>([]);
  uploading      = signal(false);
  pendingCount   = signal(0);
  uploadError    = signal<string | null>(null);
  isDragOver     = signal(false);

  // ── Form field bindings ───────────────────────────────────────────────────
  text             = '';
  channelId        = '';
  scheduledAt      = '';
  enableRecurrence = false;
  publishImmediately = false;
  frequency: 'daily' | 'weekly' | 'monthly' = 'weekly';
  interval         = 1;
  endDate          = '';

  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  async ngOnInit(): Promise<void> {
    try {
      const chs = await this.schedulingEngine.getChannels();
      this.channels.set(chs);
      if (chs.length > 0) {
        this.channelId = chs[0].id;
      }
      if (this.postToEdit) {
        this.text = this.postToEdit.content.text || '';
        this.channelId = this.postToEdit.channelId;
        
        // Convert to local datetime-local string
        const dt = new Date(this.postToEdit.scheduledAt);
        const localStr = new Date(dt.getTime() - dt.getTimezoneOffset() * 60000)
          .toISOString()
          .slice(0, 16);
        this.scheduledAt = localStr;

        // Note: postToEdit.recurrenceRule is not on ScheduledPost by default, 
        // but if it is passed from the calendar (which now joins it), we can prefill it.
        const rule = (this.postToEdit as any).recurrenceRule;
        if (rule) {
          this.enableRecurrence = true;
          this.frequency = rule.frequency;
          this.interval = rule.interval;
          if (rule.end_date) {
            this.endDate = rule.end_date.split('T')[0];
          }
        }

        if (this.postToEdit.content.mediaAssetIds?.length) {
          const assets = await this.assetUpload.getAssetsByIds(this.postToEdit.content.mediaAssetIds);
          this.uploadedAssets.set(assets);
        }
      } else {
        if (this.initialText) {
          this.text = this.initialText;
        }
        if (this.initialAssets && this.initialAssets.length > 0) {
          this.uploadedAssets.set(this.initialAssets);
        }
      }
    } catch {
      // channels remain empty; the template shows an explanatory message
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy(): void {}

  // ─────────────────────────────────────────────────────────────────────────
  // Drag-and-Drop handlers
  // ─────────────────────────────────────────────────────────────────────────

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(true);
  }

  onDragLeave(): void {
    this.isDragOver.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDragOver.set(false);

    const files = Array.from(event.dataTransfer?.files ?? []);
    if (files.length > 0) {
      this.processFiles(files);
    }
  }

  onFileInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length > 0) {
      this.processFiles(files);
    }
    // Reset value so the same file can be re-selected after removal
    input.value = '';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Upload logic
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Validate then upload each file sequentially.
   * A single file failure does NOT abort the remaining uploads.
   */
  private async processFiles(files: File[]): Promise<void> {
    this.uploadError.set(null);
    this.uploading.set(true);
    this.pendingCount.set(files.length);

    const newAssets: UploadedAsset[] = [];

    for (const file of files) {
      // Client-side validation (size + MIME)
      const validationErr = this.assetUpload.validate(file, { maxSizeMb: 50 });
      if (validationErr) {
        this.uploadError.set(validationErr);
        this.pendingCount.update(n => n - 1);
        continue;
      }

      try {
        const asset = await this.assetUpload.upload(file);
        newAssets.push(asset);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Upload failed';
        this.uploadError.set(`${file.name}: ${msg}`);
      } finally {
        this.pendingCount.update(n => n - 1);
      }
    }

    this.uploadedAssets.update(existing => [...existing, ...newAssets]);
    this.uploading.set(false);
  }

  /**
   * Optimistically remove from UI then delete from Storage + `assets` table.
   */
  async removeAsset(asset: UploadedAsset): Promise<void> {
    this.uploadedAssets.update(existing => existing.filter(a => a.id !== asset.id));
    await this.assetUpload.remove(asset.id, asset.storagePath);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Form submission
  // ─────────────────────────────────────────────────────────────────────────

  submit(): void {
    this.error.set(null);

    if (!this.text.trim())  { this.error.set('Content is required');            return; }
    if (!this.channelId)    { this.error.set('Channel is required');            return; }

    let scheduledAtDate: Date;
    if (this.publishImmediately) {
      scheduledAtDate = new Date();
    } else {
      if (!this.scheduledAt)  { this.error.set('Schedule date is required');      return; }
      scheduledAtDate = new Date(this.scheduledAt);
      if (scheduledAtDate <= new Date())   { this.error.set('Scheduled time must be in the future'); return; }
    }

    let recurrenceRule: RecurrenceRule | undefined;
    if (!this.publishImmediately && this.enableRecurrence) {
      let finalEndDate: Date | undefined;
      if (this.endDate) {
        // Construct local string YYYY-MM-DDTHH:mm to ensure browser parses it in local time correctly
        const timePart = this.scheduledAt.split('T')[1];
        finalEndDate = new Date(`${this.endDate}T${timePart}`);
      }
      recurrenceRule = {
        frequency: this.frequency,
        interval:  Math.max(1, this.interval),
        endDate:   finalEndDate
      };
    }

    const assets        = this.uploadedAssets();
    const mediaAssetIds = assets.map(a => a.id);
    const mediaType     = assets.length > 0
      ? (mimeToMediaType(assets[0].mimeType) ?? undefined)
      : undefined;

    this.saved.emit({
      channelId: this.channelId,
      text: this.text.trim(),
      mediaAssetIds,
      mediaType,
      scheduledAt: scheduledAtDate,
      recurrenceRule,
      isUpdate: !!this.postToEdit,
      publishImmediately: this.publishImmediately
    } as any);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Display helpers (used in template)
  // ─────────────────────────────────────────────────────────────────────────

  platformIcon(platform: string): string {
    const icons: Record<string, string> = {
      telegram:  '✈️',
      twitter:   '🐦',
      instagram: '📸',
      linkedin:  '💼'
    };
    return icons[platform] ?? '📡';
  }

  mimeIcon(mime: string): string {
    if (mime.startsWith('video/'))       return '🎬';
    if (mime.startsWith('audio/'))       return '🎵';
    if (mime === 'application/pdf')      return '📄';
    if (mime.startsWith('application/')) return '📁';
    return '📎';
  }

  formatBytes(bytes: number): string {
    if (bytes < 1_024)             return `${bytes} B`;
    if (bytes < 1_048_576)         return `${(bytes / 1_024).toFixed(1)} KB`;
    return `${(bytes / 1_048_576).toFixed(1)} MB`;
  }
}