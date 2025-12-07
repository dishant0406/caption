import { logger } from '@/plugins/logger';
import {
  getSenderProvider,
  getWhatsAppProvider,
  type IWhatsAppProvider,
  type InteractiveButtonMessage,
  type InteractiveListMessage,
  type NormalizedMessage,
  type SendMessageOptions,
  type SendMessageResponse
} from './providers';

/**
 * WhatsApp Message Options (re-exported for backward compatibility)
 */
export type WhatsAppMessageOptions = SendMessageOptions;

// Re-export types for backward compatibility
export type {
  InteractiveButton,
  InteractiveButtonMessage,
  InteractiveListMessage,
  InteractiveListRow,
  InteractiveListSection
} from './providers';

/**
 * WhatsApp Message Response (legacy format)
 */
export interface WhatsAppMessageResponse {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
  };
  message: {
    extendedTextMessage?: { text: string };
    conversation?: string;
  };
  messageTimestamp: string;
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
}

export type InteractiveMessage =
  | InteractiveButtonMessage
  | InteractiveListMessage;

/**
 * WhatsApp Service
 * 
 * Handles communication with the WhatsApp API.
 * Uses separate providers for receiving (WaSender) and sending (Evolution).
 * - Receiving webhooks: Uses WHATSAPP_PROVIDER from env (WaSender)
 * - Sending messages: Always uses Evolution API
 */
export class WhatsAppService {
  /** Provider for receiving webhooks (WaSender) */
  private receiverProvider: IWhatsAppProvider;
  /** Provider for sending messages (Evolution) */
  private senderProvider: IWhatsAppProvider;

  constructor() {
    this.receiverProvider = getWhatsAppProvider();
    this.senderProvider = getSenderProvider();

    logger.info('📱 WhatsApp Service initialized', {
      receiverProvider: this.receiverProvider.name,
      senderProvider: this.senderProvider.name,
      receiverConfigured: this.receiverProvider.isConfigured(),
      senderConfigured: this.senderProvider.isConfigured(),
    });

    if (!this.senderProvider.isConfigured()) {
      logger.warn(
        '⚠️ Evolution API (sender) not configured. Messages will not be sent.',
        { provider: this.senderProvider.name }
      );
    }
  }

  /**
   * Check if WhatsApp API is configured (sender provider)
   */
  isConfigured(): boolean {
    return this.senderProvider.isConfigured();
  }

  /**
   * Get the current sender provider name
   */
  getProviderName(): string {
    return this.senderProvider.name;
  }

  /**
   * Get the receiver provider (for webhook/media operations)
   */
  getReceiverProvider(): IWhatsAppProvider {
    return this.receiverProvider;
  }

  /**
   * Get the sender provider (for sending messages)
   */
  getProvider(): IWhatsAppProvider {
    return this.senderProvider;
  }

  /**
   * Send a text message via WhatsApp (uses Evolution API)
   */
  async sendTextMessage(
    phoneNumber: string,
    text: string,
    options?: WhatsAppMessageOptions
  ): Promise<WhatsAppMessageResponse> {
    if (!this.senderProvider.isConfigured()) {
      throw new Error(
        `WhatsApp API (${this.senderProvider.name}) is not configured.`
      );
    }

    logger.debug('Sending WhatsApp message', {
      provider: this.senderProvider.name,
      number: phoneNumber,
      textLength: text.length,
    });

    try {
      const result = await this.senderProvider.sendTextMessage(phoneNumber, text, options);

      logger.info('WhatsApp message sent successfully', {
        provider: this.senderProvider.name,
        messageId: result.messageId,
        remoteJid: result.remoteJid,
        status: result.status,
      });

      // Convert to legacy response format
      return this.toWhatsAppMessageResponse(result);
    } catch (error) {
      logger.error(
        'Failed to send WhatsApp message',
        error instanceof Error ? error : new Error(String(error)),
        { provider: this.senderProvider.name, phoneNumber, textLength: text.length }
      );
      throw error;
    }
  }

  /**
   * Send an interactive button message (uses Evolution API)
   */
  async sendButtonMessage(
    phoneNumber: string,
    message: InteractiveButtonMessage
  ): Promise<WhatsAppMessageResponse> {
    if (!this.senderProvider.isConfigured()) {
      throw new Error(`WhatsApp API (${this.senderProvider.name}) is not configured.`);
    }

    logger.debug('Sending WhatsApp button message', {
      provider: this.senderProvider.name,
      number: phoneNumber,
      buttonCount: message.action.buttons.length,
    });

    try {
      const result = await this.senderProvider.sendButtonMessage(phoneNumber, message);

      logger.info('WhatsApp button message sent successfully', {
        provider: this.senderProvider.name,
        messageId: result.messageId,
      });

      return this.toWhatsAppMessageResponse(result);
    } catch (error) {
      logger.error(
        'Failed to send WhatsApp button message',
        error instanceof Error ? error : new Error(String(error)),
        { provider: this.senderProvider.name }
      );
      throw error;
    }
  }

