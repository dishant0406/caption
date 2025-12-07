import { logger } from '@/plugins/logger';
import { mastra } from '../config/mastra';
import { VideoProcessingState } from '../types';

/**
 * Agent Service
 * 
 * This service integrates the Mastra agent with the caption system.
 * It uses Mastra's thread-based memory system for conversation management.
 * The sessionId is used as the threadId to maintain conversation context.
 */
export class AgentService {
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

    // Enhance the user message with context information
    const contextualMessage = `[User Context: phone=${userPhone}, sessionId=${sessionId}, state=${state}]
[Current Date & Time (IST): ${istTime}]

User message: ${messageContent}`;

    // Performance tracking
    const startTime = Date.now();
    logger.info('🚀 Agent request started', {
      sessionId,
      messageLength: messageContent.length,
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
