/**
 * WaSender API WhatsApp Provider
 * 
 * Implements the IWhatsAppProvider interface for WaSender API
 * https://www.wasenderapi.com
 * 
 * Key differences from Evolution API:
 * - Uses 'messages.received' event instead of 'messages.upsert'
 * - Requires media decryption via API call
 * - Has sessionId instead of instance
 */

import { logger } from '@/plugins/logger';
import type {
  InteractiveButtonMessage,
  InteractiveListMessage,
  IWhatsAppProvider,
  MediaDecryptionResult,
  NormalizedEventPayload,
  NormalizedMessage,
  NormalizedMessageContent,
  SendMessageOptions,
  SendMessageResponse,
  WaSenderMessageData,
  WaSenderWebhookPayload,
  WhatsAppProviderType,
} from './types';

export interface WaSenderProviderConfig {
  serverUrl: string;
  apiKey: string;
  socketUrl?: string | undefined;
  sessionId?: string | undefined;
}

export class WaSenderProvider implements IWhatsAppProvider {
  readonly name: WhatsAppProviderType = 'wasender';
  
  private config: WaSenderProviderConfig;

  constructor(config: WaSenderProviderConfig) {
    this.config = config;
  }

  /**
   * Check if the provider is properly configured
   */
  isConfigured(): boolean {
    return !!(this.config.serverUrl && this.config.apiKey);
  }

  /**
   * Get the events this provider listens to
   */
  getEventNames(): string[] {
    return ['messages.received', 'messages.sent', 'messages.status'];
  }

  /**
   * Get the socket URL for this provider
   */
  getSocketUrl(): string {
    return this.config.socketUrl || this.config.serverUrl;
  }

  /**
   * Get authentication config for socket connection
   */
  getSocketAuth(): Record<string, string> {
    return {
      authorization: `Bearer ${this.config.apiKey}`,
    };
  }

  /**
   * Normalize an incoming event payload to common format
   */
  normalizeEvent(rawPayload: unknown): NormalizedEventPayload | null {
    try {
      if (!this.isWaSenderPayload(rawPayload)) {
        return null;
      }

      const payload = rawPayload as WaSenderWebhookPayload;
      
      // Only process received messages
      if (payload.event !== 'messages.received') {
        logger.debug('WaSender: Skipping non-received event', { event: payload.event });
        return null;
      }

      const messageData = payload.data.messages;
      if (!messageData || !messageData.key) {
        logger.warn('WaSender: Invalid message data - missing key');
        return null;
      }

      const normalizedMessage = this.normalizeMessage(messageData, payload);
      if (!normalizedMessage) return null;

      return {
        event: 'messages.upsert', // Normalize to common event name
        messages: [normalizedMessage],
        timestamp: payload.timestamp,
        providerData: payload,
      };
    } catch (error) {
      logger.error('WaSender: Failed to normalize event', error as Error);
      return null;
    }
  }

  /**
   * Check if payload is from WaSender API
   */
  private isWaSenderPayload(payload: unknown): payload is WaSenderWebhookPayload {
    if (!payload || typeof payload !== 'object') return false;
    const p = payload as Record<string, unknown>;
    return (
      'event' in p &&
      'sessionId' in p &&
      'data' in p &&
      'timestamp' in p &&
      (p.event === 'messages.received' || p.event === 'messages.sent' || p.event === 'messages.status')
    );
  }

  /**
   * Normalize a single message
   */
  private normalizeMessage(
    data: WaSenderMessageData,
    payload: WaSenderWebhookPayload
  ): NormalizedMessage | null {
    const content = this.extractMessageContent(data);

    return {
      key: {
        id: data.key.id,
        remoteJid: data.key.remoteJid,
        fromMe: data.key.fromMe,
      },
      pushName: data.pushName,
      timestamp: data.messageTimestamp,
      content,
      rawMessage: data,
      sessionId: payload.sessionId,
    };
  }

