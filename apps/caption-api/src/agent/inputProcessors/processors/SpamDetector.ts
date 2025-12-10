import { cache } from '@/plugins/cache';
import {
    BaseInputProcessor,
    ProcessorConfig,
    ProcessorContext,
    ProcessorResult,
    ProcessorStrategy,
} from '../types';

/**
 * SpamDetector Processor
 * 
 * Detects and prevents spam through:
 * - Rate limiting (messages per time window)
 * - Duplicate message detection
 * - Excessive repetition detection
 * 
 * Uses Redis cache for tracking user activity.
 */
export class SpamDetector extends BaseInputProcessor {
  private readonly maxMessagesPerMinute: number;
  private readonly maxMessagesPerHour: number;
  private readonly duplicateWindowSeconds: number;
  private readonly minMessageLength: number;

  constructor(
    config: ProcessorConfig & {
      maxMessagesPerMinute?: number;
      maxMessagesPerHour?: number;
      duplicateWindowSeconds?: number;
      minMessageLength?: number;
    } = {}
  ) {
    super('SpamDetector', config);

    this.maxMessagesPerMinute = config.maxMessagesPerMinute || 10;
    this.maxMessagesPerHour = config.maxMessagesPerHour || 100;
    this.duplicateWindowSeconds = config.duplicateWindowSeconds || 60;
    this.minMessageLength = config.minMessageLength || 1;
  }

  async process(content: string, context?: ProcessorContext): Promise<ProcessorResult> {
    if (!this.isEnabled() || !context?.userPhone) {
      return this.allowContent(content);
    }

    const userPhone = context.userPhone;

    try {
      // Check 1: Message too short (likely spam/abuse)
      if (content.trim().length < this.minMessageLength) {
        return this.blockContent('Message too short');
      }

      // Check 2: Rate limiting - messages per minute
      const minuteKey = `spam:minute:${userPhone}:${this.getCurrentMinute()}`;
      const messagesThisMinute = await cache.get<number>(minuteKey) || 0;

      if (messagesThisMinute >= this.maxMessagesPerMinute) {
        const strategy = this.getStrategy();
        if (strategy === ProcessorStrategy.BLOCK) {
          return this.blockContent(
            `Rate limit exceeded: ${this.maxMessagesPerMinute} messages per minute`,
            { rateLimit: 1 }
          );
        } else if (strategy === ProcessorStrategy.WARN) {
          return this.warnContent(
            content,
            'User is sending messages rapidly',
            { rateLimit: messagesThisMinute / this.maxMessagesPerMinute }
          );
        }
      }

      // Increment minute counter
      await cache.set(minuteKey, messagesThisMinute + 1, { ttl: 60 });

      // Check 3: Rate limiting - messages per hour
      const hourKey = `spam:hour:${userPhone}:${this.getCurrentHour()}`;
      const messagesThisHour = await cache.get<number>(hourKey) || 0;

      if (messagesThisHour >= this.maxMessagesPerHour) {
        const strategy = this.getStrategy();
        if (strategy === ProcessorStrategy.BLOCK) {
          return this.blockContent(
            `Rate limit exceeded: ${this.maxMessagesPerHour} messages per hour`,
            { rateLimit: 1 }
          );
        }
      }

      // Increment hour counter
      await cache.set(hourKey, messagesThisHour + 1, { ttl: 3600 });

      // Check 4: Duplicate message detection
      const messageHash = this.hashMessage(content);
      const duplicateKey = `spam:duplicate:${userPhone}:${messageHash}`;
      const isDuplicate = await cache.get(duplicateKey);

      if (isDuplicate) {
        const strategy = this.getStrategy();
        if (strategy === ProcessorStrategy.BLOCK) {
          return this.blockContent(
            'Duplicate message detected',
            { duplicate: 1 }
          );
        } else if (strategy === ProcessorStrategy.WARN) {
          return this.warnContent(
            content,
            'User sent duplicate message',
            { duplicate: 1 }
          );
        }
      }

      // Store message hash to detect duplicates
      await cache.set(duplicateKey, true, { ttl: this.duplicateWindowSeconds });

      return this.allowContent(content);
    } catch (error) {
      // Fail open - if spam detection fails, allow the content
      console.warn('[SpamDetector] Spam detection failed, allowing content:', error);
      return this.allowContent(content);
    }
  }

  /**
   * Get current minute timestamp (for rate limiting)
   */
  private getCurrentMinute(): string {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
  }

  /**
   * Get current hour timestamp (for rate limiting)
   */
  private getCurrentHour(): string {
    const now = new Date();
    return `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
  }

  /**
   * Hash a message for duplicate detection
   */
  private hashMessage(content: string): string {
    // Simple hash - normalize and create a deterministic key
    const normalized = content.toLowerCase().trim().replace(/\s+/g, ' ');
    
    // Use a simple hash function
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    
    return hash.toString(36);
  }
}
