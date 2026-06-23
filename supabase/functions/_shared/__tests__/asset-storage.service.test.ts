import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { AssetStorageServiceImpl } from '../asset-storage.service'
import { AssetTooLargeError, UnsupportedMimeTypeError } from '@director-ai/types'
import { randomUUID } from 'crypto'

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SERVICE_ROLE_KEY) {
  throw new Error('Faltan las credenciales de Supabase en las variables de entorno.')
}

let supabaseService: ReturnType<typeof createClient>
let assetService: AssetStorageServiceImpl
let userId: string
let otherUserId: string

beforeAll(async () => {
  supabaseService = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  assetService = new AssetStorageServiceImpl(supabaseService)

  const { data: buckets } = await supabaseService.storage.listBuckets()
  if (!buckets?.find(b => b.name === 'assets')) {
    await supabaseService.storage.createBucket('assets', { public: false })
  }

  const { data: u1 } = await supabaseService.auth.admin.createUser({
    email: `u1-${randomUUID()}@directorai.com`,
    password: 'Password123!',
    email_confirm: true,
  })
  userId = u1.user!.id
  await supabaseService.from('users_profile').insert({ id: userId, email: u1.user!.email })

  const { data: u2 } = await supabaseService.auth.admin.createUser({
    email: `u2-${randomUUID()}@directorai.com`,
    password: 'Password123!',
    email_confirm: true,
  })
  otherUserId = u2.user!.id
  await supabaseService.from('users_profile').insert({ id: otherUserId, email: u2.user!.email })
})

afterAll(async () => {
  if (userId) await supabaseService.auth.admin.deleteUser(userId)
  if (otherUserId) await supabaseService.auth.admin.deleteUser(otherUserId)
})

describe('AssetStorageService backend implementation', () => {
  function createFile(content: string, name: string, type: string): File {
    return new File([content], name, { type })
  }

  function createLargeFile(size: number, name: string, type: string): File {
    const ab = new ArrayBuffer(size)
    return new File([ab], name, { type })
  }

  it('rejects unsupported MIME type', async () => {
    const file = createFile('hello', 'test.txt', 'text/plain')
    await expect(assetService.upload(userId, file, { source: 'user_upload' }))
      .rejects.toThrowError(UnsupportedMimeTypeError)
  })

  it('rejects oversized image', async () => {
    // 21 MB image > 20 MB limit
    const file = createLargeFile(21 * 1024 * 1024, 'big.jpg', 'image/jpeg')
    await expect(assetService.upload(userId, file, { source: 'user_upload' }))
      .rejects.toThrowError(AssetTooLargeError)
  })

  it('supported upload succeeds, signed URL non-empty, list scoped, delete removes', async () => {
    const file = createFile('fake-image-content', 'test.png', 'image/png')
    
    // 1. Upload
    const asset = await assetService.upload(userId, file, { source: 'user_upload', folder: '/test' })
    expect(asset.id).toBeDefined()
    expect(asset.userId).toBe(userId)
    expect(asset.mimeType).toBe('image/png')
    expect(asset.sizeBytes).toBeGreaterThan(0)
    expect(asset.folder).toBe('/test')

    // 2. getSignedUrl
    const url = await assetService.getSignedUrl(asset.id)
    expect(url).toBeDefined()
    expect(typeof url).toBe('string')
    expect(url.length).toBeGreaterThan(0)

    // 3. listAssets scoped to userId
    const file2 = createFile('fake-2', 'test2.png', 'image/png')
    const asset2 = await assetService.upload(otherUserId, file2, { source: 'user_upload' })

    const userAssets = await assetService.listAssets(userId)
    expect(userAssets.length).toBeGreaterThanOrEqual(1)
    expect(userAssets.find(a => a.id === asset.id)).toBeDefined()
    expect(userAssets.find(a => a.id === asset2.id)).toBeUndefined()

    // 4. deleteAsset
    await assetService.deleteAsset(asset.id)
    const afterDelete = await assetService.listAssets(userId)
    expect(afterDelete.find(a => a.id === asset.id)).toBeUndefined()
    
    // Cleanup asset2
    await assetService.deleteAsset(asset2.id)
  })
})
