import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import {
    BaseInputProcessor,
    ProcessorConfig,
    ProcessorContext,
    ProcessorResult,
    ProcessorStrategy,
} from '../types';

/**
 * Content categories for moderation
 */
export enum ModerationCategory {
  HATE = 'hate',
  HARASSMENT = 'harassment',
  SEXUAL = 'sexual',
  VIOLENCE = 'violence',
  SELF_HARM = 'selfHarm',
  SPAM = 'spam',
}

/**
 * ModerationInputProcessor
 * 
 * Detects inappropriate content including:
 * - Hate speech and discrimination
 * - Harassment and bullying
 * - Sexual content
 * - Violence and graphic content
 * - Self-harm content
 * - Spam and promotional content
 * 
 * Uses a fast LLM for content classification.
 * Based on Mastra's ModerationInputProcessor with optimized schema.
 */
export class ModerationInputProcessor extends BaseInputProcessor {
  private detectionAgent: Agent;
  private categories: ModerationCategory[];

  constructor(
    config: ProcessorConfig & {
      model: any; // Mastra model instance
      categories?: ModerationCategory[];
    }
  ) {
    super('ModerationInputProcessor', config);

    if (!config.model) {
      throw new Error('ModerationInputProcessor requires a model configuration');
    }

    // Default categories if not specified
    this.categories = config.categories || [
      ModerationCategory.HATE,
      ModerationCategory.HARASSMENT,
      ModerationCategory.SEXUAL,
      ModerationCategory.VIOLENCE,
      ModerationCategory.SELF_HARM,
      ModerationCategory.SPAM,
    ];

    // Create detection agent
    this.detectionAgent = new Agent({
      name: 'content-moderation',
      instructions: `Analyze content for inappropriate material in these categories:
${this.categories.map(cat => `- ${cat}`).join('\n')}

For each detected category, provide a confidence score 0-1.
IMPORTANT: IF NO ISSUES DETECTED, RETURN AN EMPTY OBJECT.`,
      model: config.model,
    });
  }

  async process(content: string, _context?: ProcessorContext): Promise<ProcessorResult> {
    if (!this.isEnabled()) {
      return this.allowContent(content);
    }

    try {
      // Build minimal schema - only include detected categories
      const categoryProps = this.categories.reduce((props, category) => {
        props[category] = z.number().min(0).max(1).optional();
        return props;
      }, {} as Record<string, z.ZodType<number | undefined>>);

      const moderationSchema = z.object({
        categories: z.object(categoryProps).optional(),
        reason: z.string().optional(),
      });

      const result = await this.detectionAgent.generate(
        `Analyze this message: "${content}"`,
        {
          output: moderationSchema as any,
        }
      );

      const moderation = result.object;
      const detectedCategories = moderation?.categories || {};
      const threshold = this.config.threshold || 0.7;

      // Find flagged categories
      const flaggedCategories = Object.entries(detectedCategories)
        .filter(([_, score]) => typeof score === 'number' && score >= threshold)
        .map(([category]) => category);

      if (flaggedCategories.length > 0) {
        const strategy = this.getStrategy();

        if (strategy === ProcessorStrategy.BLOCK) {
          return this.blockContent(
            moderation?.reason || `Inappropriate content detected: ${flaggedCategories.join(', ')}`,
            detectedCategories as Record<string, number>
          );
        } else if (strategy === ProcessorStrategy.WARN) {
          return this.warnContent(
            content,
            `Potentially inappropriate content: ${flaggedCategories.join(', ')}`,
            detectedCategories as Record<string, number>
          );
        } else if (strategy === ProcessorStrategy.REDACT) {
          // For now, we'll replace the entire message
          // A more sophisticated approach would redact specific parts
          return this.redactContent(
            '[Message removed due to inappropriate content]',
            `Content flagged for: ${flaggedCategories.join(', ')}`,
            detectedCategories as Record<string, number>
          );
        }
      }

      return this.allowContent(content);
    } catch (error) {
      // Fail open - if moderation fails, allow the content
      console.warn('[ModerationInputProcessor] Moderation failed, allowing content:', error);
      return this.allowContent(content);
    }
  }
}
