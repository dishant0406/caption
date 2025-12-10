import { env } from '@/config/env';
import { secondaryModel } from '@/config/llm';
import { logger } from '@/plugins/logger';
import { mastra } from '../config/mastra';
import {
  InputProcessor,
  ModerationInputProcessor,
  ProcessorContext,
  ProcessorStrategy,
  PromptInjectionDetector,
  SpamDetector,
  UnicodeNormalizer,
} from '../inputProcessors';
import { VideoProcessingState } from '../types';

/**
 * Agent Service
 * 
 * This service integrates the Mastra agent with the caption system.
 * It uses Mastra's thread-based memory system for conversation management.
 * The sessionId is used as the threadId to maintain conversation context.
 * 
 * Implements input guardrails to secure the agent against:
 * - Prompt injection attacks
 * - Inappropriate content
 * - Spam and abuse
 */
export class AgentService {
  private inputProcessors: InputProcessor[];

  constructor() {
    // Initialize input processors based on environment configuration
    this.inputProcessors = [];

    if (!env.GUARDRAILS_ENABLED) {
      logger.warn('⚠️ Input guardrails are DISABLED');
      return;
    }

    // 1. Normalize text first (fast, no LLM calls)
    if (env.GUARDRAILS_UNICODE_NORMALIZER_ENABLED) {
      this.inputProcessors.push(
        new UnicodeNormalizer({
          stripControlChars: true,
          enabled: true,
        })
      );
    }
    
    // 2. Detect spam/rate limiting (fast, uses cache)
    if (env.GUARDRAILS_SPAM_DETECTOR_ENABLED) {
      this.inputProcessors.push(
        new SpamDetector({
          strategy: ProcessorStrategy.WARN, // Warn but allow for now
          maxMessagesPerMinute: env.GUARDRAILS_SPAM_MAX_PER_MINUTE,
          maxMessagesPerHour: env.GUARDRAILS_SPAM_MAX_PER_HOUR,
          enabled: true,
        })
      );
    }
    
    // 3. Check for prompt injection (uses LLM)
    if (env.GUARDRAILS_PROMPT_INJECTION_ENABLED) {
      this.inputProcessors.push(
        new PromptInjectionDetector({
          model: secondaryModel, // Use fast/cheap model
          strategy: ProcessorStrategy.BLOCK,
          threshold: env.GUARDRAILS_PROMPT_INJECTION_THRESHOLD,
          enabled: true,
        })
      );
    }
    
    // 4. Moderate content (uses LLM)
    if (env.GUARDRAILS_MODERATION_ENABLED) {
      this.inputProcessors.push(
        new ModerationInputProcessor({
          model: secondaryModel, // Use fast/cheap model
          strategy: ProcessorStrategy.BLOCK, // Warn but allow for WhatsApp use case
          threshold: env.GUARDRAILS_MODERATION_THRESHOLD,
          enabled: true,
        })
      );
    }

    logger.info('🛡️ Input processors initialized', {
      enabled: env.GUARDRAILS_ENABLED,
      processors: this.inputProcessors.map(p => p.name),
    });
  }

