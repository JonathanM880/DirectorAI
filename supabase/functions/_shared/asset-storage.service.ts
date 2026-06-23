import { SupabaseClient } from '@supabase/supabase-js'
import {
  AssetStorageService,
  Asset,
  AssetMetadata,
  AssetFilter,
  SupportedMimeType,
  AssetTooLargeError,
  UnsupportedMimeTypeError,
} from '@director-ai/types'

const SUPPORTED_MIME_TYPES: SupportedMimeType[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/wav',
  'application/pdf',
  'text/plain',
]

const MB = 1024 * 1024

const SIZE_LIMITS: Record<string, number> = {
  'image/jpeg': 20 * MB,
  'image/png': 20 * MB,
  'image/webp': 20 * MB,
  'image/gif': 20 * MB,
  'video/mp4': 200 * MB,
  'video/webm': 200 * MB,
  'audio/mpeg': 50 * MB,
  'audio/wav': 50 * MB,
  'application/pdf': 50 * MB,
  'text/plain': 1 * MB,
}

export class AssetStorageServiceImpl implements AssetStorageService {
  constructor(private supabase: SupabaseClient) {}

  async upload(userId: string, file: File, metadata: AssetMetadata): Promise<Asset> {
    const mimeType = file.type as SupportedMimeType

    if (!SUPPORTED_MIME_TYPES.includes(mimeType)) {
      throw new UnsupportedMimeTypeError(
        `Unsupported MIME type: ${file.type}`,
        file.type,
        SUPPORTED_MIME_TYPES
      )
    }

    const maxBytes = SIZE_LIMITS[mimeType] || 0
    if (file.size > maxBytes) {
      throw new AssetTooLargeError(
        `File size exceeds limit of ${maxBytes} bytes`,
        maxBytes,
        file.size
      )
    }

    const id = crypto.randomUUID()
    const storagePath = `${userId}/${id}-${file.name}`

    const { error: uploadError } = await this.supabase.storage
      .from('assets')
      .upload(storagePath, file)

    if (uploadError) {
      throw uploadError
    }

    const { data: dbData, error: dbError } = await this.supabase
      .from('assets')
      .insert({
        id,
        user_id: userId,
        filename: file.name,
        mime_type: mimeType,
        size_bytes: file.size,
        storage_path: storagePath,
        folder: metadata.folder || '/',
        tags: metadata.tags || [],
        source: metadata.source,
      })
      .select()
      .single()

    if (dbError) {
      // Rollback storage if DB insert fails
      await this.supabase.storage.from('assets').remove([storagePath])
      throw dbError
    }

    return this.mapToAsset(dbData)
  }

  async getSignedUrl(assetId: string, expiresIn = 3600): Promise<string> {
    const { data: asset, error: dbError } = await this.supabase
      .from('assets')
      .select('storage_path')
      .eq('id', assetId)
      .single()

    if (dbError || !asset) {
      throw new Error(`Asset not found: ${assetId}`)
    }

    const { data, error } = await this.supabase.storage
      .from('assets')
      .createSignedUrl(asset.storage_path, expiresIn)

    if (error || !data?.signedUrl) {
      throw new Error(`Failed to generate signed URL: ${error?.message || 'Unknown error'}`)
    }

    return data.signedUrl
  }

  async listAssets(userId: string, filter?: AssetFilter): Promise<Asset[]> {
    let query = this.supabase.from('assets').select('*').eq('user_id', userId)

    if (filter) {
      if (filter.folder) query = query.eq('folder', filter.folder)
      if (filter.source) query = query.eq('source', filter.source)
      if (filter.mimeType) query = query.eq('mime_type', filter.mimeType)
      if (filter.tags && filter.tags.length > 0) query = query.contains('tags', filter.tags)
    }

    const { data, error } = await query

    if (error) {
      throw error
    }

    return (data || []).map(this.mapToAsset)
  }

  async deleteAsset(assetId: string): Promise<void> {
    const { data: asset, error: fetchError } = await this.supabase
      .from('assets')
      .select('storage_path')
      .eq('id', assetId)
      .single()

    if (fetchError || !asset) {
      throw new Error(`Asset not found: ${assetId}`)
    }

    const { error: dbError } = await this.supabase
      .from('assets')
      .delete()
      .eq('id', assetId)

    if (dbError) {
      throw dbError
    }

    const { error: storageError } = await this.supabase.storage
      .from('assets')
      .remove([asset.storage_path])

    if (storageError) {
      throw storageError
    }
  }

  async moveAsset(assetId: string, targetFolder: string): Promise<Asset> {
    const { data, error } = await this.supabase
      .from('assets')
      .update({ folder: targetFolder })
      .eq('id', assetId)
      .select()
      .single()

    if (error || !data) {
      throw new Error(`Failed to move asset: ${error?.message || 'Not found'}`)
    }

    return this.mapToAsset(data)
  }

  private mapToAsset(row: any): Asset {
    return {
      id: row.id,
      userId: row.user_id,
      filename: row.filename,
      mimeType: row.mime_type,
      sizeBytes: parseInt(row.size_bytes, 10),
      storageUrl: row.storage_path, // Note: interface expects 'storageUrl' but we map storage_path here
      folder: row.folder,
      tags: row.tags,
      source: row.source,
      createdAt: new Date(row.created_at),
    }
  }
}
