import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.SUPABASE_ANON_KEY

if (!SERVICE_ROLE_KEY || !ANON_KEY) {
  throw new Error('Faltan las credenciales de Supabase en las variables de entorno.')
}

let supabaseService: ReturnType<typeof createClient>
let supabaseUserA: ReturnType<typeof createClient>
let supabaseUserB: ReturnType<typeof createClient>
let userAId: string
let userBId: string

async function createAuthUser(email: string, password: string) {
  const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY as string, { auth: { persistSession: false } })
  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error || !data.user) throw error ?? new Error('Failed to create auth user')
  return data.user
}

async function deleteAuthUser(uid: string) {
  const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY as string, { auth: { persistSession: false } })
  await client.auth.admin.deleteUser(uid)
}

async function createProfile(userId: string, email: string) {
  const { error } = await supabaseService
    .from('users_profile')
    .insert({ id: userId, email, timezone: 'UTC', plan_id: 'starter', onboarding_completed: false })
  if (error) throw error
}

async function createRowForUser(table: string, userId: string) {
  let data: any = {}
  if (table === 'channels') {
    data = { platform: 'telegram', name: 'Test', channel_identifier: 'test', user_id: userId }
  } else if (table === 'assets') {
    data = { filename: 'file.png', mime_type: 'image/png', size_bytes: 1024, storage_path: 'assets/test.png', source: 'user_upload', user_id: userId }
  } else if (table === 'scheduled_posts') {
    const { data: channelData, error: channelError } = await supabaseService
      .from('channels')
      .select('id')
      .eq('user_id', userId)
      .limit(1)
      .single()
    if (channelError) throw channelError
    data = {
      channel_id: channelData.id,
      scheduled_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      status: 'scheduled',
      media_asset_ids: [],
      user_id: userId
    }
  } else if (table === 'subscriptions') {
    data = {
      stripe_customer_id: 'cust_test',
      stripe_subscription_id: 'sub_test',
      plan_id: 'starter',
      status: 'active',
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      user_id: userId
    }
  } else if (table === 'notifications') {
    data = { type: 'info', severity: 'low', title: 'Test', message: 'Message', user_id: userId }
  } else if (table === 'recurrence_rules') {
    data = { frequency: 'daily', user_id: userId }
  }

  const { data: insertedData, error } = await supabaseService
    .from(table)
    .insert(data)
    .select('id')
    .single()
  if (error) throw error
  return insertedData.id
}

async function signInClient(email: string, password: string) {
  const client = createClient(SUPABASE_URL, ANON_KEY as string, { auth: { persistSession: false } })
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.session) throw error ?? new Error('Sign in failed')
  return createClient(SUPABASE_URL, ANON_KEY as string, {
    auth: { persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${data.session.access_token}`
      }
    }
  })
}

const rand = Math.random().toString(36).substring(2, 7);
const TEST_EMAIL_A = `user_a_${rand}@example.com`;
const TEST_EMAIL_B = `user_b_${rand}@example.com`;

beforeAll(async () => {
  supabaseService = createClient(SUPABASE_URL, SERVICE_ROLE_KEY as string, { auth: { persistSession: false } })

  const userA = await createAuthUser(TEST_EMAIL_A, 'Password123!')
  const userB = await createAuthUser(TEST_EMAIL_B, 'Password123!')
  userAId = userA.id
  userBId = userB.id

  await createProfile(userAId, TEST_EMAIL_A)
  await createProfile(userBId, TEST_EMAIL_B)
  await createRowForUser('channels', userAId)
  await createRowForUser('channels', userBId)
  await createRowForUser('assets', userAId)
  await createRowForUser('assets', userBId)
  await createRowForUser('scheduled_posts', userAId)
  await createRowForUser('scheduled_posts', userBId)
  await createRowForUser('subscriptions', userAId)
  await createRowForUser('subscriptions', userBId)
  await createRowForUser('notifications', userAId)
  await createRowForUser('notifications', userBId)
  await createRowForUser('recurrence_rules', userAId)
  await createRowForUser('recurrence_rules', userBId)

  const { error: auditError } = await supabaseService
    .from('audit_log')
    .insert({ user_id: userAId, action: 'published', platform: 'telegram' })
  if (auditError) throw auditError

  supabaseUserA = await signInClient(TEST_EMAIL_A, 'Password123!')
  supabaseUserB = await signInClient(TEST_EMAIL_B, 'Password123!')
})

afterAll(async () => {
  if (userAId) await deleteAuthUser(userAId)
  if (userBId) await deleteAuthUser(userBId)
})

describe('Row Level Security policies', () => {
  const protectedTables = [
    'users_profile',
    'channels',
    'assets',
    'scheduled_posts',
    'subscriptions',
    'notifications',
    'recurrence_rules',
    'audit_log',
  ]

  it('prevents user A from selecting user B rows on protected tables', async () => {
    for (const table of protectedTables) {
      const query = supabaseUserA.from(table).select('*').limit(1)
      if (table === 'users_profile') {
        query.eq('id', userBId)
      } else {
        query.eq('user_id', userBId)
      }

      const { data, error } = await query

      expect(error).toBeNull()
      expect(data).toHaveLength(0)
    }
  })

  it('prevents service_role from updating audit_log even with service role access', async () => {
    const { data: selectData } = await supabaseService
      .from('audit_log')
      .select('id')
      .eq('user_id', userAId)
      .limit(1)

    expect(selectData).toBeTruthy()
    const logId = Array.isArray(selectData) && selectData[0]?.id
    expect(logId).toBeTruthy()

    const { error } = await supabaseService
      .from('audit_log')
      .update({ platform: 'edited' })
      .eq('id', logId)

    expect(error).not.toBeNull()
    expect(error?.message).toContain('permission denied')
  })
})