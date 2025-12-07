import { agentService } from '@/agent/services/agent.service';
import { VideoProcessingState } from '@/agent/types';
import { CaptionSession, User } from '@/models';
import { logger } from '@/plugins/logger';
import { whatsappService } from '@/services/whatsapp/WhatsAppService';
import { v4 as uuidv4 } from 'uuid';
import type { IWebhookHandler } from '../handler';
import type { HandlerContext, MessageData, WebhookPayload } from '../types';
import { extractMessageData, isMessageEvent } from '../types';

/**
 * Handler for incoming message webhook events
 * Processes messages from both Evolution API and WaSender API
 * 
 * Supported events:
 * - messages.upsert (Evolution)
 * - messages-personal.received (WaSender - personal/private messages only)
 */
export class MessagesUpsertHandler implements IWebhookHandler<WebhookPayload> {
  readonly eventType = 'messages-personal.received' as const;
  
  // Deduplication cache - stores processed message IDs with timestamps
  // Prevents processing the same message twice when multiple events fire for same message
  private processedMessages = new Map<string, number>();
  private readonly DEDUP_TTL_MS = 60000; // 1 minute TTL for deduplication

  /**
   * Get all event types this handler supports
   */
  getSupportedEvents(): string[] {
    return ['messages.upsert', 'messages-personal.received'];
  }

  /**
   * Check if message was already processed (deduplication)
   */
  private isAlreadyProcessed(messageId: string): boolean {
    const now = Date.now();
    
    // Clean up expired entries periodically
    if (this.processedMessages.size > 100) {
      for (const [id, timestamp] of this.processedMessages.entries()) {
        if (now - timestamp > this.DEDUP_TTL_MS) {
          this.processedMessages.delete(id);
        }
      }
    }
    
    // Check if message was already processed
    if (this.processedMessages.has(messageId)) {
      logger.debug('Skipping duplicate message', { messageId });
      return true;
    }
    
    // Mark as processed
    this.processedMessages.set(messageId, now);
    return false;
  }

  /**
   * Validate the incoming payload
   */
  validate(payload: WebhookPayload): boolean {
    // Check if it's a message event
    if (!isMessageEvent(payload)) {
      logger.debug('Not a message event', { event: payload.event });
      return false;
    }

    // Extract message data using helper
    const message = extractMessageData(payload);

    // Skip if no message data
    if (!message || !message.key) {
      logger.warn('Invalid message payload - missing message data', {
        event: payload.event,
        hasData: !!payload.data,
      });
      return false;
    }

    // Skip messages from self
    if (message.key.fromMe) {
      logger.debug('Skipping self message');
      return false;
    }

    // Deduplication check - skip if this message was already processed
    // This prevents processing the same message when multiple events fire
    if (this.isAlreadyProcessed(message.key.id)) {
      return false;
    }

    // Skip if no remote JID
    if (!message.key.remoteJid) {
      logger.warn('Invalid message - missing remoteJid');
      return false;
    }

    // Skip group messages (for now)
    if (message.key.remoteJid.endsWith('@g.us')) {
      logger.debug('Skipping group message');
      return false;
    }

    // Skip messages from bot's own phone number (to prevent self-loops)
    const botPhoneNumber = process.env.BOT_PHONE_NUMBER;
    if (botPhoneNumber) {
      const senderPhone = whatsappService.extractPhoneFromJid(message.key.remoteJid);
      // Compare normalized phone numbers (without + prefix)
      const normalizedBotPhone = botPhoneNumber.replace(/^\+/, '');
      const normalizedSenderPhone = senderPhone.replace(/^\+/, '');
      
      if (normalizedSenderPhone === normalizedBotPhone) {
        logger.debug('Skipping message from bot\'s own number', {
          senderPhone: normalizedSenderPhone,
          botPhone: normalizedBotPhone,
        });
        return false;
      }
    }

    return true;
  }

