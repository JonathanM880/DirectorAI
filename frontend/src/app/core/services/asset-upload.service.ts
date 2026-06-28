import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { AngularAuthService } from './auth.service';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Metadata returned after a successful asset upload.
 * The `id` field is the UUID from the `assets` table — this is what gets
 * stored in `scheduled_posts.media_asset_ids[]`.
 */
export interface UploadedAsset {
  /** UUID primary key from the `assets` table. Link this into media_asset_ids. */
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  /** Signed URL valid for 1 hour, suitable for displaying a preview. */
  previewUrl: string;
}

/**
 * Progress event emitted during upload.
 * `loaded` and `total` are in bytes.
 */
export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Name of the Supabase Storage bucket that holds user uploads. */
const BUCKET = 'user-assets';

/** Map MIME type to the media_type enum expected by scheduled_posts. */
export function mimeToMediaType(mime: string): 'photo' | 'video' | 'audio' | 'document' | null {
  if (mime.startsWith('image/'))       return 'photo';
  if (mime.startsWith('video/'))       return 'video';
  if (mime.startsWith('audio/'))       return 'audio';
  if (mime === 'application/pdf' ||
      mime.startsWith('application/')) return 'document';
  return null;
}

/** Generate a storage path that keeps each user's files isolated. */
function buildStoragePath(userId: string, file: File): string {
  const ext  = file.name.includes('.') ? file.name.split('.').pop()! : '';
  const uuid = crypto.randomUUID();
  return `users/${userId}/assets/${uuid}${ext ? '.' + ext : ''}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

/**
 * AssetUploadService – full media upload flow.
 *
 * Complete flow for a single file:
 *  1. Resolve the authenticated user ID.
 *  2. Build an isolated storage path: users/{userId}/assets/{uuid}.{ext}
 *  3. Upload the binary to Supabase Storage (bucket: user-assets).
 *  4. Insert a metadata row in the `assets` table:
 *       filename, mime_type, size_bytes, storage_path, folder, source='user_upload'
 *  5. Generate a signed preview URL (1h TTL).
 *  6. Return UploadedAsset whose `.id` is ready to push into
 *     scheduled_posts.media_asset_ids[].
 *
 * This service is provided in root and can be injected into PostFormComponent
 * or any other component that requires file attachment.
 */
@Injectable({ providedIn: 'root' })
export class AssetUploadService {
  private supabase = inject(SupabaseClient);
  private authService = inject(AngularAuthService);

  /**
   * Upload a File to Supabase Storage and record its metadata in `assets`.
   * Throws a descriptive Error on any failure so the caller can surface it.
   */
  async upload(file: File): Promise<UploadedAsset> {
    // ── Step 1: Resolve user ID ──────────────────────────────────────────────
    const user = await this.authService.getUser();
    if (!user) throw new Error('You must be logged in to upload files.');

    const userId      = user.id;
    const storagePath = buildStoragePath(userId, file);

    // ── Step 2: Upload to Supabase Storage ───────────────────────────────────
    const { error: storageError } = await this.supabase.storage
      .from(BUCKET)
      .upload(storagePath, file, {
        contentType:  file.type,
        cacheControl: '3600',
        upsert:       false,   // never silently overwrite; UUID paths make collisions impossible
      });

    if (storageError) {
      throw new Error(`Storage upload failed: ${storageError.message}`);
    }

    // ── Step 3: Insert metadata row in `assets` table ─────────────────────────
    // Schema reference: supabase/migrations/003_create_assets.sql
    const { data: assetRow, error: insertError } = await this.supabase
      .from('assets')
      .insert({
        user_id:      userId,
        filename:     file.name,
        mime_type:    file.type,
        size_bytes:   file.size,
        storage_path: storagePath,
        folder:       '/',
        tags:         [],
        source:       'user_upload',
      })
      .select('id, filename, mime_type, size_bytes, storage_path')
      .single();

    if (insertError || !assetRow) {
      // Best-effort cleanup: delete the orphaned storage object
      await this.supabase.storage.from(BUCKET).remove([storagePath]);
      throw new Error(`Failed to record asset metadata: ${insertError?.message ?? 'Unknown error'}`);
    }

    // ── Step 4: Generate a short-lived signed URL for the preview ─────────────
    const { data: signedData, error: signedError } = await this.supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, 3600); // 1-hour TTL

    const previewUrl = signedData?.signedUrl ?? '';
    if (signedError) {
      console.warn(`[AssetUploadService] Could not generate preview URL: ${signedError.message}`);
    }

    return {
      id:          assetRow.id,
      filename:    assetRow.filename,
      mimeType:    assetRow.mime_type,
      sizeBytes:   assetRow.size_bytes,
      storagePath: assetRow.storage_path,
      previewUrl,
    };
  }

  /**
   * Delete an asset from both Storage and the `assets` table.
   * Call this when the user removes an attachment before submitting the form.
   */
  async remove(assetId: string, storagePath: string): Promise<void> {
    // Remove from Storage first
    await this.supabase.storage.from(BUCKET).remove([storagePath]);

    // Delete the metadata row
    const { error } = await this.supabase
      .from('assets')
      .delete()
      .eq('id', assetId);

    if (error) {
      console.error(`[AssetUploadService] Failed to delete asset row ${assetId}: ${error.message}`);
    }
  }

  /**
   * Validate a file before uploading.
   * Returns an error string if invalid, or null if OK.
   */
  validate(file: File, options: { maxSizeMb?: number; allowedTypes?: string[] } = {}): string | null {
    const maxSizeMb    = options.maxSizeMb    ?? 50;
    const allowedTypes = options.allowedTypes ?? ['image/', 'video/', 'audio/', 'application/pdf'];

    const sizeLimitBytes = maxSizeMb * 1024 * 1024;
    if (file.size > sizeLimitBytes) {
      return `File "${file.name}" exceeds the ${maxSizeMb}MB limit (${(file.size / 1024 / 1024).toFixed(1)}MB).`;
    }

    const allowed = allowedTypes.some(prefix => file.type.startsWith(prefix));
    if (!allowed) {
      return `File type "${file.type}" is not supported. Please upload an image, video, audio, or PDF.`;
    }

    return null;
  }
}
