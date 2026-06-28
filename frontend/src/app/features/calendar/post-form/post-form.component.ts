import {
  Component,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
  inject,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SchedulingEngineService } from '../../services/scheduling-engine.service';
import {
  AssetUploadService,
  UploadedAsset,
  mimeToMediaType
} from '../../../core/services/asset-upload.service';
import { Channel, RecurrenceRule } from '@director-ai/types';

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
  imports: [CommonModule, FormsModule],
  templateUrl: './post-form.component.html',
  styleUrls: ['./post-form.component.scss']
})
export class PostFormComponent implements OnInit, OnDestroy {
  @Output() saved = new EventEmitter<PostFormData>();
  @Output() cancel = new EventEmitter<void>();

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
    if (!this.scheduledAt)  { this.error.set('Schedule date is required');      return; }

    const dt = new Date(this.scheduledAt);
    if (dt <= new Date())   { this.error.set('Scheduled time must be in the future'); return; }

    let recurrenceRule: RecurrenceRule | undefined;
    if (this.enableRecurrence) {
      recurrenceRule = {
        frequency: this.frequency,
        interval:  Math.max(1, this.interval),
        endDate:   this.endDate ? new Date(this.endDate) : undefined
      };
    }

    const assets        = this.uploadedAssets();
    const mediaAssetIds = assets.map(a => a.id);
    const mediaType     = assets.length > 0
      ? (mimeToMediaType(assets[0].mimeType) ?? undefined)
      : undefined;

    this.saved.emit({
      text: this.text,
      channelId: this.channelId,
      scheduledAt: dt,
      recurrenceRule,
      mediaAssetIds,
      mediaType
    });
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