  /**
   * Run all input processors on the message
   * Returns the processed message or throws if blocked
   */
  private async runInputProcessors(
    content: string,
    context: ProcessorContext
  ): Promise<string> {
    // Skip if no processors enabled
    if (this.inputProcessors.length === 0) {
      return content;
    }

    let processedContent = content;
    const warnings: string[] = [];

    for (const processor of this.inputProcessors) {
      const result = await processor.process(processedContent, context);

      // Log processor result
      logger.debug(`Processor: ${processor.name}`, {
        allowed: result.allowed,
        hasWarning: !!result.warning,
        hasChanges: result.content !== processedContent,
      });

      if (!result.allowed) {
        // Message blocked
        logger.warn(`❌ Message blocked by ${processor.name}`, {
          reason: result.reason,
          categories: result.categories,
          userPhone: context.userPhone,
        });
        
        throw new Error(
          result.reason || `Your message was blocked by our content filters. Please try rephrasing.`
        );
      }

      if (result.warning) {
        warnings.push(`[${processor.name}] ${result.warning}`);
      }

      // Use the processed content for next processor
      processedContent = result.content;
    }

    // Log all warnings
    if (warnings.length > 0) {
      logger.warn('⚠️ Input processor warnings', {
        warnings,
        userPhone: context.userPhone,
      });
    }

    return processedContent;
  }
  /**
   * Process a user message through the caption agent
   * 
   * @param sessionId - The caption session ID (used as threadId)
   * @param messageContent - The user's message text
   * @param userPhone - The user's phone number
   * @param state - Current processing state
   * @returns The agent's response
   */
  async processMessage(
    sessionId: string,
    messageContent: string,
    userPhone: string,
    state: VideoProcessingState = VideoProcessingState.IDLE
  ): Promise<{
    response: string;
    toolsUsed: string[];
  }> {
    // Get the caption agent
    const agent = mastra.getAgent('captionAgent');

    // Get current date and time in IST
    const now = new Date();
    const istTime = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'full',
      timeStyle: 'long',
    }).format(now);

    // Run input processors BEFORE sending to agent
    const processorContext: ProcessorContext = {
      userPhone,
      sessionId,
      state,
    };

    let processedMessage = messageContent;
    const guardrailStartTime = Date.now();

    try {
      processedMessage = await this.runInputProcessors(messageContent, processorContext);
      
      const guardrailDuration = Date.now() - guardrailStartTime;
      logger.info('🛡️ Input guardrails passed', {
        duration: `${guardrailDuration}ms`,
        sessionId,
      });
    } catch (error) {
      // Message was blocked by guardrails
      const guardrailDuration = Date.now() - guardrailStartTime;
      logger.warn('🚫 Message blocked by guardrails', {
        duration: `${guardrailDuration}ms`,
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Return a user-friendly error message
      return {
        response: error instanceof Error 
          ? error.message 
          : 'Your message could not be processed. Please try again with different content.',
        toolsUsed: [],
      };
    }

    // Enhance the user message with context information
    const contextualMessage = `[User Context: phone=${userPhone}, sessionId=${sessionId}, state=${state}]
[Current Date & Time (IST): ${istTime}]

User message: ${processedMessage}`;

    // Performance tracking
    const startTime = Date.now();
    logger.info('🚀 Agent request started', {
      sessionId,
      messageLength: messageContent.length,
      processedLength: processedMessage.length,
      state,
    });

    try {
      const agentResponse = await agent.generate(contextualMessage, {
        memory: {
          thread: sessionId,
          resource: userPhone,
        },
      });

      // Performance logging
      const duration = Date.now() - startTime;

      logger.info('✅ Agent request completed', {
        sessionId,
        duration: `${duration}ms`,
        toolCallsCount: agentResponse.toolCalls?.length || 0,
        responseLength: agentResponse.text?.length || 0,
      });

      // Extract tool usage information
      const toolsUsed = this.extractToolsUsed(agentResponse);

      if (agentResponse.toolCalls && agentResponse.toolCalls.length > 0) {
        logger.debug('Agent used tools', {
          toolCallsCount: agentResponse.toolCalls.length,
          toolNames: toolsUsed,
          sessionId,
        });
      }

      return {
        response: agentResponse.text || 'I apologize, I could not process your request.',
        toolsUsed,
      };
    } catch (error) {
      logger.error('Agent processing failed', error instanceof Error ? error : new Error(String(error)), {
        sessionId,
        userPhone,
        state,
      });

      throw error;
    }
  }

  /**
   * Extract information about which tools were used by the agent
   */
  private extractToolsUsed(agentResponse: unknown): string[] {
    const toolsUsed: string[] = [];

    if (agentResponse && typeof agentResponse === 'object' && 'toolResults' in agentResponse) {
      const results = (agentResponse as { toolResults?: { toolName?: string }[] }).toolResults;
      if (Array.isArray(results)) {
        results.forEach((result) => {
          if (result.toolName) {
            toolsUsed.push(result.toolName);
          }
        });
      }
    }

    return toolsUsed;
  }

  /**
   * Process message and handle video content
   * Called when user sends a video
   */
  async processVideoMessage(
    sessionId: string,
    videoUrl: string,
    userPhone: string
  ): Promise<{
    response: string;
    toolsUsed: string[];
  }> {
    // Create a message indicating video was sent
    const messageContent = `[VIDEO RECEIVED] Video URL: ${videoUrl}
    
Please process this video for captioning.`;

    return this.processMessage(
      sessionId,
      messageContent,
      userPhone,
      VideoProcessingState.UPLOADING
    );
  }

  /**
   * Ensure thread exists in Mastra memory
   */
  async ensureThread(sessionId: string, userPhone: string): Promise<void> {
    const agent = mastra.getAgent('captionAgent');
    const memory = await agent.getMemory();

    const existingThread = await memory?.getThreadById({ threadId: sessionId });
    if (!existingThread) {
      await memory?.createThread({
        threadId: sessionId,
        resourceId: userPhone,
        title: `Caption Session: ${sessionId}`,
        metadata: {
          userPhone,
          createdAt: new Date().toISOString(),
          type: 'caption_session',
        },
      });

      logger.info('Created new memory thread', { sessionId, userPhone });
    }
  }
}

export const agentService = new AgentService();
