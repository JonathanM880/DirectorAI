import { createClient } from 'jsr:@supabase/supabase-js@2'

interface TelegramMessageReactionCount {
  chat: { id: number }
  message_id: number
  reactions: {
    type: { emoji?: string; custom_emoji_id?: string }
    total_count: number
  }[]
}

interface TelegramMessageReaction {
  chat: { id: number }
  message_id: number
  reactions: {
    type: { emoji?: string; custom_emoji_id?: string }
    new_count?: number
    total_count?: number
  }[]
}

interface TelegramUpdate {
  update_id: number
  message_reaction_count?: TelegramMessageReactionCount
  message_reaction?: TelegramMessageReaction
}

Deno.serve(async (req: Request) => {
  const secret = req.headers.get('x-telegram-bot-api-secret-token')
  if (secret !== Deno.env.get('TELEGRAM_WEBHOOK_SECRET')) {
    return new Response('Unauthorized', { status: 401 })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  )

  try {
    const update: TelegramUpdate = await req.json()
    const r = update.message_reaction_count ?? update.message_reaction
    if (!r) return new Response('ok')

    const chatId = r.chat.id
    const messageId = r.message_id

    const { data: post, error: lookupError } = await supabase
      .from('scheduled_posts')
      .select('id')
      .eq('telegram_chat_id', chatId)
      .eq('platform_message_id', messageId.toString())
      .maybeSingle()

    if (lookupError) {
      console.error(`[telegram-webhook] lookup error: ${lookupError.message}`)
      return new Response('ok', { status: 200 })
    }

    if (!post) {
      console.warn(`[telegram-webhook] post not found for chat ${chatId} message ${messageId}`)
      return new Response('ok', { status: 200 })
    }

    const reactions: Record<string, number> = {}
    for (const rc of r.reactions) {
      const key = rc.type.emoji ?? rc.type.custom_emoji_id ?? 'unknown'
      reactions[key] = rc.total_count ?? rc.new_count ?? 0
    }

    const { error: upsertError } = await supabase
      .from('post_metrics')
      .upsert(
        {
          post_id: post.id,
          platform_message_id: messageId.toString(),
          reactions,
          measured_at: new Date().toISOString(),
        },
        { onConflict: 'post_id' },
      )

    if (upsertError) {
      console.error(`[telegram-webhook] upsert error: ${upsertError.message}`)
    }

    return new Response('ok', { status: 200 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error(`[telegram-webhook] fatal error: ${message}`)
    return new Response('ok', { status: 200 })
  }
})
