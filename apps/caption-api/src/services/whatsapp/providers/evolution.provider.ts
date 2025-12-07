/**
 * Evolution API WhatsApp Provider
 * 
 * Implements the IWhatsAppProvider interface for Evolution API
 * https://github.com/EvolutionAPI/evolution-api
 */

import { logger } from '@/plugins/logger';
import type {
  EvolutionMessageData,
  EvolutionWebhookPayload,
  InteractiveButtonMessage,
  InteractiveListMessage,
  IWhatsAppProvider,
  MediaDecryptionResult,
  NormalizedEventPayload,
  NormalizedMessage,
  NormalizedMessageContent,
  SendMessageOptions,
  SendMessageResponse,
  WhatsAppProviderType,
} from './types';

export interface EvolutionProviderConfig {
  serverUrl: string;
  apiKey: string;
  instance: string;
  socketUrl?: string | undefined;
}

export class EvolutionProvider implements IWhatsAppProvider {
  readonly name: WhatsAppProviderType = 'evolution';
  
  private config: EvolutionProviderConfig;

  constructor(config: EvolutionProviderConfig) {
    this.config = config;
  }

  /**
   * Check if the provider is properly configured
   */
  isConfigured(): boolean {
    return !!(this.config.serverUrl && this.config.apiKey && this.config.instance);
  }

