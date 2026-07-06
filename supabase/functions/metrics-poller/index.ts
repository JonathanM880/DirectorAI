import { createClient } from 'jsr:@supabase/supabase-js@2'
import { MetricsServiceImpl } from '../_shared/metrics.service.ts'

Deno.serve(async (req: Request) => {
  try {
    // Only allow POST requests for cron jobs
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    // Verify cron authorization
    const authHeader = req.headers.get('Authorization')
    if (authHeader !== `Bearer ${Deno.env.get('CRON_SECRET')}`) {
      return new Response('Unauthorized', { status: 401 })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
    }

    const supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    })

    const metricsService = new MetricsServiceImpl(supabaseClient)

    // 1. Fetch published posts for telegram in the last 7 days
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    const { data: posts, error: postsError } = await supabaseClient
      .from('scheduled_posts')
      .select('id, platform_message_id, channel_id')
      .eq('status', 'published')
      .eq('platform', 'telegram')
      .gte('published_at', oneWeekAgo.toISOString())

    if (postsError) {
      throw postsError
    }

    const results = []

    if (posts && posts.length > 0) {
      // 2. Fetch the channels to get credentials (bot tokens)
      const channelIds = Array.from(new Set(posts.map((p: any) => p.channel_id)))
      const { data: channels, error: channelsError } = await supabaseClient
        .from('channels')
        .select('id, credentials')
        .in('id', channelIds)

      if (channelsError) {
        throw channelsError
      }

      const tokenMap = new Map<string, string>()
      for (const channel of channels ?? []) {
        const token = channel.credentials?.['telegram_bot_token']
        if (token) {
          tokenMap.set(channel.id, token)
        }
      }

      for (const post of posts) {
        const token = tokenMap.get(post.channel_id)
        if (!token || !post.platform_message_id) {
          continue
        }

        // 3. Call Telegram getUpdates — Telegram Bot API does not expose views/forwards
        // via getUpdates. These fields are set to null and handled downstream.
        let views: number | null = null
        let reactions: Record<string, number> = {}
        let forwards: number | null = null
        let replies: number | null = null

        try {
          const url = `https://api.telegram.org/bot${token}/getUpdates`
          const response = await fetch(url)
          if (response.ok) {
            // getUpdates in webhook mode returns empty; this path exists for legacy polling.
            // Reactions are now handled by the telegram-webhook edge function.
            reactions = {}
          }
        } catch (err) {
          console.error(`Error polling Telegram updates: ${err.message}`)
        }

        // 4. Ingest metrics
        await metricsService.ingestMetrics(post.platform_message_id, {
          views,
          reactions,
          forwards,
          replies,
          measuredAt: new Date(),
        })

        results.push({
          postId: post.id,
          platformMessageId: post.platform_message_id,
          views,
          reactions,
        })
      }
    }

    return new Response(JSON.stringify({ success: true, processed: results.length, details: results }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error: any) {
    console.error('Metrics poller error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
