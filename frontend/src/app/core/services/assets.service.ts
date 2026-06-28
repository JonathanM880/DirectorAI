import { Injectable, inject } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { AssetRecord, SupportedMimeType } from '@director-ai/types';

@Injectable({
  providedIn: 'root'
})
export class AssetsService {
  private supabase = inject(SupabaseClient);
  
  // Default storage bucket name. Can be 'assets' or 'user-assets'.
  // Aligning with 'assets' as used in current components and backend, but customizable.
  private defaultBucket = 'assets';

  async getAssets(userId: string): Promise<AssetRecord[]> {
    const { data, error } = await this.supabase
      .from('assets')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching assets:', error);
      throw error;
    }

    return (data ?? []).map(row => this.mapRow(row));
  }

  async getAssetById(id: string): Promise<AssetRecord | null> {
    const { data, error } = await this.supabase
      .from('assets')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('Error fetching asset by id:', error);
      throw error;
    }

    if (!data) return null;

    return this.mapRow(data);
  }

  async getAssetsByIds(ids: string[]): Promise<AssetRecord[]> {
    if (!ids || ids.length === 0) return [];
    const { data, error } = await this.supabase
      .from('assets')
      .select('*')
      .in('id', ids);

    if (error) {
      console.error('Error fetching assets by ids:', error);
      throw error;
    }

    return (data ?? []).map(row => this.mapRow(row));
  }

  async createSignedUrl(storagePath: string, expiresInSeconds: number, bucketName = this.defaultBucket): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(bucketName)
      .createSignedUrl(storagePath, expiresInSeconds);

    if (error) {
      console.error(`Error generating signed URL for path ${storagePath}:`, error);
      throw error;
    }

    return data?.signedUrl ?? '';
  }

  async getTextContent(storagePath: string, bucketName = this.defaultBucket): Promise<string> {
    const signedUrl = await this.createSignedUrl(storagePath, 60, bucketName);
    if (!signedUrl) throw new Error('Could not generate temporary signed URL');

    const res = await fetch(signedUrl);
    if (!res.ok) throw new Error(`Failed to fetch text content: ${res.statusText}`);
    return res.text();
  }

  async uploadFile(storagePath: string, file: File | Blob, mimeType: string, bucketName = this.defaultBucket): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(bucketName)
      .upload(storagePath, file, {
        contentType: mimeType,
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error(`Error uploading file to storage path ${storagePath}:`, error);
      throw error;
    }

    return data?.path ?? storagePath;
  }

  async saveAssetMetadata(metadata: {
    user_id: string;
    filename: string;
    mime_type: string;
    size_bytes: number;
    storage_path: string;
    folder?: string;
    tags?: string[];
    source: 'user_upload' | 'ai_generated';
    generation_prompt?: string;
    ai_model?: string;
  }): Promise<AssetRecord> {
    const { data, error } = await this.supabase
      .from('assets')
      .insert({
        ...metadata,
        folder: metadata.folder ?? '/',
        tags: metadata.tags ?? []
      })
      .select()
      .single();

    if (error) {
      console.error('Error saving asset metadata:', error);
      throw error;
    }

    return this.mapRow(data);
  }

  async deleteAsset(assetId: string, storagePath: string, bucketName = this.defaultBucket): Promise<void> {
    // Delete file from storage
    const { error: storageError } = await this.supabase.storage
      .from(bucketName)
      .remove([storagePath]);

    if (storageError) {
      console.warn(`[AssetsService] Failed to delete storage file ${storagePath}:`, storageError.message);
    }

    // Delete DB record
    const { error: dbError } = await this.supabase
      .from('assets')
      .delete()
      .eq('id', assetId);

    if (dbError) {
      console.error(`[AssetsService] Failed to delete asset database record ${assetId}:`, dbError.message);
      throw dbError;
    }
  }

  private mapRow(row: any): AssetRecord {
    return {
      id: row.id,
      userId: row.user_id,
      filename: row.filename,
      mimeType: row.mime_type as SupportedMimeType,
      sizeBytes: row.size_bytes,
      storagePath: row.storage_path,
      folder: row.folder,
      tags: row.tags ?? [],
      source: row.source,
      generationPrompt: row.generation_prompt,
      aiModel: row.ai_model,
      createdAt: new Date(row.created_at)
    };
  }
}
