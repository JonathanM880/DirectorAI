import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'
import { BillingServiceImpl } from '../_shared/billing.service'

const SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321'
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? 'sk_test_stub'
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_stub'

if (!SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY must be set in .env')
}

let svc: ReturnType<typeof createClient>
let billingService: BillingServiceImpl
let userId: string
let channelId: string
let postId: string
const rand = Math.random().toString(36).substring(2, 8)
const EMAIL = `billing_${rand}@directorai.com`
const PASSWORD = 'Password123!'
const STRIPE_CUSTOMER_ID = `cus_test_${rand}`
const STRIPE_SUBSCRIPTION_ID = `sub_test_${rand}`

async function createTestUser() {
  const { data, error } = await svc.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
  })
  if (error || !data.user) throw error ?? new Error('Failed to create test user')

  await svc.from('users_profile').insert({
    id: data.user.id,
    email: EMAIL,
    timezone: 'UTC',
    plan_id: 'starter',
    onboarding_completed: false,
  })
  return data.user.id
}

async function createTestChannel(uid: string): Promise<string> {
  const { data, error } = await svc
    .from('channels')
    .insert({ user_id: uid, platform: 'telegram', name: 'Metrics Channel', channel_identifier: '@metrics_test', is_active: true })
    .select('id')
    .single()
  if (error || !data) throw error ?? new Error('Failed to create channel')
  return data.id
}

beforeAll(async () => {
  svc = createClient(SUPABASE_URL, SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
  billingService = new BillingServiceImpl(svc, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET)
  userId = await createTestUser()
  channelId = await createTestChannel(userId)
})

afterAll(async () => {
  if (userId) {
    try { await svc.from('scheduled_posts').delete().eq('user_id', userId) } catch {}
    try { await svc.from('subscriptions').delete().eq('user_id', userId) } catch {}
    try { await svc.from('channels').delete().eq('user_id', userId) } catch {}
    try { await svc.from('users_profile').delete().eq('id', userId) } catch {}
    try { await svc.auth.admin.deleteUser(userId) } catch {}
  }
})

describe('7.2 Stripe Webhook Integration', () => {
  it('Test 1: checkout.session.completed updates subscription to active', async () => {
    const payload = JSON.stringify({
      type: 'checkout.session.completed',
      data: {
        object: {
          client_reference_id: userId,
          customer: STRIPE_CUSTOMER_ID,
          subscription: STRIPE_SUBSCRIPTION_ID
        }
      }
    })

    await billingService.handleWebhookEvent(payload, 'valid_signature')

    const { data: sub } = await svc.from('subscriptions').select('*').eq('user_id', userId).single()
    expect(sub).toBeDefined()
    expect(sub.status).toBe('active')
    expect(sub.plan_id).toBe('professional')
    expect(sub.stripe_customer_id).toBe(STRIPE_CUSTOMER_ID)
    expect(sub.stripe_subscription_id).toBe(STRIPE_SUBSCRIPTION_ID)
  })

  it('Test 2: invoice.payment_failed updates to past_due and pauses posts', async () => {
    // Schedule a post to verify it gets paused
    const { data: post } = await svc.from('scheduled_posts').insert({
      user_id: userId,
      channel_id: channelId,
      text_content: 'Test pause',
      media_asset_ids: [],
      scheduled_at: new Date(Date.now() + 100000).toISOString(),
      status: 'scheduled',
      retry_count: 0,
      max_retries: 3
    }).select('id').single()

    postId = post!.id

    const payload = JSON.stringify({
      type: 'invoice.payment_failed',
      data: {
        object: {
          customer: STRIPE_CUSTOMER_ID,
          subscription: STRIPE_SUBSCRIPTION_ID
        }
      }
    })

    await billingService.handleWebhookEvent(payload, 'valid_signature')

    // Verify subscription status
    const { data: sub } = await svc.from('subscriptions').select('*').eq('user_id', userId).single()
    expect(sub.status).toBe('past_due')

    // Verify pending post is paused (changed to draft)
    const { data: pausedPost } = await svc.from('scheduled_posts').select('*').eq('id', postId).single()
    expect(pausedPost.status).toBe('draft')
  })

  it('Test 3: invalid signature is rejected with no DB mutation', async () => {
    const payload = JSON.stringify({
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: STRIPE_SUBSCRIPTION_ID
        }
      }
    })

    await expect(
      billingService.handleWebhookEvent(payload, 'invalid_signature')
    ).rejects.toThrow('Webhook Error: Invalid signature')

    // Verify subscription was NOT deleted/cancelled
    const { data: sub } = await svc.from('subscriptions').select('*').eq('user_id', userId).single()
    expect(sub.status).toBe('past_due') // Should remain past_due from previous test
  })
})
