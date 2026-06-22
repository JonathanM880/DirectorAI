import {
  SocialPlatform,
  ScheduledPost,
  ChannelConfig,
  PlatformCapabilities,
  PublishResult,
  PublishErrorCode,
  PublishError,
} from '@director-ai/types';
import { BasePublisher } from './social-media-publisher.interface';

/**
 * Telegram-specific payload types for Bot API calls
 */
interface TelegramSendMessagePayload {
  chat_id: string;
  text: string;
  parse_mode?: 'Markdown' | 'MarkdownV2' | 'HTML';
  disable_web_page_preview?: boolean;
}

interface TelegramSendMediaPayload {
  chat_id: string;
  caption?: string;
  parse_mode?: 'Markdown' | 'MarkdownV2' | 'HTML';
}

interface TelegramApiResponse {
  ok: boolean;
  result?: {
    message_id: number;
    chat: {
      id: number;
    };
  };
  error_code?: number;
  description?: string;
}

/**
 * TelegramPublisher implements SocialMediaPublisher for the Telegram Bot API.
 * This is the only platform-specific code that knows about Telegram.
 */
export class TelegramPublisher extends BasePublisher {
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

  /**
   * Platform-specific publish implementation for Telegram.
   * Makes exactly one HTTP call to the Telegram Bot API.
   */
  protected async doPublish(post: ScheduledPost, channel: ChannelConfig): Promise<PublishResult> {
    const token = channel.credentials['telegram_bot_token'];
    if (!token) {
      return {
        success: false,
        platformMessageId: '',
        publishedAt: new Date(),
        platform: this.platform,
        error: {
          code: 'INVALID_TOKEN' as PublishErrorCode,
          message: 'telegram_bot_token not found in channel credentials',
          retryable: false,
        },
      };
    }

    const payload = this.buildPayload(post, channel);
    const endpoint = this.getEndpoint(post.content.mediaType);

    try {
      const response = await this.callTelegramApi(token, endpoint, payload);

      if (response.ok && response.result?.message_id) {
        return {
          success: true,
          platformMessageId: response.result.message_id.toString(),
          publishedAt: new Date(),
          platform: this.platform,
        };
      } else {
        const error = this.mapApiError(response.error_code, response.description);
        return {
          success: false,
          platformMessageId: '',
          publishedAt: new Date(),
          platform: this.platform,
          error,
        };
      }
    } catch (error) {
      const mappedError = this.mapApiError(undefined, error instanceof Error ? error.message : String(error));
      return {
        success: false,
        platformMessageId: '',
        publishedAt: new Date(),
        platform: this.platform,
        error: mappedError,
      };
    }
  }

  /**
   * Delete a message from Telegram.
   */
  async delete(platformMessageId: string, channel: ChannelConfig): Promise<void> {
    const token = channel.credentials['telegram_bot_token'];
    if (!token) {
      throw new Error('telegram_bot_token not found in channel credentials');
    }

    const url = `https://api.telegram.org/bot${token}/deleteMessage`;
    const payload = {
      chat_id: channel.channelId,
      message_id: parseInt(platformMessageId, 10),
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json() as TelegramApiResponse;
      throw new Error(`Failed to delete message: ${errorData.description || 'Unknown error'}`);
    }
  }

  /**
   * Edit a message on Telegram.
   */
  async edit(platformMessageId: string, post: ScheduledPost, channel: ChannelConfig): Promise<PublishResult> {
    const token = channel.credentials['telegram_bot_token'];
    if (!token) {
      return {
        success: false,
        platformMessageId: '',
        publishedAt: new Date(),
        platform: this.platform,
        error: {
          code: 'INVALID_TOKEN' as PublishErrorCode,
          message: 'telegram_bot_token not found in channel credentials',
          retryable: false,
        },
      };
    }

    const url = `https://api.telegram.org/bot${token}/editMessageText`;
    const payload = {
      chat_id: channel.channelId,
      message_id: parseInt(platformMessageId, 10),
      text: post.content.text || '',
      parse_mode: 'Markdown' as const,
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json() as TelegramApiResponse;

      if (data.ok) {
        return {
          success: true,
          platformMessageId,
          publishedAt: new Date(),
          platform: this.platform,
        };
      } else {
        const error = this.mapApiError(data.error_code, data.description);
        return {
          success: false,
          platformMessageId: '',
          publishedAt: new Date(),
          platform: this.platform,
          error,
        };
      }
    } catch (error) {
      const mappedError = this.mapApiError(undefined, error instanceof Error ? error.message : String(error));
      return {
        success: false,
        platformMessageId: '',
        publishedAt: new Date(),
        platform: this.platform,
        error: mappedError,
      };
    }
  }