  /**
   * Extract and normalize message content
   */
  private extractMessageContent(data: WaSenderMessageData): NormalizedMessageContent {
    const msg = data.message;

    // Video message
    if (msg.videoMessage) {
      return {
        type: 'video',
        data: {
          url: msg.videoMessage.url,
          mimetype: msg.videoMessage.mimetype,
          fileLength: parseInt(msg.videoMessage.fileLength || '0', 10),
          seconds: msg.videoMessage.seconds || 0,
          mediaKey: msg.videoMessage.mediaKey,
          fileSha256: msg.videoMessage.fileSha256,
          fileEncSha256: msg.videoMessage.fileEncSha256,
          directPath: msg.videoMessage.directPath,
          height: msg.videoMessage.height,
          width: msg.videoMessage.width,
          jpegThumbnail: msg.videoMessage.jpegThumbnail,
        },
      };
    }

    // Text message (conversation or messageBody)
    if (msg.conversation) {
      return {
        type: 'text',
        data: { text: msg.conversation },
      };
    }

    // Alternative text field (WaSender specific)
    if (data.messageBody) {
      return {
        type: 'text',
        data: { text: data.messageBody },
      };
    }

    // Image message
    if (msg.imageMessage) {
      return {
        type: 'image',
        data: {
          url: msg.imageMessage.url,
          mimetype: msg.imageMessage.mimetype,
          caption: msg.imageMessage.caption,
          mediaKey: msg.imageMessage.mediaKey,
        },
      };
    }

    // Audio message
    if (msg.audioMessage) {
      return {
        type: 'audio',
        data: {
          url: msg.audioMessage.url,
          mimetype: msg.audioMessage.mimetype || 'audio/ogg',
          seconds: msg.audioMessage.seconds,
          mediaKey: msg.audioMessage.mediaKey,
        },
      };
    }

    // Document message
    if (msg.documentMessage) {
      return {
        type: 'document',
        data: {
          url: msg.documentMessage.url,
          mimetype: msg.documentMessage.mimetype,
          fileName: msg.documentMessage.fileName,
          mediaKey: msg.documentMessage.mediaKey,
        },
      };
    }

    return { type: 'unknown', data: msg };
  }

  /**
   * Extract phone number from JID
   */
  extractPhoneFromJid(jid: string): string {
    const number = jid.split('@')[0] || jid;
    return number.startsWith('+') ? number : `+${number}`;
  }

  /**
   * Format phone number to JID
   */
  formatToJid(phoneNumber: string): string {
    const cleanNumber = phoneNumber.replace(/[^\d]/g, '');
    return `${cleanNumber}@s.whatsapp.net`;
  }

  /**
   * Clean phone number (remove + and special characters)
   */
  private cleanPhoneNumber(phoneNumber: string): string {
    return phoneNumber.replace(/[^\d]/g, '');
  }

