import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { AssetStorageServiceImpl } from '../asset-storage.service'
import { UnsupportedMimeTypeError, AssetTooLargeError } from '@director-ai/types'

const supabaseUrl = process.env.SUPABASE_URL || 'http://localhost:54321'
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'fake-key'

describe('AssetStorageService Integration', () => {
  let supabase: SupabaseClient
  let service: AssetStorageServiceImpl
  let testUserId: string

  beforeEach(async () => {
    supabase = createClient(supabaseUrl, supabaseKey)
    service = new AssetStorageServiceImpl(supabase)

    const { data: user } = await supabase.auth.admin.createUser({
      email: `test-asset-${Date.now()}@example.com`,
      password: 'password123',
      email_confirm: true
    })
    
    testUserId = user!.user.id

    await supabase.from('users_profile').insert({
      id: testUserId,
      email: user!.user.email,
      display_name: 'Asset Tester',
      plan_id: 'starter'
    })
  })

  afterAll(async () => {
    // Cleanup will happen automatically if we truncate tables in a general teardown,
    // but for safety we can delete the user.
    if (testUserId && supabase) {
      await supabase.auth.admin.deleteUser(testUserId)
    }
  })

  it('1.5.10a Supported upload succeeds', async () => {
    const file = new File(['hello world'], 'test.txt', { type: 'text/plain' })
    const asset = await service.upload(testUserId, file, { source: 'user_upload', tags: ['test'] })
    
    expect(asset).toBeDefined()
    expect(asset.userId).toBe(testUserId)
    expect(asset.mimeType).toBe('text/plain')
    expect(asset.sizeBytes).toBe(11)

    // Verify it appears in listAssets
    const list = await service.listAssets(testUserId)
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe(asset.id)
  })

  it('1.5.10b Unsupported MIME type rejected', async () => {
    const file = new File(['fake content'], 'test.exe', { type: 'application/x-msdownload' })
    
    await expect(service.upload(testUserId, file, { source: 'user_upload' }))
      .rejects
      .toThrow(UnsupportedMimeTypeError)
  })

  it('1.5.10c Oversized image rejected', async () => {
    // text/plain limit is 1MB. Let's create a 1.1MB file buffer.
    const size = 1024 * 1024 * 1.1
    const buffer = new Uint8Array(size)
    const file = new File([buffer], 'large.txt', { type: 'text/plain' })

    await expect(service.upload(testUserId, file, { source: 'user_upload' }))
      .rejects
      .toThrow(AssetTooLargeError)
  })

  it('1.5.10d Signed URL non-empty', async () => {
    const file = new File(['content'], 'test2.txt', { type: 'text/plain' })
    const asset = await service.upload(testUserId, file, { source: 'user_upload' })

    const url = await service.getSignedUrl(asset.id)
    expect(url).toBeDefined()
    expect(url).toContain('http')
    expect(url).toContain('sign')
  })

  it('1.5.10e listAssets scoped to userId', async () => {
    // Create another user
    const { data: user2 } = await supabase.auth.admin.createUser({
      email: `test-asset2-${Date.now()}@example.com`,
      password: 'password123',
      email_confirm: true
    })
    const testUserId2 = user2!.user.id

    await supabase.from('users_profile').insert({
      id: testUserId2,
      email: user2!.user.email,
      display_name: 'Asset Tester 2',
      plan_id: 'starter'
    })

    const file = new File(['hello'], 't.txt', { type: 'text/plain' })
    await service.upload(testUserId, file, { source: 'user_upload' })

    const list2 = await service.listAssets(testUserId2)
    expect(list2).toHaveLength(0) // Should not see testUserId's assets

    await supabase.auth.admin.deleteUser(testUserId2)
  })

  it('1.5.10f deleteAsset removes from list', async () => {
    const file = new File(['delete me'], 'del.txt', { type: 'text/plain' })
    const asset = await service.upload(testUserId, file, { source: 'user_upload' })

    let list = await service.listAssets(testUserId)
    expect(list).toHaveLength(1)

    await service.deleteAsset(asset.id)

    list = await service.listAssets(testUserId)
    expect(list).toHaveLength(0)
  })
})