  /**
   * Handle the incoming message event
   */
  async handle(payload: WebhookPayload, context: HandlerContext): Promise<void> {
    // Extract message data using helper
    const message = extractMessageData(payload);
    
    if (!message) {
      logger.error('Failed to extract message data in handler', new Error('No message data'));
      return;
    }

    const phoneNumber = whatsappService.extractPhoneFromJid(message.key.remoteJid);

    logger.info('📩 Processing incoming message', {
      phoneNumber,
      event: payload.event,
      messageId: message.key.id,
      pushName: message.pushName,
      provider: payload.sessionId ? 'wasender' : 'evolution',
    });

    try {
      // 1. Find or create user
      const user = await this.findOrCreateUser(phoneNumber, message.pushName);

      // 2. Get or create active session
      const session = await this.getOrCreateSession(user.phoneNumber, phoneNumber);

      // 3. Ensure memory thread exists
      await agentService.ensureThread(session.sessionId, phoneNumber);

      // 4. Extract message content
      const { text, videoUrl, isVideo, rawVideoMessage } = this.extractMessageContent(message);

      // 5. Process through agent
      let response: { response: string; toolsUsed: string[] };

      if (isVideo && (videoUrl || rawVideoMessage)) {
        logger.info('🎬 Processing video message', {
          phoneNumber,
          sessionId: session.sessionId,
          hasRawVideoMessage: !!rawVideoMessage,
        });

        // For WaSender (and potentially Evolution with encryption), we need to decrypt the media first
        let decryptedVideoUrl = videoUrl;
        
        if (rawVideoMessage) {
          try {
            // Get decrypted/public URL for the video
            // Use 'unknown' type since the provider uses rawMessage for decryption
            decryptedVideoUrl = await whatsappService.getMediaUrl({
              key: message.key,
              pushName: message.pushName,
              timestamp: message.messageTimestamp,
              content: { type: 'unknown', data: rawVideoMessage },
              rawMessage: message,
            });
            
            logger.info('🔓 Video decrypted successfully', {
              phoneNumber,
              sessionId: session.sessionId,
              decryptedUrl: decryptedVideoUrl?.substring(0, 50) + '...',
            });
          } catch (decryptError) {
            logger.error('Failed to decrypt video', 
              decryptError instanceof Error ? decryptError : new Error(String(decryptError)),
              { phoneNumber, sessionId: session.sessionId }
            );
            
            // Send error message and return
            await this.sendResponse(phoneNumber, '❌ Sorry, I could not process your video. Please try sending it again.');
            return;
          }
        }

        if (!decryptedVideoUrl) {
          await this.sendResponse(phoneNumber, '❌ Sorry, I could not access your video. Please try sending it again.');
          return;
        }

        response = await agentService.processVideoMessage(session.sessionId, decryptedVideoUrl, phoneNumber);
      } else if (text) {
        // Map session status to VideoProcessingState
        const stateMap: Record<string, VideoProcessingState> = {
          'PENDING': VideoProcessingState.IDLE,
          'CHUNKING': VideoProcessingState.PROCESSING,
          'TRANSCRIBING': VideoProcessingState.TRANSCRIBING,
          'STYLE_SELECTION': VideoProcessingState.STYLE_SELECTION,
          'PREVIEW_READY': VideoProcessingState.CHUNK_REVIEW,
          'REVIEWING': VideoProcessingState.CHUNK_REVIEW,
          'RENDERING': VideoProcessingState.RENDERING,
          'COMPLETED': VideoProcessingState.COMPLETED,
          'FAILED': VideoProcessingState.FAILED,
          'CANCELLED': VideoProcessingState.FAILED,
        };
        const currentState = stateMap[session.status] ?? VideoProcessingState.IDLE;
        
        response = await agentService.processMessage(
          session.sessionId,
          text,
          phoneNumber,
          currentState
        );
      } else {
        logger.warn('Message has no processable content', { 
          event: payload.event,
          hasMessage: !!message.message,
        });
        response = {
          response: 'I can only process text messages and videos. Please send me a video to caption or type a message.',
          toolsUsed: [],
        };
      }

      // 6. Send response back to user
      await this.sendResponse(phoneNumber, response.response);

      logger.info('✅ Message processed successfully', {
        phoneNumber,
        sessionId: session.sessionId,
        toolsUsed: response.toolsUsed,
        responseLength: response.response.length,
      });
    } catch (error) {
      logger.error(
        '❌ Failed to process message',
        error instanceof Error ? error : new Error(String(error)),
        { phoneNumber, messageId: message.key.id }
      );

      // Send error message to user
      await this.sendErrorResponse(phoneNumber);
    }
  }