  /**
   * Get the events this provider listens to
   */
  getEventNames(): string[] {
    return ['messages.upsert', 'webhook'];
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
      apikey: this.config.apiKey,
    };
  }

  /**
   * Normalize an incoming event payload to common format
   */
  normalizeEvent(rawPayload: unknown): NormalizedEventPayload | null {
    try {
      // Handle webhook wrapper format
      const payload = this.extractPayload(rawPayload);
      if (!payload) return null;

      // Check if it's a valid Evolution API payload
      if (!this.isEvolutionPayload(payload)) {
        return null;
      }

      const data = payload.data;
      if (!data || !data.key) {
        logger.warn('Evolution: Invalid message data - missing key');
        return null;
      }

      const normalizedMessage = this.normalizeMessage(data, payload);
      if (!normalizedMessage) return null;

      return {
        event: payload.event,
        messages: [normalizedMessage],
        timestamp: new Date(payload.date_time).getTime(),
        providerData: payload,
      };
    } catch (error) {
      logger.error('Evolution: Failed to normalize event', error as Error);
      return null;
    }
  }

  /**
   * Extract payload from various wrapper formats
   */
  private extractPayload(rawPayload: unknown): EvolutionWebhookPayload | null {
    if (!rawPayload || typeof rawPayload !== 'object') return null;

    // Direct payload
    if ('event' in rawPayload && 'data' in rawPayload) {
      return rawPayload as EvolutionWebhookPayload;
    }

    // Wrapped in body (socket webhook response)
    if ('body' in rawPayload) {
      const body = (rawPayload as { body: unknown }).body;
      if (body && typeof body === 'object' && 'event' in body) {
        return body as EvolutionWebhookPayload;
      }
    }

    return null;
  }

  /**
   * Check if payload is from Evolution API
   */
  private isEvolutionPayload(payload: unknown): payload is EvolutionWebhookPayload {
    if (!payload || typeof payload !== 'object') return false;
    const p = payload as Record<string, unknown>;
    return (
      'event' in p &&
      'instance' in p &&
      'data' in p &&
      (p.event === 'messages.upsert' || p.event === 'messages.update')
    );
  }

  /**
   * Normalize a single message
   */
  private normalizeMessage(
    data: EvolutionMessageData,
    payload: EvolutionWebhookPayload
  ): NormalizedMessage | null {
    const content = this.extractMessageContent(data);

    return {
      key: {
        id: data.key.id,
        remoteJid: data.key.remoteJid,
        fromMe: data.key.fromMe,
        participant: data.key.participant,
      },
      pushName: data.pushName,
      timestamp: data.messageTimestamp,
      content,
      rawMessage: data,
      sessionId: payload.instance,
    };
  }

  /**
   * Extract and normalize message content
   */
  private extractMessageContent(data: EvolutionMessageData): NormalizedMessageContent {
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
          caption: msg.videoMessage.caption,
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

    // Text message (conversation)
    if (msg.conversation) {
      return {
        type: 'text',
        data: { text: msg.conversation },
      };
    }

    // Extended text message
    if (msg.extendedTextMessage) {
      return {
        type: 'text',
        data: { text: msg.extendedTextMessage.text },
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
      throw new Error('Evolution API is not configured');
    }

    const cleanNumber = this.cleanPhoneNumber(phoneNumber);
    const url = `${this.config.serverUrl}/message/sendText/${this.config.instance}`;

    const requestBody = {
      number: cleanNumber,
      text,
      ...(options && { options }),
    };

    logger.debug('Evolution: Sending text message', {
      url,
      number: cleanNumber,
      textLength: text.length,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.config.apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Evolution API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json() as {
      key: { remoteJid: string; id: string };
      status: string;
    };

    return {
      messageId: result.key.id,
      remoteJid: result.key.remoteJid,
      status: result.status as SendMessageResponse['status'],
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
      throw new Error('Evolution API is not configured');
    }

    const cleanNumber = this.cleanPhoneNumber(phoneNumber);
    const url = `${this.config.serverUrl}/message/sendMedia/${this.config.instance}`;

    const requestBody = {
      number: cleanNumber,
      mediatype: 'video',
      media: videoUrl,
      ...(caption && { caption }),
    };

    logger.debug('Evolution: Sending video message', {
      url,
      number: cleanNumber,
      videoUrl,
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.config.apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Evolution API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json() as {
      key: { remoteJid: string; id: string };
      status: string;
    };

    return {
      messageId: result.key.id,
      remoteJid: result.key.remoteJid,
      status: result.status as SendMessageResponse['status'],
    };
  }

  /**
   * Send an interactive button message
   */
  async sendButtonMessage(
    phoneNumber: string,
    message: InteractiveButtonMessage
  ): Promise<SendMessageResponse> {
    if (!this.isConfigured()) {
      throw new Error('Evolution API is not configured');
    }

    const cleanNumber = this.cleanPhoneNumber(phoneNumber);
    const url = `${this.config.serverUrl}/message/sendButtons/${this.config.instance}`;

    const requestBody = {
      number: cleanNumber,
      ...message,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.config.apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Evolution API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json() as {
      key: { remoteJid: string; id: string };
      status: string;
    };

    return {
      messageId: result.key.id,
      remoteJid: result.key.remoteJid,
      status: result.status as SendMessageResponse['status'],
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
      throw new Error('Evolution API is not configured');
    }

    const cleanNumber = this.cleanPhoneNumber(phoneNumber);
    const url = `${this.config.serverUrl}/message/sendList/${this.config.instance}`;

    const requestBody = {
      number: cleanNumber,
      ...message,
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: this.config.apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Evolution API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json() as {
      key: { remoteJid: string; id: string };
      status: string;
    };

    return {
      messageId: result.key.id,
      remoteJid: result.key.remoteJid,
      status: result.status as SendMessageResponse['status'],
    };
  }

  /**
   * Get media URL from message
   * Evolution API provides direct URLs that can be used directly
   */
  async getMediaUrl(message: NormalizedMessage): Promise<string> {
    if (message.content.type === 'video') {
      return message.content.data.url;
    }
    if (message.content.type === 'image') {
      return message.content.data.url;
    }
    if (message.content.type === 'audio') {
      return message.content.data.url;
    }
    if (message.content.type === 'document') {
      return message.content.data.url;
    }
    throw new Error('Message does not contain media');
  }

  /**
   * Decrypt media (Evolution API provides base64 download)
   */
  async decryptMedia(messageId: string): Promise<MediaDecryptionResult> {
    if (!this.isConfigured()) {
      return { success: false, error: 'Provider not configured' };
    }

    try {
      const url = `${this.config.serverUrl}/chat/getBase64FromMediaMessage/${this.config.instance}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: this.config.apiKey,
        },
        body: JSON.stringify({
          message: { key: { id: messageId } },
          convertToMp4: true,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return { success: false, error: `API error: ${response.status} - ${errorText}` };
      }

      const result = await response.json() as { base64: string };
      
      // For Evolution API, we return base64 data URL
      // In practice, you would upload this to storage and return the public URL
      return {
        success: true,
        publicUrl: `data:video/mp4;base64,${result.base64}`,
      };
    } catch (error) {
      logger.error('Evolution: Failed to decrypt media', error as Error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
