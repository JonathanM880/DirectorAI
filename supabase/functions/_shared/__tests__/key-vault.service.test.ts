import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { KeyVaultServiceImpl } from '../key-vault.service'

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.SUPABASE_ANON_KEY

if (!SERVICE_ROLE_KEY || !ANON_KEY) {
  throw new Error('Faltan las credenciales de Supabase en las variables de entorno.')
}

let supabaseService: ReturnType<typeof createClient>
let keyVaultService: KeyVaultServiceImpl
const rand = Math.random().toString(36).substring(2, 7)
const TEST_EMAIL_A = `user_vault_a_${rand}@directorai.com`
const TEST_EMAIL_B = `user_vault_b_${rand}@directorai.com`
const TEST_PASSWORD = 'Password123!'
let userAId: string
let userBId: string

async function createAuthUser(email: string) {
  const { data, error } = await supabaseService.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  })
  if (error || !data.user) {
    throw error ?? new Error('Failed to create test user')
  }
  
  // Create profile
  const { error: profileError } = await supabaseService
    .from('users_profile')
    .insert({ id: data.user.id, email, timezone: 'UTC', plan_id: 'starter', onboarding_completed: false })
  if (profileError) {
    throw profileError
  }
  
  return data.user.id
}

beforeAll(async () => {
  supabaseService = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  keyVaultService = new KeyVaultServiceImpl(supabaseService)

  userAId = await createAuthUser(TEST_EMAIL_A)
  userBId = await createAuthUser(TEST_EMAIL_B)
})

beforeEach(async () => {
  if (userAId) {
    await keyVaultService.deleteKey(userAId, 'telegram_bot_token').catch(() => {})
    await keyVaultService.deleteKey(userAId, 'openrouter_api_key').catch(() => {})
    await keyVaultService.deleteKey(userAId, 'google_calendar_refresh_token').catch(() => {})
  }
  if (userBId) {
    await keyVaultService.deleteKey(userBId, 'telegram_bot_token').catch(() => {})
    await keyVaultService.deleteKey(userBId, 'openrouter_api_key').catch(() => {})
    await keyVaultService.deleteKey(userBId, 'google_calendar_refresh_token').catch(() => {})
  }
})

afterAll(async () => {
  // Clean up users (dependent profiles, keys, and audit logs will cascade delete or clean up)
  if (userAId) {
    await supabaseService.auth.admin.deleteUser(userAId)
  }
  if (userBId) {
    await supabaseService.auth.admin.deleteUser(userBId)
  }
})

describe('KeyVaultService backend implementation', () => {
  it('storeKey encrypts and getKey decrypts the secret value', async () => {
    const keyName = 'telegram_bot_token'
    const tokenValue = '123456:ABC-def_GHI'

    await keyVaultService.storeKey(userAId, keyName, tokenValue)

    const retrieved = await keyVaultService.getKey(userAId, keyName)
    expect(retrieved).toBe(tokenValue)
  })

  it('rotateKey updates the stored secret value', async () => {
    const keyName = 'openrouter_api_key'
    const initialValue = 'sk-or-initial-key'
    const rotatedValue = 'sk-or-rotated-key'

    await keyVaultService.storeKey(userAId, keyName, initialValue)
    const retrievedInitial = await keyVaultService.getKey(userAId, keyName)
    expect(retrievedInitial).toBe(initialValue)

    await keyVaultService.rotateKey(userAId, keyName, rotatedValue)
    const retrievedRotated = await keyVaultService.getKey(userAId, keyName)
    expect(retrievedRotated).toBe(rotatedValue)
  })

  it('deleteKey deletes secret and removes key from listKeyNames', async () => {
    const keyName = 'google_calendar_refresh_token'
    const tokenValue = 'refresh-token-xyz'

    await keyVaultService.storeKey(userAId, keyName, tokenValue)

    let keyNames = await keyVaultService.listKeyNames(userAId)
    expect(keyNames).toContain(keyName)

    await keyVaultService.deleteKey(userAId, keyName)

    keyNames = await keyVaultService.listKeyNames(userAId)
    expect(keyNames).not.toContain(keyName)

    await expect(keyVaultService.getKey(userAId, keyName)).rejects.toThrow()
  })

  it('listKeyNames is strictly scoped to the userId and prevents cross-user leakage', async () => {
    const keyNameA = 'telegram_bot_token'
    const keyNameB = 'openrouter_api_key'

    await keyVaultService.storeKey(userAId, keyNameA, 'tokenA')
    await keyVaultService.storeKey(userBId, keyNameB, 'tokenB')

    const keysA = await keyVaultService.listKeyNames(userAId)
    const keysB = await keyVaultService.listKeyNames(userBId)

    expect(keysA).toContain(keyNameA)
    expect(keysA).not.toContain(keyNameB)

    expect(keysB).toContain(keyNameB)
    expect(keysB).not.toContain(keyNameA)
  })

  it('operations are audit logged with the correct action and metadata', async () => {
    const keyName = 'telegram_bot_token'
    
    // Clear old audit logs for this user to make assertion clean
    await supabaseService.from('audit_log').delete().eq('user_id', userAId)

    await keyVaultService.storeKey(userAId, keyName, 'token-value')

    const { data: logs, error } = await supabaseService
      .from('audit_log')
      .select('*')
      .eq('user_id', userAId)
      .eq('action', 'edited')
      .order('occurred_at', { ascending: false })

    expect(error).toBeNull()
    expect(logs).not.toBeNull()
    expect(logs!.length).toBeGreaterThanOrEqual(1)
    expect(logs![0].platform).toBe('vault')
    expect(logs![0].metadata).toMatchObject({
      keyName,
      operation: 'storeKey'
    })
  })
})
