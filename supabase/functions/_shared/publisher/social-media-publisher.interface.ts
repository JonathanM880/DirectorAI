import {
  SocialMediaPublisher,
  PlatformCapabilities,
  ValidationResult,
  PublishResult,
  ScheduledPost,
  ChannelConfig,
  SocialPlatform,
  PublishErrorCode,
} from '@director-ai/types';

/**
 * Base implementation of SocialMediaPublisher with common validation logic.
 * Platform-specific publishers should extend this class.
 */
export abstract class BasePublisher implements SocialMediaPublisher {
  abstract readonly platform: SocialPlatform;
  protected abstract capabilities: PlatformCapabilities;

  /**
   * Validates a post against platform capabilities.
   * Happy path: returns valid=true if all constraints are satisfied.
   * Violation path: returns valid=false with descriptive error messages.
   */
  validatePost(post: ScheduledPost): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check text length constraint
    if (post.content.text && post.content.text.length > this.capabilities.maxTextLength) {
      errors.push(
        `Text exceeds maximum length of ${this.capabilities.maxTextLength} characters (got ${post.content.text.length})`
      );
    }

    // Check media type support
    if (post.content.mediaType) {
      const mediaSupported = this.isMediaTypeSupported(post.content.mediaType);
      if (!mediaSupported) {
        errors.push(`Media type '${post.content.mediaType}' is not supported by ${this.platform}`);
      }
    }

    // Check if media assets are provided when media type is specified
    if (post.content.mediaType && (!post.content.mediaAssetIds || post.content.mediaAssetIds.length === 0)) {
      errors.push(`Media type '${post.content.mediaType}' specified but no media assets provided`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Publish a post to the platform.
   * Includes duplicate-publish guard: if post.status === 'published', returns CONTENT_REJECTED.
   */
  async publish(post: ScheduledPost, channel: ChannelConfig): Promise<PublishResult> {
    // Duplicate-publish guard
    if (post.status === 'published') {
      return {
        success: false,
        platformMessageId: '',
        publishedAt: new Date(),
        platform: this.platform,
        error: {
          code: 'CONTENT_REJECTED' as PublishErrorCode,
          message: 'Post has already been published and cannot be published again',
          retryable: false,
        },
      };
    }

    // Validate before publishing
    const validation = this.validatePost(post);
    if (!validation.valid) {
      return {
        success: false,
        platformMessageId: '',
        publishedAt: new Date(),
        platform: this.platform,
        error: {
          code: 'CONTENT_REJECTED' as PublishErrorCode,
          message: `Post validation failed: ${validation.errors.join(', ')}`,
          retryable: false,
        },
      };
    }

    // Delegate to platform-specific implementation
    return this.doPublish(post, channel);
  }

  /**
   * Platform-specific publish implementation. Must be implemented by subclasses.
   */
  protected abstract doPublish(post: ScheduledPost, channel: ChannelConfig): Promise<PublishResult>;

  /**
   * Delete a post from the platform.
   */
  abstract delete(platformMessageId: string, channel: ChannelConfig): Promise<void>;

  /**
   * Edit a post on the platform.
   */
  abstract edit(platformMessageId: string, post: ScheduledPost, channel: ChannelConfig): Promise<PublishResult>;

  /**
   * Get platform capabilities.
   */
  getCapabilities(): PlatformCapabilities {
    return this.capabilities;
  }

  /**
   * Check if a media type is supported by this platform.
   */
  private isMediaTypeSupported(mediaType: string): boolean {
    switch (mediaType) {
      case 'photo':
        return this.capabilities.supportsImages;
      case 'video':
        return this.capabilities.supportsVideo;
      case 'audio':
        return this.capabilities.supportsAudio;
      case 'document':
        return this.capabilities.supportsPDFs;
      default:
        return false;
    }
  }
}

/**
 * Publisher registry for managing platform-specific publishers.
 * Ensures SchedulingEngine only interacts with SocialMediaPublisher interface.
 */
export class PublisherRegistry {
  private publishers = new Map<SocialPlatform, SocialMediaPublisher>();

  /**
   * Register a publisher for a specific platform.
   */
  register(platform: SocialPlatform, publisher: SocialMediaPublisher): void {
    if (publisher.platform !== platform) {
      throw new Error(`Publisher platform '${publisher.platform}' does not match registered platform '${platform}'`);
    }
    this.publishers.set(platform, publisher);
  }

  /**
   * Get a publisher for a specific platform.
   */
  get(platform: SocialPlatform): SocialMediaPublisher {
    const publisher = this.publishers.get(platform);
    if (!publisher) {
      throw new Error(`No publisher registered for platform '${platform}'`);
    }
    return publisher;
  }

  /**
   * Check if a publisher is registered for a platform.
   */
  has(platform: SocialPlatform): boolean {
    return this.publishers.has(platform);
  }

  /**
   * Get all registered platforms.
   */
  getRegisteredPlatforms(): SocialPlatform[] {
    return Array.from(this.publishers.keys());
  }
}