  /**
   * Build the appropriate payload for Telegram Bot API based on media type.
   * Applies Telegram Markdown formatting.
   */
  private buildPayload(post: ScheduledPost, channel: ChannelConfig): Record<string, unknown> {
    const basePayload = {
      chat_id: channel.channelId,
    };

    const text = post.content.text || '';
    const formattedText = this.applyMarkdownFormatting(text);

    switch (post.content.mediaType) {
      case 'photo':
        return {
          ...basePayload,
          photo: post.content.mediaAssetIds?.[0], // In production, this would be a URL or file_id
          caption: formattedText,
          parse_mode: 'Markdown' as const,
        };
      case 'video':
        return {
          ...basePayload,
          video: post.content.mediaAssetIds?.[0],
          caption: formattedText,
          parse_mode: 'Markdown' as const,
        };
      case 'audio':
        return {
          ...basePayload,
          audio: post.content.mediaAssetIds?.[0],
          caption: formattedText,
          parse_mode: 'Markdown' as const,
        };
      case 'document':
        return {
          ...basePayload,
          document: post.content.mediaAssetIds?.[0],
          caption: formattedText,
          parse_mode: 'Markdown' as const,
        };
      default:
        return {
          ...basePayload,
          text: formattedText,
          parse_mode: 'Markdown' as const,
          disable_web_page_preview: true,
        };
    }
  }

  /**
   * Get the appropriate Telegram Bot API endpoint based on media type.
   */
  private getEndpoint(mediaType?: string): string {
    switch (mediaType) {
      case 'photo':
        return 'sendPhoto';
      case 'video':
        return 'sendVideo';
      case 'audio':
        return 'sendAudio';
      case 'document':
        return 'sendDocument';
      default:
        return 'sendMessage';
    }
  }

  /**
   * Make an HTTP call to the Telegram Bot API.
   */
  private async callTelegramApi(
    token: string,
    endpoint: string,
    payload: Record<string, unknown>
  ): Promise<TelegramApiResponse> {
    const url = `https://api.telegram.org/bot${token}/${endpoint}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    return await response.json() as TelegramApiResponse;
  }

  /**
   * Map Telegram API errors to PublishError with appropriate codes and retry flags.
   * HTTP 5xx or network timeout -> NETWORK_ERROR (retryable: true)
   * HTTP 401 -> INVALID_TOKEN (retryable: false)
   */
  private mapApiError(errorCode?: number, description?: string): PublishError {
    if (errorCode === 401) {
      return {
        code: 'INVALID_TOKEN' as PublishErrorCode,
        message: description || 'Invalid Telegram bot token',
        retryable: false,
      };
    }

    if (errorCode && errorCode >= 500) {
      return {
        code: 'NETWORK_ERROR' as PublishErrorCode,
        message: description || 'Telegram server error',
        retryable: true,
      };
    }

    // Network timeout or other errors
    if (!errorCode) {
      return {
        code: 'NETWORK_ERROR' as PublishErrorCode,
        message: description || 'Network error or timeout',
        retryable: true,
      };
    }

    // Other errors (4xx except 401)
    return {
      code: 'CONTENT_REJECTED' as PublishErrorCode,
      message: description || `Telegram API error: ${errorCode}`,
      retryable: false,
    };
  }

  /**
   * Apply Telegram Markdown formatting to text.
   * Converts basic markdown to Telegram-compatible format.
   */
  private applyMarkdownFormatting(text: string): string {
    // Basic markdown conversion - in production, this would be more sophisticated
    // For now, we escape special characters and apply basic formatting
    return text
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/&/g, '&amp;');
  }
}
