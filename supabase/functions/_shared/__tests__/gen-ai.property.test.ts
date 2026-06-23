import { describe, it, expect, vi } from 'vitest'
import fc from 'fast-check'
import { GenAIServiceImpl } from '../gen-ai.service'
import { 
  BillingService, 
  AssetStorageService, 
  KeyVaultService, 
  FeatureGatedError, 
  QuotaExceededError,
  UsageSummary
} from '@director-ai/types'

describe('GenAIService Property Tests', () => {
  const createMockService = (hasAccess: boolean, usage: UsageSummary) => {
    const mockBilling: BillingService = {
      createCheckoutSession: vi.fn(),
      handleWebhookEvent: vi.fn(),
      checkFeatureAccess: vi.fn().mockResolvedValue(hasAccess),
      getUsage: vi.fn().mockResolvedValue(usage),
      createPortalSession: vi.fn()
    }
    
    const mockStorage: AssetStorageService = {
      upload: vi.fn(),
      getSignedUrl: vi.fn(),
      listAssets: vi.fn(),
      deleteAsset: vi.fn(),
      moveAsset: vi.fn()
    }
    
    const mockVault: KeyVaultService = {
      storeKey: vi.fn(),
      getKey: vi.fn().mockResolvedValue('test-key'),
      rotateKey: vi.fn(),
      deleteKey: vi.fn(),
      listKeyNames: vi.fn()
    }
    
    return new GenAIServiceImpl(mockBilling, mockStorage, mockVault, {})
  }

  it('2.3.1 Feature Gate Consistency: Blocks access when feature gate fails', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(), 
        fc.string(), 
        async (userId, prompt) => {
          const service = createMockService(false, {
            postsThisMonth: 0,
            postsLimit: 100,
            storageUsedBytes: 0,
            storageLimitBytes: 1000,
            aiGenerationsThisMonth: 0,
            aiGenerationsLimit: 100
          })

          await expect(service.generateCopy({ userId, prompt, platform: 'twitter' }))
            .rejects
            .toThrow(FeatureGatedError)
        }
      )
    )
  })

  it('2.3.2 Quota Gate: Blocks when usage >= limit, passes otherwise', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.string(),
        fc.integer({ min: 0, max: 1000 }), // aiGenerationsThisMonth
        fc.integer({ min: 1, max: 1000 }), // aiGenerationsLimit
        async (userId, prompt, used, limit) => {
          // If used < limit, we expect it to attempt the OpenRouter call (which fails here because we mock fetch or we just catch the network error)
          // If used >= limit, we expect QuotaExceededError BEFORE any fetch attempt.
          const service = createMockService(true, {
            postsThisMonth: 0,
            postsLimit: 100,
            storageUsedBytes: 0,
            storageLimitBytes: 1000,
            aiGenerationsThisMonth: used,
            aiGenerationsLimit: limit
          })

          if (used >= limit) {
            await expect(service.generateCopy({ userId, prompt, platform: 'twitter' }))
              .rejects
              .toThrow(QuotaExceededError)
          } else {
            // It passes the quota check, so it should attempt the OpenRouter fetch.
            // Since we don't mock fetch here, it will throw 'OpenRouter API error' or similar network error,
            // but crucially it MUST NOT throw QuotaExceededError or FeatureGatedError.
            try {
              await service.generateCopy({ userId, prompt, platform: 'twitter' })
            } catch (err: any) {
              expect(err).not.toBeInstanceOf(QuotaExceededError)
              expect(err).not.toBeInstanceOf(FeatureGatedError)
            }
          }
        }
      )
    )
  })
})