  /**
   * Send a text message
   */
  async sendTextMessage(
    phoneNumber: string,
    text: string,
    options?: SendMessageOptions
  ): Promise<SendMessageResponse> {
    if (!this.isConfigured()) {
      throw new Error('WaSender API is not configured');
    }

    const cleanNumber = this.cleanPhoneNumber(phoneNumber);
    const url = `${this.config.serverUrl}/api/send-message`;

    const requestBody = {
      to: cleanNumber,
      text,
      ...(options?.delay && { delay: options.delay }),
    };

    logger.debug('WaSender: Sending text message', {
      url,
      number: cleanNumber,
      textLength: text.length,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`WaSender API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json() as {
      success: boolean;
      messageId?: string;
      error?: string;
    };

    if (!result.success) {
      throw new Error(`WaSender API error: ${result.error || 'Unknown error'}`);
    }

    return {
      messageId: result.messageId || '',
      remoteJid: this.formatToJid(phoneNumber),
      status: 'SENT',
    };
  }

  /**
   * Send a video message
   */
  async sendVideoMessage(
    phoneNumber: string,
    videoUrl: string,
    caption?: string
  ): Promise<SendMessageResponse> {
    if (!this.isConfigured()) {
      throw new Error('WaSender API is not configured');
    }

    const cleanNumber = this.cleanPhoneNumber(phoneNumber);
    const url = `${this.config.serverUrl}/api/send-media`;

    const requestBody = {
      to: cleanNumber,
      mediaUrl: videoUrl,
      mediaType: 'video',
      ...(caption && { caption }),
    };

    logger.debug('WaSender: Sending video message', {
      url,
      number: cleanNumber,
      videoUrl,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`WaSender API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json() as {
      success: boolean;
      messageId?: string;
      error?: string;
    };

    if (!result.success) {
      throw new Error(`WaSender API error: ${result.error || 'Unknown error'}`);
    }

    return {
      messageId: result.messageId || '',
      remoteJid: this.formatToJid(phoneNumber),
      status: 'SENT',
    };
  }

  /**
   * Send an interactive button message
   * Note: WaSender may have different API structure for buttons
   */
  async sendButtonMessage(
    phoneNumber: string,
    message: InteractiveButtonMessage
  ): Promise<SendMessageResponse> {
    if (!this.isConfigured()) {
      throw new Error('WaSender API is not configured');
    }

    const cleanNumber = this.cleanPhoneNumber(phoneNumber);
    const url = `${this.config.serverUrl}/api/send-buttons`;

    const requestBody = {
      to: cleanNumber,
      body: message.body.text,
      buttons: message.action.buttons.map(btn => ({
        id: btn.reply.id,
        text: btn.reply.title,
      })),
      ...(message.header && { header: message.header }),
      ...(message.footer && { footer: message.footer.text }),
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`WaSender API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json() as {
      success: boolean;
      messageId?: string;
      error?: string;
    };

    if (!result.success) {
      throw new Error(`WaSender API error: ${result.error || 'Unknown error'}`);
    }

    return {
      messageId: result.messageId || '',
      remoteJid: this.formatToJid(phoneNumber),
      status: 'SENT',
    };
  }

  /**
   * Send an interactive list message
   */
  async sendListMessage(
    phoneNumber: string,
    message: InteractiveListMessage
  ): Promise<SendMessageResponse> {
    if (!this.isConfigured()) {
      throw new Error('WaSender API is not configured');
    }

    const cleanNumber = this.cleanPhoneNumber(phoneNumber);
    const url = `${this.config.serverUrl}/api/send-list`;

    const requestBody = {
      to: cleanNumber,
      body: message.body.text,
      buttonText: message.action.button,
      sections: message.action.sections,
      ...(message.header && { header: message.header.text }),
      ...(message.footer && { footer: message.footer.text }),
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`WaSender API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json() as {
      success: boolean;
      messageId?: string;
      error?: string;
    };

    if (!result.success) {
      throw new Error(`WaSender API error: ${result.error || 'Unknown error'}`);
    }

    return {
      messageId: result.messageId || '',
      remoteJid: this.formatToJid(phoneNumber),
      status: 'SENT',
    };
  }

  /**
   * Get media URL from message
   * For WaSender, we need to decrypt the media first
   */
  async getMediaUrl(message: NormalizedMessage): Promise<string> {
    // For WaSender, we need to call the decrypt-media API
    const decryptResult = await this.decryptMedia(message.key.id, message.rawMessage);
    
    if (!decryptResult.success || !decryptResult.publicUrl) {
      throw new Error(decryptResult.error || 'Failed to decrypt media');
    }

    return decryptResult.publicUrl;
  }

  /**
   * Decrypt media using WaSender's decrypt-media API
   * 
   * WaSender requires calling their API to decrypt media messages:
   * POST https://www.wasenderapi.com/api/decrypt-media
   */
  async decryptMedia(messageId: string, rawMessage: unknown): Promise<MediaDecryptionResult> {
    if (!this.isConfigured()) {
      return { success: false, error: 'Provider not configured' };
    }

    try {
      const url = `${this.config.serverUrl}/api/decrypt-media`;

      // Build the request body with the original message structure
      const msgData = rawMessage as WaSenderMessageData;
      
      // Determine which type of media message this is
      let mediaMessagePayload: Record<string, unknown> = {};
      
      if (msgData.message?.videoMessage) {
        mediaMessagePayload = {
          videoMessage: {
            url: msgData.message.videoMessage.url,
            mimetype: msgData.message.videoMessage.mimetype,
            mediaKey: msgData.message.videoMessage.mediaKey,
          },
        };
      } else if (msgData.message?.imageMessage) {
        mediaMessagePayload = {
          imageMessage: {
            url: msgData.message.imageMessage.url,
            mimetype: msgData.message.imageMessage.mimetype,
            mediaKey: msgData.message.imageMessage.mediaKey,
          },
        };
      } else if (msgData.message?.audioMessage) {
        mediaMessagePayload = {
          audioMessage: {
            url: msgData.message.audioMessage.url,
            mimetype: msgData.message.audioMessage.mimetype,
            mediaKey: msgData.message.audioMessage.mediaKey,
          },
        };
      } else if (msgData.message?.documentMessage) {
        mediaMessagePayload = {
          documentMessage: {
            url: msgData.message.documentMessage.url,
            mimetype: msgData.message.documentMessage.mimetype,
            mediaKey: msgData.message.documentMessage.mediaKey,
          },
        };
      }

      const requestBody = {
        data: {
          messages: {
            key: {
              id: messageId,
            },
            message: mediaMessagePayload,
          },
        },
      };

      logger.debug('WaSender: Decrypting media', {
        url,
        messageId,
        mediaType: Object.keys(mediaMessagePayload)[0],
      });

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('WaSender: Failed to decrypt media', new Error(errorText), {
          status: response.status,
          messageId,
        });
        return { 
          success: false, 
          error: `API error: ${response.status} - ${errorText}` 
        };
      }

      const result = await response.json() as {
        success: boolean;
        publicUrl?: string;
        error?: string;
      };

      if (!result.success) {
        return { 
          success: false, 
          error: result.error || 'Decryption failed' 
        };
      }

      logger.info('WaSender: Media decrypted successfully', {
        messageId,
        publicUrl: result.publicUrl,
      });

      return {
        success: true,
        publicUrl: result.publicUrl,
      };
    } catch (error) {
      logger.error('WaSender: Failed to decrypt media', error as Error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check if message contains only video (reject others)
   * Utility method for filtering messages
   */
  isVideoMessage(message: NormalizedMessage): boolean {
    return message.content.type === 'video';
  }

  /**
   * Check if message is a text message
   */
  isTextMessage(message: NormalizedMessage): boolean {
    return message.content.type === 'text';
  }
}
