import { describe, it, expect, vi, beforeEach } from 'vitest'
import fc from 'fast-check'
import { GenAIServiceImpl } from '../gen-ai.service'
import {
  BillingService,
  AssetStorageService,
  KeyVaultService,
  FeatureGatedError,
  QuotaExceededError,
  CopyRequest
} from '@director-ai/types'

describe('GenAIService backend implementation', () => {
  let billingService: import('vitest').Mocked<BillingService>
  let assetStorage: import('vitest').Mocked<AssetStorageService>
  let keyVault: import('vitest').Mocked<KeyVaultService>
  let genAIService: GenAIServiceImpl

  beforeEach(() => {
    billingService = {
      createCheckoutSession: vi.fn(),
      createPortalSession: vi.fn(),
      getSubscription: vi.fn(),
      handleWebhookEvent: vi.fn(),
      checkFeatureAccess: vi.fn(),
      getUsage: vi.fn()
    }

    assetStorage = {
      upload: vi.fn(),
      getSignedUrl: vi.fn(),
      listAssets: vi.fn(),
      deleteAsset: vi.fn(),
      moveAsset: vi.fn()
    }

    keyVault = {
      storeKey: vi.fn(),
      getKey: vi.fn(),
      rotateKey: vi.fn(),
      deleteKey: vi.fn(),
      listKeyNames: vi.fn()
    }

    // Default global fetch mock
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Mock response' } }],
        usage: { total_tokens: 10 }
      })
    })

    genAIService = new GenAIServiceImpl(billingService, assetStorage, keyVault, {} as any, 'dummy_key')
  })

  it('throws FeatureGatedError when ai_generation access is denied', async () => {
    billingService.checkFeatureAccess.mockResolvedValue(false)
    const request: CopyRequest = { userId: '123', prompt: 'test', platform: 'twitter' }
    
    await expect(genAIService.generateCopy(request)).rejects.toThrowError(FeatureGatedError)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('throws QuotaExceededError when quota is met or exceeded', async () => {
    billingService.checkFeatureAccess.mockResolvedValue(true)
    billingService.getUsage.mockResolvedValue({
      postsThisMonth: 0,
      postsLimit: 10,
      storageUsedBytes: 0,
      storageLimit: 100,
      aiGenerationsThisMonth: 100,
      aiGenerationsLimit: 100
    })

    const request: CopyRequest = { userId: '123', prompt: 'test', platform: 'twitter' }
    
    await expect(genAIService.generateCopy(request)).rejects.toThrowError(QuotaExceededError)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('calls OpenRouter and returns GeneratedCopy on success', async () => {
    billingService.checkFeatureAccess.mockResolvedValue(true)
    billingService.getUsage.mockResolvedValue({
      postsThisMonth: 0,
      postsLimit: 10,
      storageUsedBytes: 0,
      storageLimit: 100,
      aiGenerationsThisMonth: 50,
      aiGenerationsLimit: 100
    })
    keyVault.getKey.mockRejectedValue(new Error('No custom key'))

    const request: CopyRequest = { userId: '123', prompt: 'test', platform: 'twitter' }
    const result = await genAIService.generateCopy(request)

    expect(global.fetch).toHaveBeenCalledWith('https://openrouter.ai/api/v1/chat/completions', expect.any(Object))
    expect(result.content).toBe('Mock response')
    expect(result.tokensUsed).toBe(10)
    expect(result.platform).toBe('twitter')
  })

  it('Property: Random users without access immediately throw FeatureGatedError', () => {
    return fc.assert(
      fc.asyncProperty(fc.string(), async (userId) => {
        billingService.checkFeatureAccess.mockResolvedValue(false)
        const request: CopyRequest = { userId, prompt: 'test', platform: 'twitter' }
        
        await expect(genAIService.generateCopy(request)).rejects.toThrowError(FeatureGatedError)
        expect(global.fetch).not.toHaveBeenCalled()
      })
    )
  })

  it('Property: Random usage levels above limit throw QuotaExceededError', () => {
    return fc.assert(
      fc.asyncProperty(
        fc.string(), 
        fc.integer({ min: 100, max: 1000 }), // current
        fc.integer({ min: 1, max: 99 }), // limit
        async (userId, current, limit) => {
          billingService.checkFeatureAccess.mockResolvedValue(true)
          billingService.getUsage.mockResolvedValue({
            postsThisMonth: 0, postsLimit: 10,
            storageUsedBytes: 0, storageLimit: 100,
            aiGenerationsThisMonth: current,
            aiGenerationsLimit: limit
          })

          const request: CopyRequest = { userId, prompt: 'test', platform: 'twitter' }
          await expect(genAIService.generateCopy(request)).rejects.toThrowError(QuotaExceededError)
        }
      )
    )
  })
})
