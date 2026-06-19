import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { Client } from 'pg'

const LOCAL_DB_URL = process.env.LOCAL_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'

const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const ANON_KEY = process.env.SUPABASE_ANON_KEY

if (!SERVICE_ROLE_KEY || !ANON_KEY) {
  throw new Error('Faltan las credenciales de Supabase en las variables de entorno.')
}

let pgClient: Client
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
  await pgClient.query(
    `INSERT INTO public.users_profile (id, email, timezone, plan_id, onboarding_completed) VALUES ($1, $2, 'UTC', 'starter', false)`,
    [userId, email],
  )
}

async function createRowForUser(table: string, userId: string) {
  const inserts: Record<string, string> = {
    channels: `INSERT INTO public.channels (id, user_id, platform, name, channel_identifier) VALUES (gen_random_uuid(), $1, 'telegram', 'Test', 'test') RETURNING id`,
    assets: `INSERT INTO public.assets (id, user_id, filename, mime_type, size_bytes, storage_path) VALUES (gen_random_uuid(), $1, 'file.png', 'image/png', 1024, 'assets/test.png') RETURNING id`,
    scheduled_posts: `INSERT INTO public.scheduled_posts (id, user_id, channel_id, scheduled_at, status, media_asset_ids) VALUES (gen_random_uuid(), $1, (SELECT id FROM public.channels WHERE user_id = $1 LIMIT 1), now() + interval '1 day', 'scheduled', '{}') RETURNING id`,
    subscriptions: `INSERT INTO public.subscriptions (id, user_id, stripe_customer_id, stripe_subscription_id, plan_id, status, current_period_start, current_period_end) VALUES (gen_random_uuid(), $1, 'cust_test', 'sub_test', 'starter', 'active', now(), now() + interval '1 month') RETURNING id`,
    notifications: `INSERT INTO public.notifications (id, user_id, type, severity, title, message) VALUES (gen_random_uuid(), $1, 'info', 'low', 'Test', 'Message') RETURNING id`,
    recurrence_rules: `INSERT INTO public.recurrence_rules (id, user_id, frequency) VALUES (gen_random_uuid(), $1, 'daily') RETURNING id`,
  }
  const res = await pgClient.query(inserts[table], [userId])
  return res.rows[0].id
}

async function signInClient(email: string, password: string) {
  const client = createClient(SUPABASE_URL, ANON_KEY as string, { auth: { persistSession: false } })
  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error || !data.session) throw error ?? new Error('Sign in failed')
  return createClient(SUPABASE_URL, data.session.access_token, { auth: { persistSession: false } })
}

beforeAll(async () => {
  pgClient = new Client({ connectionString: LOCAL_DB_URL })
  await pgClient.connect()
  supabaseService = createClient(SUPABASE_URL, SERVICE_ROLE_KEY as string, { auth: { persistSession: false } })

  const userA = await createAuthUser('a@example.com', 'Password123!')
  const userB = await createAuthUser('b@example.com', 'Password123!')
  userAId = userA.id
  userBId = userB.id

  await createProfile(userAId, 'a@example.com')
  await createProfile(userBId, 'b@example.com')
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

  await pgClient.query(
    `INSERT INTO public.audit_log (id, user_id, action, platform) VALUES (gen_random_uuid(), $1, 'published', 'telegram')`,
    [userAId],
  )

  supabaseUserA = await signInClient('a@example.com', 'Password123!')
  supabaseUserB = await signInClient('b@example.com', 'Password123!')
})

afterAll(async () => {
  await deleteAuthUser(userAId)
  await deleteAuthUser(userBId)
  await pgClient.end()
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