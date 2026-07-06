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
import { generateText, generateImage } from './providers.ts'

export class GenAIServiceImpl implements GenAIService {
  private readonly defaultOpenRouterKey: string
  private readonly defaultGeminiKey: string

  constructor(
    private billingService: BillingService,
    private assetStorage: AssetStorageService,
    private keyVault: KeyVaultService,
    private supabase: any,
    defaultOpenRouterKey?: string,
    defaultGeminiKey?: string
  ) {
    this.defaultOpenRouterKey = defaultOpenRouterKey || Deno.env.get('OPENROUTER_API_KEY') || ''
    this.defaultGeminiKey = defaultGeminiKey || Deno.env.get('GEMINI_API_KEY') || ''
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
    
    const prompt = this.buildPrompt(request)
    const result = await generateText(prompt, {
      userId: request.userId,
      keyVault: this.keyVault
    })

    const asset = await this.persistAndIncrement(request.userId, result.content, request.platform)
    
    return {
      id: asset.id, 
      content: result.content,
      platform: request.platform,
      model: result.model,
      tokensUsed: result.tokensUsed,
      createdAt: asset.createdAt
    }
  }

  async streamGenerate(request: CopyRequest, onChunk: (chunk: string) => void): Promise<GeneratedCopy> {
    await this.checkGates(request.userId)
    
    const prompt = this.buildPrompt(request)
    const result = await generateText(prompt, {
      userId: request.userId,
      keyVault: this.keyVault,
      stream: true,
      onChunk
    })

    const asset = await this.persistAndIncrement(request.userId, result.content, request.platform)

    return {
      id: asset.id,
      content: result.content,
      platform: request.platform,
      model: result.model,
      tokensUsed: result.tokensUsed,
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

    const result = await generateImage(request.prompt, {
      userId: request.userId,
      keyVault: this.keyVault,
      aspectRatio: request.aspectRatio
    })

    const usage = await this.billingService.getUsage(request.userId)
    await this.supabase.from('subscriptions')
      .update({ ai_generations_this_month: usage.aiGenerationsThisMonth + 1 })
      .eq('user_id', request.userId)

    return {
      id: result.id,
      url: result.url,
      prompt: request.prompt,
      model: result.model,
      createdAt: result.createdAt
    }
  }

  async brainstorm(request: BrainstormRequest): Promise<BrainstormResult> {
    await this.checkGates(request.userId)

    const prompt = `Genera exactamente ${request.count} ideas de contenido para ${request.platform} sobre el tema: "${request.topic}". 
      La respuesta debe estar en ESPAÑOL. 
      Devuelve estrictamente un array JSON de strings plano. 
      No incluyas bloques de código markdown (como \`\`\`json), devuelve únicamente el JSON crudo.`

    const result = await generateText(prompt, {
      userId: request.userId,
      keyVault: this.keyVault
    })

    let ideas: string[] = []
    try {
      const content = result.content
      const jsonStart = content.indexOf('[')
      const jsonEnd = content.lastIndexOf(']')
      if (jsonStart !== -1 && jsonEnd !== -1) {
        ideas = JSON.parse(content.substring(jsonStart, jsonEnd + 1))
      } else {
        ideas = [content]
      }
    } catch {
      ideas = [result.content]
    }

    return {
      ideas: ideas.slice(0, request.count),
      platform: request.platform,
      count: ideas.length
    }
  }

  async parseCampaign(request: CampaignParseRequest): Promise<CampaignParseResult> {
    await this.checkGates(request.userId)

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

    const result = await generateText(request.prompt, {
      userId: request.userId,
      keyVault: this.keyVault,
      systemPrompt: sysPrompt
    })

    let posts = []
    try {
      const content = result.content
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
