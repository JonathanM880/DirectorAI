import { describe, it, expect, beforeEach } from 'vitest';
import {
  SocialPlatform,
  ScheduledPost,
  ChannelConfig,
  PlatformCapabilities,
  PostStatus,
  PublishErrorCode,
} from '@director-ai/types';
import { BasePublisher, PublisherRegistry } from './social-media-publisher.interface';

/**
 * Mock publisher implementation for testing.
 */
class MockPublisher extends BasePublisher {
  readonly platform: SocialPlatform = 'telegram';
  protected capabilities: PlatformCapabilities = {
    maxTextLength: 4096,
    supportsImages: true,
    supportsVideo: true,
    supportsAudio: true,
    supportsPDFs: true,
    supportsCarousel: false,
    supportsScheduledEdit: false,
  };

  private shouldSucceed = true;
  private publishCallCount = 0;

  setShouldSucceed(value: boolean): void {
    this.shouldSucceed = value;
  }

  getPublishCallCount(): number {
    return this.publishCallCount;
  }

  protected async doPublish(post: ScheduledPost, channel: ChannelConfig) {
    this.publishCallCount++;
    if (this.shouldSucceed) {
      return {
        success: true,
        platformMessageId: 'msg_123',
        publishedAt: new Date(),
        platform: this.platform,
      };
    } else {
      return {
        success: false,
        platformMessageId: '',
        publishedAt: new Date(),
        platform: this.platform,
        error: {
          code: 'NETWORK_ERROR' as PublishErrorCode,
          message: 'Network error',
          retryable: true,
        },
      };
    }
  }

  async delete(platformMessageId: string, channel: ChannelConfig): Promise<void> {
    // Mock implementation
  }

  async edit(platformMessageId: string, post: ScheduledPost, channel: ChannelConfig) {
    // Mock implementation
    return {
      success: true,
      platformMessageId,
      publishedAt: new Date(),
      platform: this.platform,
    };
  }
}