  /**
   * Error handler for the webhook
   */
  onError(error: Error, payload: WebhookPayload): void {
    const message = extractMessageData(payload);
    const phoneNumber = message?.key?.remoteJid
      ? whatsappService.extractPhoneFromJid(message.key.remoteJid)
      : 'unknown';

    logger.error('MessagesUpsertHandler error', error, {
      phoneNumber,
      messageId: message?.key?.id,
      event: payload.event,
    });
  }

  /**
   * Find or create a user by phone number
   */
  private async findOrCreateUser(phoneNumber: string, pushName?: string) {
    let user = await User.findOne({ where: { phoneNumber } });

    if (!user) {
      user = await User.create({
        phoneNumber,
        whatsappId: phoneNumber,
        name: pushName || 'Unknown',
        subscriptionStatus: 'FREE',
        freeVideosUsed: 0,
      });

      logger.info('👤 Created new user', { phoneNumber });
    } else if (pushName && user.name !== pushName) {
      // Update name if changed
      await user.update({ name: pushName });
    }

    return user;
  }

  /**
   * Get active session or create a new one
   */
  private async getOrCreateSession(userPhone: string, phoneNumber: string) {
    // Look for an active session (not completed or failed)
    let session = await CaptionSession.findOne({
      where: {
        userPhone,
        status: ['PENDING', 'CHUNKING', 'TRANSCRIBING', 'STYLE_SELECTION', 'PREVIEW_READY', 'REVIEWING', 'RENDERING'],
      },
      order: [['createdAt', 'DESC']],
    });

    if (!session) {
      const sessionId = uuidv4();
      session = await CaptionSession.create({
        sessionId,
        userPhone,
        status: 'PENDING',
        originalVideoUrl: '', // Will be set when video is uploaded
      });

      logger.info('📝 Created new caption session', {
        sessionId,
        userPhone,
        phoneNumber,
      });
    }

    return session;
  }

  /**
   * Extract text content or video URL from message
   */
  private extractMessageContent(message: MessageData): {
    text: string | null;
    videoUrl: string | null;
    isVideo: boolean;
    rawVideoMessage: Record<string, unknown> | null;
  } {
    const msg = message.message;

    // Check for video message
    if (msg?.videoMessage) {
      return {
        text: msg.videoMessage.caption || null,
        videoUrl: msg.videoMessage.url || null,
        isVideo: true,
        rawVideoMessage: msg.videoMessage as Record<string, unknown>,
      };
    }

    // Check for text message (conversation)
    if (msg?.conversation) {
      return {
        text: msg.conversation,
        videoUrl: null,
        isVideo: false,
        rawVideoMessage: null,
      };
    }

    // WaSender specific: messageBody field
    if (message.messageBody) {
      return {
        text: message.messageBody,
        videoUrl: null,
        isVideo: false,
        rawVideoMessage: null,
      };
    }

    // Check for extended text message
    if (msg?.extendedTextMessage) {
      const extText = msg.extendedTextMessage;
      const text = typeof extText === 'string' 
        ? extText 
        : (extText as { text?: string })?.text || null;
      return {
        text,
        videoUrl: null,
        isVideo: false,
        rawVideoMessage: null,
      };
    }

    // Check for image with caption (might want to expand this later)
    if (msg?.imageMessage?.caption) {
      return {
        text: msg.imageMessage.caption,
        videoUrl: null,
        isVideo: false,
        rawVideoMessage: null,
      };
    }

    return {
      text: null,
      videoUrl: null,
      isVideo: false,
      rawVideoMessage: null,
    };
  }

  /**
   * Send response message to user
   */
  private async sendResponse(phoneNumber: string, text: string): Promise<void> {
    try {
      await whatsappService.sendTextMessage(phoneNumber, text, {
        presence: 'composing',
        delay: 1000,
      });
    } catch (error) {
      logger.error(
        'Failed to send response message',
        error instanceof Error ? error : new Error(String(error)),
        { phoneNumber }
      );
      throw error;
    }
  }

  /**
   * Send error response to user
   */
  private async sendErrorResponse(phoneNumber: string): Promise<void> {
    try {
      await whatsappService.sendTextMessage(
        phoneNumber,
        '❌ Sorry, something went wrong while processing your message. Please try again or type "help" for assistance.',
        { delay: 500 }
      );
    } catch (sendError) {
      logger.error(
        'Failed to send error response',
        sendError instanceof Error ? sendError : new Error(String(sendError)),
        { phoneNumber }
      );
    }
  }
}

export const messagesUpsertHandler = new MessagesUpsertHandler();
