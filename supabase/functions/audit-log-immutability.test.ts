import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.SUPABASE_ANON_KEY

if (!SERVICE_ROLE_KEY || !ANON_KEY) {
  throw new Error('Missing Supabase credentials in environment variables.')
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function serviceClient() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY as string, {
    auth: { persistSession: false },
  })
}

async function createAuthUser(email: string, password: string) {
  const client = serviceClient()
  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !data.user) throw error ?? new Error('Failed to create auth user')
  return data.user
}

async function deleteAuthUser(uid: string) {
  const client = serviceClient()
  await client.auth.admin.deleteUser(uid)
}

async function createProfile(userId: string, email: string) {
  const { error } = await serviceClient()
    .from('users_profile')
    .insert({
      id: userId,
      email,
      timezone: 'UTC',
      plan_id: 'starter',
      onboarding_completed: false,
    })
  if (error) throw error
}

async function signInClient(email: string, password: string) {
  const anon = createClient(SUPABASE_URL, ANON_KEY as string, {
    auth: { persistSession: false },
  })
  const { data, error } = await anon.auth.signInWithPassword({ email, password })
  if (error || !data.session) throw error ?? new Error('Sign in failed')
  return createClient(SUPABASE_URL, ANON_KEY as string, {
    auth: { persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
      },
    },
  })
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const rand = Math.random().toString(36).substring(2, 10)
const EMAIL_A = `audit_a_${rand}@example.com`
const EMAIL_B = `audit_b_${rand}@example.com`
const PASSWORD = 'Password123!'

let svc: ReturnType<typeof createClient>
let userAId: string
let userBId: string
let clientA: ReturnType<typeof createClient>
let clientB: ReturnType<typeof createClient>

beforeAll(async () => {
  svc = serviceClient()

  const authA = await createAuthUser(EMAIL_A, PASSWORD)
  const authB = await createAuthUser(EMAIL_B, PASSWORD)
  userAId = authA.id
  userBId = authB.id

  await createProfile(userAId, EMAIL_A)
  await createProfile(userBId, EMAIL_B)

  clientA = await signInClient(EMAIL_A, PASSWORD)
  clientB = await signInClient(EMAIL_B, PASSWORD)
})

afterAll(async () => {
  // Clean up – ignore errors if already gone
  try { if (userAId) await deleteAuthUser(userAId) } catch { /* ignore */ }
  try { if (userBId) await deleteAuthUser(userBId) } catch { /* ignore */ }
})

// ===========================================================================
// 4.3.1 – RLS blocks UPDATE and DELETE on audit_log
// ===========================================================================
describe('4.3.1 – RLS blocks UPDATE and DELETE on audit_log', () => {
  let logId: string

  beforeAll(async () => {
    // Insert an audit record via service_role
    const { data, error } = await svc
      .from('audit_log')
      .insert({
        user_id: userAId,
        action: 'published',
        platform: 'telegram',
      })
      .select('id')
      .single()
    if (error) throw error
    logId = data.id
  })

  it('service_role UPDATE on audit_log is rejected by trigger', async () => {
    const { error } = await svc
      .from('audit_log')
      .update({ platform: 'edited' })
      .eq('id', logId)

    expect(error).not.toBeNull()
    expect(error!.message).toContain('permission denied')
  })

  it('service_role DELETE on audit_log is rejected by trigger', async () => {
    const { error } = await svc
      .from('audit_log')
      .delete()
      .eq('id', logId)

    expect(error).not.toBeNull()
    expect(error!.message).toContain('permission denied')
  })

  it('authenticated user UPDATE on audit_log silently affects zero rows (RLS USING false)', async () => {
    // RLS policy "audit_log_deny_update" has USING (false), so the UPDATE
    // matches no rows. Supabase returns error: null with no rows affected.
    const { error } = await clientA
      .from('audit_log')
      .update({ platform: 'hacked' })
      .eq('id', logId)

    expect(error).toBeNull()

    // Verify the record is actually unchanged (still has original platform)
    const { data } = await svc
      .from('audit_log')
      .select('platform')
      .eq('id', logId)
      .single()
    expect(data!.platform).toBe('telegram')
  })

  it('authenticated user DELETE on audit_log silently affects zero rows (RLS USING false)', async () => {
    const { error } = await clientA
      .from('audit_log')
      .delete()
      .eq('id', logId)

    expect(error).toBeNull()

    // Verify the record still exists
    const { data } = await svc
      .from('audit_log')
      .select('id')
      .eq('id', logId)
      .single()
    expect(data).not.toBeNull()
  })
})

