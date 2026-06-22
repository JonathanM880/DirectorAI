import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SocialPlatform,
  ScheduledPost,
  ChannelConfig,
  PlatformCapabilities,
  PostStatus,
  PublishErrorCode,
} from '@director-ai/types';
import { TelegramPublisher } from './telegram.publisher';

// Type declaration for Deno environment
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

// Mock fetch globally
const mockFetch = vi.fn();
// @ts-ignore - Deno environment
globalThis.fetch = mockFetch;

describe('TelegramPublisher', () => {
  let publisher: TelegramPublisher;
  let validPost: ScheduledPost;
  let channel: ChannelConfig;

  beforeEach(() => {
    publisher = new TelegramPublisher();
    mockFetch.mockClear();

    channel = {
      platform: 'telegram',
      channelId: '123456789',
      credentials: {
        telegram_bot_token: 'test_bot_token_123',
      },
    };

    validPost = {
      id: 'post_1',
      userId: 'user_1',
      platform: 'telegram',
      channelId: '123456789',
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

  describe('getCapabilities', () => {
    it('should return correct Telegram capabilities', () => {
      const caps = publisher.getCapabilities();
      expect(caps.maxTextLength).toBe(4096);
      expect(caps.supportsImages).toBe(true);
      expect(caps.supportsVideo).toBe(true);
      expect(caps.supportsAudio).toBe(true);
      expect(caps.supportsPDFs).toBe(true);
      expect(caps.supportsCarousel).toBe(false);
      expect(caps.supportsScheduledEdit).toBe(false);
    });
  });

  describe('buildPayload (via publish)', () => {
    it('should build sendMessage payload for text-only post', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          result: { message_id: 123, chat: { id: 123456789 } },
        }),
      });

      await publisher.publish(validPost, channel);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toContain('sendMessage');
      
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.chat_id).toBe('123456789');
      expect(body.text).toBe('Hello world');
      expect(body.parse_mode).toBe('Markdown');
    });

    it('should build sendPhoto payload for photo media type', async () => {
      const photoPost = {
        ...validPost,
        content: {
          text: 'Photo caption',
          mediaType: 'photo' as const,
          mediaAssetIds: ['asset_123'],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          result: { message_id: 124, chat: { id: 123456789 } },
        }),
      });

      await publisher.publish(photoPost, channel);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toContain('sendPhoto');
      
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.photo).toBe('asset_123');
      expect(body.caption).toBe('Photo caption');
      expect(body.parse_mode).toBe('Markdown');
    });

    it('should build sendVideo payload for video media type', async () => {
      const videoPost = {
        ...validPost,
        content: {
          text: 'Video caption',
          mediaType: 'video' as const,
          mediaAssetIds: ['asset_456'],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          result: { message_id: 125, chat: { id: 123456789 } },
        }),
      });

      await publisher.publish(videoPost, channel);

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toContain('sendVideo');
      
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.video).toBe('asset_456');
    });

    it('should build sendAudio payload for audio media type', async () => {
      const audioPost = {
        ...validPost,
        content: {
          text: 'Audio caption',
          mediaType: 'audio' as const,
          mediaAssetIds: ['asset_789'],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          result: { message_id: 126, chat: { id: 123456789 } },
        }),
      });

      await publisher.publish(audioPost, channel);

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toContain('sendAudio');
      
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.audio).toBe('asset_789');
    });

    it('should build sendDocument payload for document media type', async () => {
      const docPost = {
        ...validPost,
        content: {
          text: 'Document caption',
          mediaType: 'document' as const,
          mediaAssetIds: ['asset_abc'],
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          result: { message_id: 127, chat: { id: 123456789 } },
        }),
      });

      await publisher.publish(docPost, channel);

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toContain('sendDocument');
      
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.document).toBe('asset_abc');
    });
  });

  describe('mapApiError (via publish error responses)', () => {
    it('should map HTTP 401 to INVALID_TOKEN with retryable: false', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: false,
          error_code: 401,
          description: 'Unauthorized',
        }),
      });

      const result = await publisher.publish(validPost, channel);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_TOKEN');
      expect(result.error?.retryable).toBe(false);
    });

    it('should map HTTP 5xx to NETWORK_ERROR with retryable: true', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: false,
          error_code: 500,
          description: 'Internal Server Error',
        }),
      });

      const result = await publisher.publish(validPost, channel);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NETWORK_ERROR');
      expect(result.error?.retryable).toBe(true);
    });

    it('should map HTTP 503 to NETWORK_ERROR with retryable: true', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: false,
          error_code: 503,
          description: 'Service Unavailable',
        }),
      });

      const result = await publisher.publish(validPost, channel);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NETWORK_ERROR');
      expect(result.error?.retryable).toBe(true);
    });

    it('should map network timeout to NETWORK_ERROR with retryable: true', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

      const result = await publisher.publish(validPost, channel);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('NETWORK_ERROR');
      expect(result.error?.retryable).toBe(true);
    });

    it('should map other 4xx errors to CONTENT_REJECTED with retryable: false', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: false,
          error_code: 400,
          description: 'Bad Request',
        }),
      });

      const result = await publisher.publish(validPost, channel);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('CONTENT_REJECTED');
      expect(result.error?.retryable).toBe(false);
    });
  });

  describe('publish - success path', () => {
    it('should return success with platformMessageId on successful API call', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          result: { message_id: 12345, chat: { id: 123456789 } },
        }),
      });

      const result = await publisher.publish(validPost, channel);

      expect(result.success).toBe(true);
      expect(result.platformMessageId).toBe('12345');
      expect(result.platform).toBe('telegram');
      expect(result.publishedAt).toBeInstanceOf(Date);
    });

    it('should make exactly one HTTP call to Telegram Bot API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          result: { message_id: 123, chat: { id: 123456789 } },
        }),
      });

      await publisher.publish(validPost, channel);

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should extract telegram_bot_token from channel.credentials', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          result: { message_id: 123, chat: { id: 123456789 } },
        }),
      });

      await publisher.publish(validPost, channel);

      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toContain('test_bot_token_123');
    });

    it('should return INVALID_TOKEN error when telegram_bot_token is missing', async () => {
      const channelWithoutToken = {
        ...channel,
        credentials: {},
      };

      const result = await publisher.publish(validPost, channelWithoutToken);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_TOKEN');
      expect(result.error?.retryable).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('should call Telegram deleteMessage API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true }),
      });

      await publisher.delete('12345', channel);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toContain('deleteMessage');
      expect(callArgs[0]).toContain('test_bot_token_123');
      
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.chat_id).toBe('123456789');
      expect(body.message_id).toBe(12345);
    });

    it('should throw error when telegram_bot_token is missing', async () => {
      const channelWithoutToken = {
        ...channel,
        credentials: {},
      };

      await expect(publisher.delete('12345', channelWithoutToken)).rejects.toThrow(
        'telegram_bot_token not found in channel credentials'
      );
    });

    it('should throw error when API call fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          description: 'Message to delete not found',
        }),
      });

      await expect(publisher.delete('12345', channel)).rejects.toThrow('Failed to delete message');
    });
  });

  describe('edit', () => {
    it('should call Telegram editMessageText API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          result: { message_id: 12345 },
        }),
      });

      const result = await publisher.edit('12345', validPost, channel);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toContain('editMessageText');
      
      const body = JSON.parse(callArgs[1]?.body as string);
      expect(body.chat_id).toBe('123456789');
      expect(body.message_id).toBe(12345);
      expect(body.text).toBe('Hello world');
    });

    it('should return INVALID_TOKEN error when telegram_bot_token is missing', async () => {
      const channelWithoutToken = {
        ...channel,
        credentials: {},
      };

      const result = await publisher.edit('12345', validPost, channelWithoutToken);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_TOKEN');
      expect(result.error?.retryable).toBe(false);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should map API errors correctly on edit failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: false,
          error_code: 400,
          description: 'Bad Request',
        }),
      });

      const result = await publisher.edit('12345', validPost, channel);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('CONTENT_REJECTED');
      expect(result.error?.retryable).toBe(false);
    });
  });

  describe('Integration tests (with real Telegram Bot API)', () => {
    // Get test credentials from environment
    // @ts-ignore - Deno environment
    const testBotToken = typeof Deno !== 'undefined' ? Deno.env.get('TELEGRAM_TEST_BOT_TOKEN') : undefined;
    // @ts-ignore - Deno environment
    const testChannelId = typeof Deno !== 'undefined' ? Deno.env.get('TELEGRAM_TEST_CHANNEL_ID') : undefined;

    const hasTestCredentials = testBotToken && testChannelId;

    describe.skipIf(!hasTestCredentials)('Direct API integration', () => {
      it('should successfully publish and return platformMessageId', async () => {
        const integrationChannel: ChannelConfig = {
          platform: 'telegram',
          channelId: testChannelId!,
          credentials: {
            telegram_bot_token: testBotToken!,
          },
        };

        const integrationPost: ScheduledPost = {
          ...validPost,
          content: {
            text: 'Test message from DirectorAI integration test',
            mediaAssetIds: [],
          },
        };

        // Use real fetch for integration test
        const realFetch = globalThis.fetch;
        globalThis.fetch = realFetch as unknown as typeof fetch;

        const result = await publisher.publish(integrationPost, integrationChannel);

        expect(result.success).toBe(true);
        expect(result.platformMessageId).toBeTruthy();
        expect(result.platformMessageId.length).toBeGreaterThan(0);

        // Cleanup: delete the test message
        if (result.success) {
          await publisher.delete(result.platformMessageId, integrationChannel);
        }
      });

      it('should map invalid token to non-retryable 401 error', async () => {
        const invalidChannel: ChannelConfig = {
          platform: 'telegram',
          channelId: testChannelId!,
          credentials: {
            telegram_bot_token: 'invalid_token_12345',
          },
        };

        const result = await publisher.publish(validPost, invalidChannel);

        expect(result.success).toBe(false);
        expect(result.error?.code).toBe('INVALID_TOKEN');
        expect(result.error?.retryable).toBe(false);
      });
    });

    it('should skip integration tests when credentials not provided', () => {
      if (!hasTestCredentials) {
        expect(testBotToken).toBeUndefined();
        expect(testChannelId).toBeUndefined();
      }
    });
  });
});