  /**
   * Send an interactive list message (uses Evolution API)
   */
  async sendListMessage(
    phoneNumber: string,
    message: InteractiveListMessage
  ): Promise<WhatsAppMessageResponse> {
    if (!this.senderProvider.isConfigured()) {
      throw new Error(`WhatsApp API (${this.senderProvider.name}) is not configured.`);
    }

    logger.debug('Sending WhatsApp list message', {
      provider: this.senderProvider.name,
      number: phoneNumber,
      sectionCount: message.action.sections.length,
    });

    try {
      const result = await this.senderProvider.sendListMessage(phoneNumber, message);

      logger.info('WhatsApp list message sent successfully', {
        provider: this.senderProvider.name,
        messageId: result.messageId,
      });

      return this.toWhatsAppMessageResponse(result);
    } catch (error) {
      logger.error(
        'Failed to send WhatsApp list message',
        error instanceof Error ? error : new Error(String(error)),
        { provider: this.senderProvider.name }
      );
      throw error;
    }
  }

  /**
   * Send a video message (uses Evolution API)
   */
  async sendVideoMessage(
    phoneNumber: string,
    videoUrl: string,
    caption?: string
  ): Promise<WhatsAppMessageResponse> {
    if (!this.senderProvider.isConfigured()) {
      throw new Error(`WhatsApp API (${this.senderProvider.name}) is not configured.`);
    }

    logger.debug('Sending WhatsApp video message', {
      provider: this.senderProvider.name,
      number: phoneNumber,
      videoUrl,
    });

    try {
      const result = await this.senderProvider.sendVideoMessage(phoneNumber, videoUrl, caption);

      logger.info('WhatsApp video message sent successfully', {
        provider: this.senderProvider.name,
        messageId: result.messageId,
      });

      return this.toWhatsAppMessageResponse(result);
    } catch (error) {
      logger.error(
        'Failed to send WhatsApp video message',
        error instanceof Error ? error : new Error(String(error)),
        { provider: this.senderProvider.name }
      );
      throw error;
    }
  }

  /**
   * Get media URL from a message (uses receiver provider - WaSender)
   * For WaSender, this will decrypt the media first
   */
  async getMediaUrl(message: NormalizedMessage): Promise<string> {
    if (!this.receiverProvider.isConfigured()) {
      throw new Error(`WhatsApp API (${this.receiverProvider.name}) is not configured.`);
    }

    logger.debug('Getting media URL', {
      provider: this.receiverProvider.name,
      messageId: message.key.id,
      contentType: message.content.type,
    });

    try {
      const url = await this.receiverProvider.getMediaUrl(message);

      logger.info('Media URL retrieved successfully', {
        provider: this.receiverProvider.name,
        messageId: message.key.id,
      });

      return url;
    } catch (error) {
      logger.error(
        'Failed to get media URL',
        error instanceof Error ? error : new Error(String(error)),
        { provider: this.receiverProvider.name, messageId: message.key.id }
      );
      throw error;
    }
  }

  /**
   * Download media from WhatsApp (legacy method)
   * Uses the receiver provider's decryptMedia if available
   */
  async downloadMedia(messageId: string): Promise<Buffer> {
    if (!this.receiverProvider.isConfigured()) {
      throw new Error(`WhatsApp API (${this.receiverProvider.name}) is not configured.`);
    }

    logger.debug('Downloading media', {
      provider: this.receiverProvider.name,
      messageId,
    });

    try {
      // Check if provider has decryptMedia method
      if (this.receiverProvider.decryptMedia) {
        const result = await this.receiverProvider.decryptMedia(messageId, {});
        
        if (!result.success || !result.publicUrl) {
          throw new Error(result.error || 'Failed to decrypt media');
        }

        // If we have a public URL, fetch the data
        if (result.publicUrl.startsWith('data:')) {
          // Base64 data URL
          const base64Data = result.publicUrl.split(',')[1];
          if (!base64Data) {
            throw new Error('Invalid base64 data URL');
          }
          return Buffer.from(base64Data, 'base64');
        }

        // Fetch from public URL
        const response = await fetch(result.publicUrl);
        if (!response.ok) {
          throw new Error(`Failed to download media: ${response.status}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      }

      throw new Error(`Provider ${this.receiverProvider.name} does not support media download`);
    } catch (error) {
      logger.error(
        'Failed to download media',
        error instanceof Error ? error : new Error(String(error)),
        { provider: this.receiverProvider.name, messageId }
      );
      throw error;
    }
  }

  /**
   * Format phone number to WhatsApp JID format
   */
  formatToJid(phoneNumber: string): string {
    return this.receiverProvider.formatToJid(phoneNumber);
  }

  /**
   * Extract phone number from WhatsApp JID
   * Returns E.164 format with + prefix
   */
  extractPhoneFromJid(jid: string): string {
    return this.receiverProvider.extractPhoneFromJid(jid);
  }

  /**
   * Convert provider response to legacy WhatsAppMessageResponse format
   */
  private toWhatsAppMessageResponse(result: SendMessageResponse): WhatsAppMessageResponse {
    return {
      key: {
        remoteJid: result.remoteJid,
        fromMe: true,
        id: result.messageId,
      },
      message: {},
      messageTimestamp: Date.now().toString(),
      status: result.status,
    };
  }
}

// Export singleton instance
export const whatsappService = new WhatsAppService();