describe('BasePublisher', () => {
  let publisher: MockPublisher;
  let validPost: ScheduledPost;
  let channel: ChannelConfig;

  beforeEach(() => {
    publisher = new MockPublisher();
    channel = {
      platform: 'telegram',
      channelId: 'channel_123',
      credentials: { bot_token: 'test_token' },
    };
    validPost = {
      id: 'post_1',
      userId: 'user_1',
      platform: 'telegram',
      channelId: 'channel_123',
      content: {
        text: 'Hello world',
        mediaAssetIds: [],
      },
      scheduledAt: new Date(Date.now() + 3600000),
      status: 'scheduled',
      retryCount: 0,
      maxRetries: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });

  describe('validatePost - happy path', () => {
    it('should return valid=true for a post with text within max length', () => {
      const result = publisher.validatePost(validPost);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
      expect(result.warnings).toEqual([]);
    });

    it('should return valid=true for a post with supported media type', () => {
      const postWithMedia = {
        ...validPost,
        content: {
          text: 'Hello',
          mediaType: 'photo' as const,
          mediaAssetIds: ['asset_1'],
        },
      };
      const result = publisher.validatePost(postWithMedia);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should return valid=true for a post with no text and no media', () => {
      const postNoContent = {
        ...validPost,
        content: {},
      };
      const result = publisher.validatePost(postNoContent);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });
  });

  describe('validatePost - violation path', () => {
    it('should return valid=false with message when text exceeds max length', () => {
      const longText = 'a'.repeat(5000);
      const postTooLong = {
        ...validPost,
        content: {
          text: longText,
          mediaAssetIds: [],
        },
      };
      const result = publisher.validatePost(postTooLong);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('exceeds maximum length');
      expect(result.errors[0]).toContain('4096');
    });

    it('should return valid=false with message for unsupported media type', () => {
      const publisherNoVideo = new MockPublisher();
      // Override capabilities to not support video
      (publisherNoVideo as any).capabilities = {
        maxTextLength: 4096,
        supportsImages: true,
        supportsVideo: false,
        supportsAudio: true,
        supportsPDFs: true,
        supportsCarousel: false,
        supportsScheduledEdit: false,
      };

      const postWithVideo = {
        ...validPost,
        content: {
          text: 'Hello',
          mediaType: 'video' as const,
          mediaAssetIds: ['asset_1'],
        },
      };
      const result = publisherNoVideo.validatePost(postWithVideo);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('video');
      expect(result.errors[0]).toContain('not supported');
    });

    it('should return valid=false when media type specified but no assets provided', () => {
      const postNoAssets = {
        ...validPost,
        content: {
          text: 'Hello',
          mediaType: 'photo' as const,
          mediaAssetIds: [],
        },
      };
      const result = publisher.validatePost(postNoAssets);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('no media assets provided');
    });

    it('should return valid=false with multiple errors when multiple violations exist', () => {
      const longText = 'a'.repeat(5000);
      const postMultipleViolations = {
        ...validPost,
        content: {
          text: longText,
          mediaType: 'photo' as const,
          mediaAssetIds: [],
        },
      };
      const result = publisher.validatePost(postMultipleViolations);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  describe('publish - duplicate-publish guard', () => {
    it('should return CONTENT_REJECTED error when post.status is published', async () => {
      const publishedPost = {
        ...validPost,
        status: 'published' as PostStatus,
      };
      const result = await publisher.publish(publishedPost, channel);
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('CONTENT_REJECTED');
      expect(result.error?.message).toContain('already been published');
      expect(result.error?.retryable).toBe(false);
      // Should not call the platform API
      expect(publisher.getPublishCallCount()).toBe(0);
    });
  });

  describe('publish - validation before platform API', () => {
    it('should return CONTENT_REJECTED when validation fails', async () => {
      const longText = 'a'.repeat(5000);
      const invalidPost = {
        ...validPost,
        content: {
          text: longText,
          mediaAssetIds: [],
        },
      };
      const result = await publisher.publish(invalidPost, channel);
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('CONTENT_REJECTED');
      expect(result.error?.message).toContain('validation failed');
      expect(result.error?.retryable).toBe(false);
      // Should not call the platform API
      expect(publisher.getPublishCallCount()).toBe(0);
    });
  });

  describe('publish - successful path', () => {
    it('should call doPublish and return success result for valid post', async () => {
      publisher.setShouldSucceed(true);
      const result = await publisher.publish(validPost, channel);
      expect(result.success).toBe(true);
      expect(result.platformMessageId).toBe('msg_123');
      expect(result.platform).toBe('telegram');
      expect(publisher.getPublishCallCount()).toBe(1);
    });
  });

  describe('getCapabilities', () => {
    it('should return the platform capabilities', () => {
      const caps = publisher.getCapabilities();
      expect(caps.maxTextLength).toBe(4096);
      expect(caps.supportsImages).toBe(true);
      expect(caps.supportsVideo).toBe(true);
      expect(caps.supportsCarousel).toBe(false);
    });
  });
});

describe('PublisherRegistry', () => {
  let registry: PublisherRegistry;
  let mockPublisher: MockPublisher;

  beforeEach(() => {
    registry = new PublisherRegistry();
    mockPublisher = new MockPublisher();
  });

  describe('register', () => {
    it('should register a publisher for a platform', () => {
      registry.register('telegram', mockPublisher);
      expect(registry.has('telegram')).toBe(true);
    });

    it('should throw error when publisher platform does not match registered platform', () => {
      expect(() => {
        registry.register('twitter', mockPublisher);
      }).toThrow("Publisher platform 'telegram' does not match registered platform 'twitter'");
    });

    it('should allow overwriting an existing publisher', () => {
      registry.register('telegram', mockPublisher);
      const newPublisher = new MockPublisher();
      registry.register('telegram', newPublisher);
      expect(registry.get('telegram')).toBe(newPublisher);
    });
  });

  describe('get', () => {
    it('should return the registered publisher', () => {
      registry.register('telegram', mockPublisher);
      const retrieved = registry.get('telegram');
      expect(retrieved).toBe(mockPublisher);
    });

    it('should throw error when no publisher registered for platform', () => {
      expect(() => {
        registry.get('twitter');
      }).toThrow("No publisher registered for platform 'twitter'");
    });
  });

  describe('has', () => {
    it('should return true when publisher is registered', () => {
      registry.register('telegram', mockPublisher);
      expect(registry.has('telegram')).toBe(true);
    });

    it('should return false when publisher is not registered', () => {
      expect(registry.has('twitter')).toBe(false);
    });
  });

  describe('getRegisteredPlatforms', () => {
    it('should return empty array when no publishers registered', () => {
      expect(registry.getRegisteredPlatforms()).toEqual([]);
    });

    it('should return array of registered platforms', () => {
      registry.register('telegram', mockPublisher);
      const twitterPublisher = new MockPublisher();
      (twitterPublisher as any).platform = 'twitter';
      registry.register('twitter', twitterPublisher);

      const platforms = registry.getRegisteredPlatforms();
      expect(platforms).toContain('telegram');
      expect(platforms).toContain('twitter');
      expect(platforms.length).toBe(2);
    });
  });
});
