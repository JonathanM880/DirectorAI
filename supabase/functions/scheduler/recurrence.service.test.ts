import { describe, it, expect, beforeEach } from 'vitest';
import { RecurrenceService } from './recurrence.service';
import { ScheduledPost, RecurrenceRule } from '@director-ai/types';

describe('RecurrenceService', () => {
  let recurrenceService: RecurrenceService;

  beforeEach(() => {
    recurrenceService = new RecurrenceService();
  });

  describe('scheduleNext - daily recurrence', () => {
    it('should compute next date for daily recurrence with interval 1', () => {
      const post: ScheduledPost = {
        id: 'post-1',
        userId: 'user-1',
        platform: 'telegram',
        channelId: 'channel-1',
        content: { text: 'Test post' },
        scheduledAt: new Date('2024-01-15T10:00:00Z'),
        status: 'scheduled',
        retryCount: 0,
        maxRetries: 3,
        recurrenceRule: {
          frequency: 'daily',
          interval: 1,
        },
        createdAt: new Date('2024-01-14T10:00:00Z'),
        updatedAt: new Date('2024-01-14T10:00:00Z'),
      };

      const nextDate = recurrenceService.scheduleNext(post);

      expect(nextDate).not.toBeNull();
      expect(nextDate).toEqual(new Date('2024-01-16T10:00:00Z'));
    });

    it('should compute next date for daily recurrence with interval 3', () => {
      const post: ScheduledPost = {
        id: 'post-1',
        userId: 'user-1',
        platform: 'telegram',
        channelId: 'channel-1',
        content: { text: 'Test post' },
        scheduledAt: new Date('2024-01-15T10:00:00Z'),
        status: 'scheduled',
        retryCount: 0,
        maxRetries: 3,
        recurrenceRule: {
          frequency: 'daily',
          interval: 3,
        },
        createdAt: new Date('2024-01-14T10:00:00Z'),
        updatedAt: new Date('2024-01-14T10:00:00Z'),
      };

      const nextDate = recurrenceService.scheduleNext(post);

      expect(nextDate).not.toBeNull();
      expect(nextDate).toEqual(new Date('2024-01-18T10:00:00Z'));
    });
  });

  describe('scheduleNext - weekly recurrence', () => {
    it('should compute next date for weekly recurrence without daysOfWeek', () => {
      const post: ScheduledPost = {
        id: 'post-1',
        userId: 'user-1',
        platform: 'telegram',
        channelId: 'channel-1',
        content: { text: 'Test post' },
        scheduledAt: new Date('2024-01-15T10:00:00Z'), // Monday
        status: 'scheduled',
        retryCount: 0,
        maxRetries: 3,
        recurrenceRule: {
          frequency: 'weekly',
          interval: 1,
        },
        createdAt: new Date('2024-01-14T10:00:00Z'),
        updatedAt: new Date('2024-01-14T10:00:00Z'),
      };

      const nextDate = recurrenceService.scheduleNext(post);

      expect(nextDate).not.toBeNull();
      expect(nextDate).toEqual(new Date('2024-01-22T10:00:00Z')); // Next Monday
    });

    it('should compute next date for weekly recurrence with daysOfWeek (same week)', () => {
      const post: ScheduledPost = {
        id: 'post-1',
        userId: 'user-1',
        platform: 'telegram',
        channelId: 'channel-1',
        content: { text: 'Test post' },
        scheduledAt: new Date('2024-01-15T10:00:00Z'), // Monday (day 1)
        status: 'scheduled',
        retryCount: 0,
        maxRetries: 3,
        recurrenceRule: {
          frequency: 'weekly',
          interval: 1,
          daysOfWeek: [1, 3, 5], // Mon, Wed, Fri
        },
        createdAt: new Date('2024-01-14T10:00:00Z'),
        updatedAt: new Date('2024-01-14T10:00:00Z'),
      };

      const nextDate = recurrenceService.scheduleNext(post);

      expect(nextDate).not.toBeNull();
      expect(nextDate).toEqual(new Date('2024-01-17T10:00:00Z')); // Wednesday
    });

    it('should compute next date for weekly recurrence with daysOfWeek (next week)', () => {
      const post: ScheduledPost = {
        id: 'post-1',
        userId: 'user-1',
        platform: 'telegram',
        channelId: 'channel-1',
        content: { text: 'Test post' },
        scheduledAt: new Date('2024-01-17T10:00:00Z'), // Wednesday (day 3)
        status: 'scheduled',
        retryCount: 0,
        maxRetries: 3,
        recurrenceRule: {
          frequency: 'weekly',
          interval: 1,
          daysOfWeek: [1, 3, 5], // Mon, Wed, Fri
        },
        createdAt: new Date('2024-01-14T10:00:00Z'),
        updatedAt: new Date('2024-01-14T10:00:00Z'),
      };

      const nextDate = recurrenceService.scheduleNext(post);

      expect(nextDate).not.toBeNull();
      expect(nextDate).toEqual(new Date('2024-01-19T10:00:00Z')); // Friday
    });

    it('should compute next date for weekly recurrence with daysOfWeek (wrap to next interval)', () => {
      const post: ScheduledPost = {
        id: 'post-1',
        userId: 'user-1',
        platform: 'telegram',
        channelId: 'channel-1',
        content: { text: 'Test post' },
        scheduledAt: new Date('2024-01-19T10:00:00Z'), // Friday (day 5)
        status: 'scheduled',
        retryCount: 0,
        maxRetries: 3,
        recurrenceRule: {
          frequency: 'weekly',
          interval: 1,
          daysOfWeek: [1, 3, 5], // Mon, Wed, Fri
        },
        createdAt: new Date('2024-01-14T10:00:00Z'),
        updatedAt: new Date('2024-01-14T10:00:00Z'),
      };

      const nextDate = recurrenceService.scheduleNext(post);

      expect(nextDate).not.toBeNull();
      expect(nextDate).toEqual(new Date('2024-01-22T10:00:00Z')); // Next Monday
    });
  });

  describe('scheduleNext - monthly recurrence', () => {
    it('should compute next date for monthly recurrence with interval 1', () => {
      const post: ScheduledPost = {
        id: 'post-1',
        userId: 'user-1',
        platform: 'telegram',
        channelId: 'channel-1',
        content: { text: 'Test post' },
        scheduledAt: new Date('2024-01-15T10:00:00Z'),
        status: 'scheduled',
        retryCount: 0,
        maxRetries: 3,
        recurrenceRule: {
          frequency: 'monthly',
          interval: 1,
        },
        createdAt: new Date('2024-01-14T10:00:00Z'),
        updatedAt: new Date('2024-01-14T10:00:00Z'),
      };

      const nextDate = recurrenceService.scheduleNext(post);

      expect(nextDate).not.toBeNull();
      expect(nextDate).toEqual(new Date('2024-02-15T10:00:00Z'));
    });

    it('should handle month boundary: Jan 31 -> Feb 29 (leap year)', () => {
      const post: ScheduledPost = {
        id: 'post-1',
        userId: 'user-1',
        platform: 'telegram',
        channelId: 'channel-1',
        content: { text: 'Test post' },
        scheduledAt: new Date('2024-01-31T10:00:00Z'),
        status: 'scheduled',
        retryCount: 0,
        maxRetries: 3,
        recurrenceRule: {
          frequency: 'monthly',
          interval: 1,
        },
        createdAt: new Date('2024-01-30T10:00:00Z'),
        updatedAt: new Date('2024-01-30T10:00:00Z'),
      };

      const nextDate = recurrenceService.scheduleNext(post);

      expect(nextDate).not.toBeNull();
      expect(nextDate).toEqual(new Date('2024-02-29T10:00:00Z')); // Last day of Feb
    });

    it('should handle month boundary: Jan 31 -> Feb 28 (non-leap year)', () => {
      const post: ScheduledPost = {
        id: 'post-1',
        userId: 'user-1',
        platform: 'telegram',
        channelId: 'channel-1',
        content: { text: 'Test post' },
        scheduledAt: new Date('2023-01-31T10:00:00Z'),
        status: 'scheduled',
        retryCount: 0,
        maxRetries: 3,
        recurrenceRule: {
          frequency: 'monthly',
          interval: 1,
        },
        createdAt: new Date('2023-01-30T10:00:00Z'),
        updatedAt: new Date('2023-01-30T10:00:00Z'),
      };

      const nextDate = recurrenceService.scheduleNext(post);

      expect(nextDate).not.toBeNull();
      expect(nextDate).toEqual(new Date('2023-02-28T10:00:00Z')); // Last day of Feb
    });

    it('should handle month boundary: Mar 31 -> Apr 30', () => {
      const post: ScheduledPost = {
        id: 'post-1',
        userId: 'user-1',
        platform: 'telegram',
        channelId: 'channel-1',
        content: { text: 'Test post' },
        scheduledAt: new Date('2024-03-31T10:00:00Z'),
        status: 'scheduled',
        retryCount: 0,
        maxRetries: 3,
        recurrenceRule: {
          frequency: 'monthly',
          interval: 1,
        },
        createdAt: new Date('2024-03-30T10:00:00Z'),
        updatedAt: new Date('2024-03-30T10:00:00Z'),
      };

      const nextDate = recurrenceService.scheduleNext(post);

      expect(nextDate).not.toBeNull();
      expect(nextDate).toEqual(new Date('2024-04-30T10:00:00Z')); // Last day of Apr
    });
  });

  describe('scheduleNext - endDate constraint', () => {
    it('should return null when next date exceeds endDate', () => {
      const post: ScheduledPost = {
        id: 'post-1',
        userId: 'user-1',
        platform: 'telegram',
        channelId: 'channel-1',
        content: { text: 'Test post' },
        scheduledAt: new Date('2024-01-15T10:00:00Z'),
        status: 'scheduled',
        retryCount: 0,
        maxRetries: 3,
        recurrenceRule: {
          frequency: 'daily',
          interval: 1,
          endDate: new Date('2024-01-16T09:00:00Z'), // Before next occurrence
        },
        createdAt: new Date('2024-01-14T10:00:00Z'),
        updatedAt: new Date('2024-01-14T10:00:00Z'),
      };

      const nextDate = recurrenceService.scheduleNext(post);

      expect(nextDate).toBeNull();
    });

    it('should return next date when within endDate', () => {
      const post: ScheduledPost = {
        id: 'post-1',
        userId: 'user-1',
        platform: 'telegram',
        channelId: 'channel-1',
        content: { text: 'Test post' },
        scheduledAt: new Date('2024-01-15T10:00:00Z'),
        status: 'scheduled',
        retryCount: 0,
        maxRetries: 3,
        recurrenceRule: {
          frequency: 'daily',
          interval: 1,
          endDate: new Date('2024-01-20T10:00:00Z'), // After next occurrence
        },
        createdAt: new Date('2024-01-14T10:00:00Z'),
        updatedAt: new Date('2024-01-14T10:00:00Z'),
      };

      const nextDate = recurrenceService.scheduleNext(post);

      expect(nextDate).not.toBeNull();
      expect(nextDate).toEqual(new Date('2024-01-16T10:00:00Z'));
    });
  });

  describe('scheduleNext - no recurrence rule', () => {
    it('should return null when post has no recurrence rule', () => {
      const post: ScheduledPost = {
        id: 'post-1',
        userId: 'user-1',
        platform: 'telegram',
        channelId: 'channel-1',
        content: { text: 'Test post' },
        scheduledAt: new Date('2024-01-15T10:00:00Z'),
        status: 'scheduled',
        retryCount: 0,
        maxRetries: 3,
        createdAt: new Date('2024-01-14T10:00:00Z'),
        updatedAt: new Date('2024-01-14T10:00:00Z'),
      };

      const nextDate = recurrenceService.scheduleNext(post);

      expect(nextDate).toBeNull();
    });
  });

  describe('isRuleExhausted - maxOccurrences constraint', () => {
    it('should return true when maxOccurrences reached', () => {
      const rule: RecurrenceRule = {
        frequency: 'daily',
        interval: 1,
        maxOccurrences: 5,
      };

      const isExhausted = recurrenceService.isRuleExhausted(rule, 5);

      expect(isExhausted).toBe(true);
    });

    it('should return true when maxOccurrences exceeded', () => {
      const rule: RecurrenceRule = {
        frequency: 'daily',
        interval: 1,
        maxOccurrences: 5,
      };

      const isExhausted = recurrenceService.isRuleExhausted(rule, 6);

      expect(isExhausted).toBe(true);
    });

    it('should return false when maxOccurrences not reached', () => {
      const rule: RecurrenceRule = {
        frequency: 'daily',
        interval: 1,
        maxOccurrences: 5,
      };

      const isExhausted = recurrenceService.isRuleExhausted(rule, 3);

      expect(isExhausted).toBe(false);
    });

    it('should return false when maxOccurrences not set', () => {
      const rule: RecurrenceRule = {
        frequency: 'daily',
        interval: 1,
      };

      const isExhausted = recurrenceService.isRuleExhausted(rule, 100);

      expect(isExhausted).toBe(false);
    });
  });
});