// ===========================================================================
// 4.3.2 – occurred_at server-side default prevents client override
// ===========================================================================
describe('4.3.2 – occurred_at server-side default prevents client override', () => {
  it('trigger overrides client-supplied occurred_at with server now()', async () => {
    const fakeDate = '2000-01-01T00:00:00Z'

    const { data, error } = await svc
      .from('audit_log')
      .insert({
        user_id: userAId,
        action: 'published',
        platform: 'telegram',
        occurred_at: fakeDate,
      })
      .select('occurred_at')
      .single()

    expect(error).toBeNull()
    expect(data).not.toBeNull()
    // The trigger should have replaced the fake date with the server timestamp
    expect(data!.occurred_at).not.toBe(fakeDate)
    // The inserted value should be close to "now" (within 10 seconds)
    const occurredMs = new Date(data!.occurred_at).getTime()
    const nowMs = Date.now()
    expect(Math.abs(nowMs - occurredMs)).toBeLessThan(10_000)
  })

  it('INSERT without occurred_at still gets a server-side default', async () => {
    const { data, error } = await svc
      .from('audit_log')
      .insert({
        user_id: userAId,
        action: 'failed',
        platform: 'discord',
      })
      .select('occurred_at')
      .single()

    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data!.occurred_at).toBeTruthy()

    const occurredMs = new Date(data!.occurred_at).getTime()
    const nowMs = Date.now()
    expect(Math.abs(nowMs - occurredMs)).toBeLessThan(10_000)
  })
})

// ===========================================================================
// 4.3.3 – SELECT RLS restricts to user_id = auth.uid()
// ===========================================================================
describe('4.3.3 – SELECT RLS restricts audit_log to owning user', () => {
  let userALogId: string

  beforeAll(async () => {
    // Insert a record owned by user A
    const { data, error } = await svc
      .from('audit_log')
      .insert({
        user_id: userAId,
        action: 'published',
        platform: 'telegram',
      })
      .select('id')
      .single()
    if (error) throw error
    userALogId = data.id
  })

  it('user A can SELECT their own audit record', async () => {
    const { data, error } = await clientA
      .from('audit_log')
      .select('*')
      .eq('id', userALogId)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0].user_id).toBe(userAId)
  })

  it('user B cannot SELECT user A audit record', async () => {
    const { data, error } = await clientB
      .from('audit_log')
      .select('*')
      .eq('id', userALogId)

    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('user B sees only their own records in a broad SELECT', async () => {
    // Insert a record for user B so we know they have at least one
    const { data: insertData, error: insertError } = await svc
      .from('audit_log')
      .insert({
        user_id: userBId,
        action: 'retried',
        platform: 'discord',
      })
      .select('id')
      .single()
    expect(insertError).toBeNull()

    const { data, error } = await clientB
      .from('audit_log')
      .select('*')

    expect(error).toBeNull()
    expect(data!.length).toBeGreaterThanOrEqual(1)
    // Every returned row must belong to user B
    for (const row of data!) {
      expect(row.user_id).toBe(userBId)
    }
    // None of the rows should be user A's record
    const ids = data!.map((r) => r.id)
    expect(ids).not.toContain(userALogId)
  })
})

// ===========================================================================
// 4.3.5 – Full immutability integration test
// ===========================================================================
describe('4.3.5 – Full immutability verification', () => {
  let fullTestId: string

  it('step 1: insert an audit record via service_role', async () => {
    const { data, error } = await svc
      .from('audit_log')
      .insert({
        user_id: userAId,
        action: 'published',
        platform: 'telegram',
        metadata: { post_id: 'test-123' },
      })
      .select('id, user_id, action, platform, metadata, occurred_at')
      .single()

    expect(error).toBeNull()
    expect(data).not.toBeNull()
    expect(data!.user_id).toBe(userAId)
    expect(data!.action).toBe('published')
    expect(data!.occurred_at).toBeTruthy()

    fullTestId = data!.id
  })

  it('step 2: DELETE is rejected', async () => {
    const { error } = await svc
      .from('audit_log')
      .delete()
      .eq('id', fullTestId)

    expect(error).not.toBeNull()
    expect(error!.message).toContain('permission denied')

    // Verify the record still exists
    const { data } = await svc
      .from('audit_log')
      .select('id')
      .eq('id', fullTestId)
      .single()

    expect(data).not.toBeNull()
    expect(data!.id).toBe(fullTestId)
  })

  it('step 3: UPDATE is rejected', async () => {
    const { error } = await svc
      .from('audit_log')
      .update({ action: 'edited', platform: 'hacked' })
      .eq('id', fullTestId)

    expect(error).not.toBeNull()
    expect(error!.message).toContain('permission denied')

    // Verify the record is unchanged
    const { data } = await svc
      .from('audit_log')
      .select('action, platform')
      .eq('id', fullTestId)
      .single()

    expect(data).not.toBeNull()
    expect(data!.action).toBe('published')
    expect(data!.platform).toBe('telegram')
  })

  it('step 4: SELECT from different user returns empty', async () => {
    // User B should not see user A's record
    const { data, error } = await clientB
      .from('audit_log')
      .select('*')
      .eq('id', fullTestId)

    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it('step 4 (continued): owning user CAN still SELECT the record', async () => {
    const { data, error } = await clientA
      .from('audit_log')
      .select('*')
      .eq('id', fullTestId)

    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0].id).toBe(fullTestId)
    expect(data![0].user_id).toBe(userAId)
  })
})
