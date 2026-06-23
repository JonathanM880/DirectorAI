import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { GenAIServiceImpl } from '../_shared/gen-ai.service.ts'
import { KeyVaultServiceImpl } from '../_shared/key-vault.service.ts'
import { AssetStorageServiceImpl } from '../_shared/asset-storage.service.ts'
// Note: We'd import BillingServiceImpl, but since Dev 3 builds it, we use a mock.
import { BillingService, UsageSummary, PlanId, CheckoutSession, PortalSession, Subscription } from '../../packages/types/index.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

class MockBillingService implements BillingService {
  async createCheckoutSession() { return {} as CheckoutSession; }
  async createPortalSession() { return {} as PortalSession; }
  async getSubscription() { return {} as Subscription; }
  async handleWebhookEvent() {}
  async checkFeatureAccess() { return true; }
  async getUsage() {
    return {
      postsThisMonth: 0, postsLimit: 10,
      storageUsedBytes: 0, storageLimit: 100,
      aiGenerationsThisMonth: 0, aiGenerationsLimit: 100
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { action, payload } = await req.json()

    const keyVault = new KeyVaultServiceImpl(supabaseClient)
    const assetStorage = new AssetStorageServiceImpl(supabaseClient)
    const billing = new MockBillingService()
    
    // Pass the supabase client correctly (as 4th argument)
    const genAI = new GenAIServiceImpl(billing, assetStorage, keyVault, supabaseClient, Deno.env.get('OPENROUTER_API_KEY'))

    if (action === 'streamGenerate') {
      const { readable, writable } = new TransformStream()
      const writer = writable.getWriter()

      genAI.streamGenerate(payload, (chunk) => {
        writer.write(new TextEncoder().encode(chunk))
      }).then(() => {
        writer.close()
      }).catch((err) => {
        writer.write(new TextEncoder().encode(`Error: ${err.message}`))
        writer.close()
      })

      return new Response(readable, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      })
    } else if (action === 'brainstorm') {
      const result = await genAI.brainstorm(payload)
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } else if (action === 'generateImage') {
      const result = await genAI.generateImage(payload)
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
