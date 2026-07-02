import {
  GenAIService,
  CopyRequest,
  GeneratedCopy,
  ImageRequest,
  GeneratedImage,
  BrainstormRequest,
  BrainstormResult,
  CampaignParseRequest,
  CampaignParseResult,
  GeneratedAsset,
  BillingService,
  AssetStorageService,
  KeyVaultService,
  FeatureGatedError,
  QuotaExceededError
} from '../../../packages/types/index.ts'

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
    return `Eres un copywriter profesional de alta conversión que escribe para comunidades privadas.
  Genera un copy para ${request.platform}.
  Tono: ${request.tone || 'profesional'}.
  Instrucciones del prompt: ${request.prompt}

  REGLAS CRÍTICAS:
  - El idioma de respuesta es español
  - El contenido debe ser muy conciso, directo y realmente corto, máximo 50 palabras.
  - NO uses ningún emoji.
  - Muestra SOLAMENTE el copy final generado.
  - NO incluyas ninguna introducción conversacional, palabras de relleno ni de transición (como "¡Por supuesto!", "Claro, aquí tienes el copy", "Aquí tienes", etc.).
  - Empieza directamente con el copy en sí.`
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
        model: 'google/gemma-4-31b-it:free',
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
        model: 'google/gemma-4-31b-it:free',
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
      model: 'google/gemma-4-31b-it:free',
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
    
    // OpenRouter does not provide free image models. 
    // For testing purposes, we return a high-quality placeholder from Unsplash.
    const seed = Math.floor(Math.random() * 1000)
    const mockUrl = `https://picsum.photos/seed/${seed}/1024/1024`

    return {
      id: crypto.randomUUID(),
      url: mockUrl, 
      prompt: request.prompt,
      model: 'mock-image-generator',
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
        model: 'google/gemma-4-31b-it:free', // Ojo aquí con el nombre del modelo
        messages: [{ 
          role: 'user', 
          content: `Genera exactamente ${request.count} ideas de contenido para ${request.platform} sobre el tema: "${request.topic}". 
            La respuesta debe estar en ESPAÑOL. 
            Devuelve estrictamente un array JSON de strings plano. 
            No incluyas bloques de código markdown (como \`\`\`json), devuelve únicamente el JSON crudo.` 
        }]
      })
    })

    if (!response.ok) {
      throw new Error(`OpenRouter API error (brainstorm): ${response.statusText}`)
    }

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

  async parseCampaign(request: CampaignParseRequest): Promise<CampaignParseResult> {
    await this.checkGates(request.userId)
    const apiKey = await this.getApiKey(request.userId)

    const sysPrompt = `Eres un programador de campañas de redes sociales. Analiza la petición del usuario y conviértela en un array JSON de publicaciones.
Asegúrate de que todo el contenido generado (especialmente el texto de las publicaciones) esté en ESPAÑOL.

El formato debe ser estrictamente JSON:
[
  {
    "text": "El texto de la publicación en español",
    "imagePrompt": "Descripción de la imagen a generar (máximo 40 palabras), o null si no requiere imagen",
    "offsetMinutes": 30
  }
]
No incluyas bloques de código markdown (como \`\`\`json), devuelve únicamente el JSON crudo.`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'google/gemma-4-31b-it:free',
        messages: [
          { role: 'system', content: sysPrompt },
          { role: 'user', content: request.prompt }
        ]
      })
    })

    if (!response.ok) {
      throw new Error(`OpenRouter API error (parseCampaign): ${response.statusText}`)
    }

    const data = await response.json()
    let posts = []
    try {
      const content = data.choices?.[0]?.message?.content || '[]'
      const jsonStart = content.indexOf('[')
      const jsonEnd = content.lastIndexOf(']')
      if (jsonStart !== -1 && jsonEnd !== -1) {
        posts = JSON.parse(content.substring(jsonStart, jsonEnd + 1))
      } else {
        posts = JSON.parse(content)
      }
    } catch {
      posts = []
    }

    return {
      posts,
      platform: request.platform
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
      prompt: `Contenido original: "${originalContent}". Instrucciones: ${instructions || 'Reescribe y mejora este contenido, manteniendo el idioma español.'}`,
      platform: 'twitter' // fallback, as we don't store platform in assets
    }

    return this.generateCopy(request)
  }
}
