import { ScheduledPost, RecurrenceRule } from '@director-ai/types';

/**
 * RecurrenceService computes next scheduled dates for recurring posts.
 * Handles daily, weekly, monthly recurrence with interval, daysOfWeek, endDate, and maxOccurrences.
 */
export class RecurrenceService {
  /**
   * Compute the next scheduledAt timestamp for a recurring post.
   * Returns null if the rule is exhausted (past endDate or maxOccurrences reached).
   */
  scheduleNext(post: ScheduledPost): Date | null {
    if (!post.recurrenceRule) {
      return null;
    }

    const rule = post.recurrenceRule;
    const currentScheduledAt = post.scheduledAt;
    let nextDate = new Date(currentScheduledAt);

    // Compute next date based on frequency
    switch (rule.frequency) {
      case 'daily':
        nextDate.setDate(nextDate.getDate() + rule.interval);
        break;

      case 'weekly':
        // If daysOfWeek is specified, find the next occurrence
        if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
          nextDate = this.getNextWeeklyDate(nextDate, rule.daysOfWeek, rule.interval);
        } else {
          // Simple weekly interval (same day of week)
          nextDate.setDate(nextDate.getDate() + (7 * rule.interval));
        }
        break;

      case 'monthly':
        nextDate = this.getNextMonthlyDate(nextDate, rule.interval);
        break;
    }

    // Check endDate constraint
    if (rule.endDate && nextDate > rule.endDate) {
      return null;
    }

    // Check maxOccurrences constraint
    // Note: This requires tracking occurrence count, which should be stored in the database
    // For now, we return the date and let the caller handle the maxOccurrences check
    return nextDate;
  }

  /**
   * Compute the next date for weekly recurrence with specific days of week.
   */
  private getNextWeeklyDate(currentDate: Date, daysOfWeek: number[], interval: number): Date {
    const currentDay = currentDate.getDay(); // 0 = Sunday, 6 = Saturday
    const sortedDays = [...daysOfWeek].sort((a, b) => a - b);

    // Find the next occurrence in the current week
    let nextDayInWeek = sortedDays.find(day => day > currentDay);

    if (nextDayInWeek !== undefined) {
      // Next occurrence is later this week
      const daysToAdd = nextDayInWeek - currentDay;
      const nextDate = new Date(currentDate);
      nextDate.setDate(currentDate.getDate() + daysToAdd);
      return nextDate;
    } else {
      // Next occurrence is in the next interval week
      const daysToNextWeek = (7 - currentDay) + sortedDays[0] + (7 * (interval - 1));
      const nextDate = new Date(currentDate);
      nextDate.setDate(currentDate.getDate() + daysToNextWeek);
      return nextDate;
    }
  }

  /**
   * Compute the next date for monthly recurrence, handling month boundaries.
   */
  private getNextMonthlyDate(currentDate: Date, interval: number): Date {
    const nextDate = new Date(currentDate);
    
    // Save the original day
    const originalDay = currentDate.getDate();
    
    // Set day to 1 to prevent auto-overflow when adding months
    nextDate.setDate(1);
    
    // Add interval months
    nextDate.setMonth(nextDate.getMonth() + interval);
    
    // Compute days in the target month
    const daysInNextMonth = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, 0).getDate();
    
    // Set the day to the minimum of original day and days in next month
    nextDate.setDate(Math.min(originalDay, daysInNextMonth));
    
    return nextDate;
  }

  /**
   * Check if a recurrence rule is exhausted based on occurrence count.
   * This should be called with the current occurrence count from the database.
   */
  isRuleExhausted(rule: RecurrenceRule, currentOccurrenceCount: number): boolean {
    if (rule.maxOccurrences !== undefined && currentOccurrenceCount >= rule.maxOccurrences) {
      return true;
    }
    return false;
  }
}
