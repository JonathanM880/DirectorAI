import {
  GenAIService,
  CopyRequest,
  GeneratedCopy,
  ImageRequest,
  GeneratedImage,
  BrainstormRequest,
  BrainstormResult,
  GeneratedAsset,
  BillingService,
  AssetStorageService,
  KeyVaultService,
  FeatureGatedError,
  QuotaExceededError
} from '@director-ai/types'

export class GenAIServiceImpl implements GenAIService {
  private readonly defaultOpenRouterKey: string

  constructor(
    private billingService: BillingService,
    private assetStorage: AssetStorageService,
    private keyVault: KeyVaultService,
    private supabase: any,
    defaultKey?: string
  ) {
    this.defaultOpenRouterKey = defaultKey || process.env.OPENROUTER_API_KEY || ''
  }

  private async getApiKey(userId: string): Promise<string> {
    try {
      return await this.keyVault.getKey(userId, 'openrouter_api_key')
    } catch {
      if (!this.defaultOpenRouterKey) {
        throw new Error('No OpenRouter API key configured.')
      }
      return this.defaultOpenRouterKey
    }
  }

  private async checkGates(userId: string): Promise<void> {
    const hasAccess = await this.billingService.checkFeatureAccess(userId, 'ai_generation')
    if (!hasAccess) {
      throw new FeatureGatedError('Feature ai_generation is not available on your plan', 'ai_generation')
    }

    const usage = await this.billingService.getUsage(userId)
    if (usage.aiGenerationsThisMonth >= usage.aiGenerationsLimit) {
      throw new QuotaExceededError('AI generation quota exceeded', usage.aiGenerationsLimit, usage.aiGenerationsThisMonth)
    }
  }

  private buildPrompt(request: CopyRequest): string {
    return `Generate a social media copy for ${request.platform}. Tone: ${request.tone || 'professional'}. Prompt: ${request.prompt}`
  }

  async generateCopy(request: CopyRequest): Promise<GeneratedCopy> {
    await this.checkGates(request.userId)
    const apiKey = await this.getApiKey(request.userId)
    
    const messages = [{ role: 'user', content: this.buildPrompt(request) }]
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-exp:free',
        messages
      })
    })

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.statusText}`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''
    const tokensUsed = data.usage?.total_tokens || 0

    const asset = await this.persistAndIncrement(request.userId, content, request.platform)
    
    return {
      id: asset.id, 
      content,
      platform: request.platform,
      model: data.model || 'openai/gpt-4o-mini',
      tokensUsed,
      createdAt: asset.createdAt
    }
  }

  async streamGenerate(request: CopyRequest, onChunk: (chunk: string) => void): Promise<GeneratedCopy> {
    await this.checkGates(request.userId)
    const apiKey = await this.getApiKey(request.userId)

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-exp:free',
        messages: [{ role: 'user', content: this.buildPrompt(request) }],
        stream: true
      })
    })

    if (!response.ok) throw new Error(`OpenRouter API error: ${response.statusText}`)
    
    let content = ''
    const reader = response.body?.getReader()
    const decoder = new TextDecoder()
    if (reader) {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ') && line !== 'data: [DONE]') {
            try {
              const data = JSON.parse(line.slice(6))
              const text = data.choices[0]?.delta?.content || ''
              content += text
              if (text) onChunk(text)
            } catch (e) {
              // ignore parse errors for incomplete chunks
            }
          }
        }
      }
    }

    const asset = await this.persistAndIncrement(request.userId, content, request.platform)

    return {
      id: asset.id,
      content,
      platform: request.platform,
      model: 'google/gemini-2.0-flash-exp:free',
      tokensUsed: Math.ceil(content.length / 4), 
      createdAt: asset.createdAt
    }
  }

  private async persistAndIncrement(userId: string, content: string, platform: string) {
    const file = new File([content], `generated-${Date.now()}.txt`, { type: 'text/plain' })
    const asset = await this.assetStorage.upload(userId, file, { source: 'ai_generated', tags: ['ai', platform] })
    
    const usage = await this.billingService.getUsage(userId)
    await this.supabase.from('subscriptions')
      .update({ ai_generations_this_month: usage.aiGenerationsThisMonth + 1 })
      .eq('user_id', userId)

    return asset
  }

  async generateImage(request: ImageRequest): Promise<GeneratedImage> {
    await this.checkGates(request.userId)
    const apiKey = await this.getApiKey(request.userId)

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'openai/dall-e-3',
        messages: [{ role: 'user', content: `Generate an image. Style: ${request.style}. Aspect Ratio: ${request.aspectRatio}. Prompt: ${request.prompt}` }]
      })
    })

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content || ''
    
    return {
      id: crypto.randomUUID(),
      url: content, 
      prompt: request.prompt,
      model: 'openai/dall-e-3',
      createdAt: new Date()
    }
  }

  async brainstorm(request: BrainstormRequest): Promise<BrainstormResult> {
    await this.checkGates(request.userId)
    const apiKey = await this.getApiKey(request.userId)

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-exp:free',
        messages: [{ role: 'user', content: `Brainstorm exactly ${request.count} ideas for ${request.platform} about ${request.topic}. Output strictly a JSON array of strings.` }]
      })
    })

    const data = await response.json()
    let ideas: string[] = []
    try {
      const content = data.choices?.[0]?.message?.content || '[]'
      const jsonStart = content.indexOf('[')
      const jsonEnd = content.lastIndexOf(']')
      if (jsonStart !== -1 && jsonEnd !== -1) {
        ideas = JSON.parse(content.substring(jsonStart, jsonEnd + 1))
      } else {
        ideas = [content]
      }
    } catch {
      ideas = [data.choices?.[0]?.message?.content || '']
    }

    return {
      ideas: ideas.slice(0, request.count),
      platform: request.platform,
      count: ideas.length
    }
  }

  async regenerate(assetId: string, instructions?: string): Promise<GeneratedAsset> {
    const { data: asset, error } = await this.supabase
      .from('assets')
      .select('*')
      .eq('id', assetId)
      .single()

    if (error || !asset) {
      throw new Error(`Asset not found: ${assetId}`)
    }

    const url = await this.assetStorage.getSignedUrl(assetId)
    const res = await fetch(url)
    const originalContent = await res.text()

    const request: CopyRequest = {
      userId: asset.user_id,
      prompt: `Original content: "${originalContent}". Instructions: ${instructions || 'Regenerate this.'}`,
      platform: 'twitter' // fallback, as we don't store platform in assets
    }

    return this.generateCopy(request)
  }
}
