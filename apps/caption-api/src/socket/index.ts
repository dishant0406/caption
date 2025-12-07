import { env } from '@/config/env';
import { logger } from '@/plugins/logger';
import {
  getWhatsAppProvider,
  type IWhatsAppProvider,
  type NormalizedEventPayload,
} from '@/services/whatsapp/providers';
import { io, Socket } from 'socket.io-client';
import { WebhookHandlerRegistry } from './handler';
import { messagesUpsertHandler } from './handlers/MessagesUpsertHandler';
import type { SocketWebhookResponse, WebhookPayload } from './types';

/**
 * WhatsApp Socket Manager
 * 
 * Connects to the WhatsApp socket server and handles incoming webhook events.
 * Uses the provider pattern to support multiple WhatsApp APIs (Evolution, WaSender, etc.)
 */
export class WhatsAppSocketManager {
  private socket: Socket | null = null;
  private registry: WebhookHandlerRegistry;
  private isConnected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 5000;
  private provider: IWhatsAppProvider;

  constructor() {
    this.provider = getWhatsAppProvider();
    this.registry = new WebhookHandlerRegistry();
    this.registerHandlers();
  }

  /**
   * Register all webhook handlers
   */
  private registerHandlers(): void {
    // Register the messages.upsert handler
    this.registry.register(messagesUpsertHandler);

    logger.info('📋 Registered webhook handlers', {
      events: this.registry.getRegisteredEvents(),
    });
  }

  /**
   * Connect to the WhatsApp socket server
   */
  connect(): void {
    // Get socket URL from provider
    const socketUrl = this.provider.getSocketUrl();
    
    if (!socketUrl) {
      logger.warn('⚠️ WhatsApp socket URL not configured. Skipping socket connection.');
      return;
    }

    // Get auth config from provider
    const socketAuth = this.provider.getSocketAuth();

    logger.info('🔌 Connecting to WhatsApp socket server...', { 
      socketUrl,
      provider: this.provider.name,
      events: this.provider.getEventNames(),
    });

    this.socket = io(socketUrl, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: this.reconnectDelay,
      auth: socketAuth,
    });

    this.setupEventListeners();
  }

  /**
   * Setup socket event listeners
   */
  private setupEventListeners(): void {
    if (!this.socket) return;

    // Connection events
    this.socket.on('connect', () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      logger.info('✅ Connected to WhatsApp socket server', {
        socketId: this.socket?.id,
        provider: this.provider.name,
      });
    });

    this.socket.on('disconnect', (reason: string) => {
      this.isConnected = false;
      logger.warn('⚠️ Disconnected from WhatsApp socket server', { reason });
    });

    this.socket.on('connect_error', (error: Error) => {
      this.reconnectAttempts++;
      logger.error(
        '❌ Socket connection error',
        error,
        { 
          attempt: this.reconnectAttempts, 
          maxAttempts: this.maxReconnectAttempts 
        }
      );
    });

    this.socket.on('reconnect', (attemptNumber: number) => {
      logger.info('🔄 Reconnected to WhatsApp socket server', { attemptNumber });
    });

    this.socket.on('reconnect_failed', () => {
      logger.error('❌ Failed to reconnect to WhatsApp socket server after max attempts', new Error('Max reconnection attempts reached'));
    });

    // Webhook event listener (common format)
    this.socket.on('webhook', async (data: SocketWebhookResponse) => {
      await this.handleWebhook(data);
    });

    // Register provider-specific event listeners
    const providerEvents = this.provider.getEventNames();
    for (const eventName of providerEvents) {
      this.socket.on(eventName, async (data: unknown) => {
        await this.handleProviderEvent(eventName, data);
      });
    }

    // Generic message event (fallback)
    this.socket.on('message', async (data: unknown) => {
      if (this.isWebhookPayload(data)) {
        await this.handleWebhook({ body: data as WebhookPayload });
      }
    });

    logger.debug('📡 Socket event listeners registered', {
      providerEvents,
      provider: this.provider.name,
    });
  }

  /**
   * Handle provider-specific events
   * Uses the provider's normalizeEvent method to normalize the payload
   */
  private async handleProviderEvent(eventName: string, rawData: unknown): Promise<void> {
    try {
      logger.debug('📨 Received provider event', {
        event: eventName,
        provider: this.provider.name,
      });

      // Try to normalize using provider
      const normalizedEvent = this.provider.normalizeEvent(rawData);
      
      if (normalizedEvent) {
        // Process normalized event
        await this.handleNormalizedEvent(normalizedEvent);
      } else {
        // Fallback to direct event handling
        await this.handleDirectEvent(eventName, rawData);
      }
    } catch (error) {
      logger.error(
        '❌ Error processing provider event',
        error instanceof Error ? error : new Error(String(error)),
        { eventName, provider: this.provider.name }
      );
    }
  }

  /**
   * Handle normalized events from providers
   */
  private async handleNormalizedEvent(event: NormalizedEventPayload): Promise<void> {
    try {
      logger.debug('📨 Processing normalized event', {
        event: event.event,
        messageCount: event.messages.length,
      });

      // Convert to webhook payload format for existing handlers
      for (const message of event.messages) {
        const payload: WebhookPayload = {
          event: event.event as WebhookPayload['event'],
          instance: message.sessionId || env.WHATSAPP_INSTANCE || 'default',
          date_time: new Date(event.timestamp).toISOString(),
          sender: 'socket',
          server_url: env.WHATSAPP_SERVER_URL || '',
          apikey: env.WHATSAPP_API_KEY || '',
          data: {
            // Map normalized message to expected format
            key: message.key,
            pushName: message.pushName,
            messageTimestamp: message.timestamp,
            message: message.rawMessage,
            // Include normalized content for handlers that support it
            normalizedContent: message.content,
          },
        };

        await this.registry.process(payload);
      }
    } catch (error) {
      logger.error(
        '❌ Error processing normalized event',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Handle incoming webhook event
   */
  private async handleWebhook(data: SocketWebhookResponse): Promise<void> {
    try {
      const payload = data.body;
      
      if (!payload || !payload.event) {
        logger.warn('⚠️ Invalid webhook payload received', { data });
        return;
      }

      logger.debug('📨 Received webhook event', {
        event: payload.event,
        instance: payload.instance,
        sender: payload.sender,
      });

      await this.registry.process(payload);
    } catch (error) {
      logger.error(
        '❌ Error processing webhook',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Handle direct event (for servers that emit events directly)
   */
  private async handleDirectEvent(eventType: string, data: unknown): Promise<void> {
    try {
      // Construct a webhook-like payload
      const payload: WebhookPayload = {
        event: eventType as WebhookPayload['event'],
        instance: env.WHATSAPP_INSTANCE || 'default',
        date_time: new Date().toISOString(),
        sender: 'socket',
        server_url: env.WHATSAPP_SERVER_URL || '',
        apikey: env.WHATSAPP_API_KEY || '',
        data,
      };

      logger.debug('📨 Received direct event', {
        event: eventType,
      });

      await this.registry.process(payload);
    } catch (error) {
      logger.error(
        '❌ Error processing direct event',
        error instanceof Error ? error : new Error(String(error)),
        { eventType }
      );
    }
  }

  /**
   * Check if data is a webhook payload
   */
  private isWebhookPayload(data: unknown): boolean {
    return (
      typeof data === 'object' &&
      data !== null &&
      'event' in data &&
      typeof (data as Record<string, unknown>).event === 'string'
    );
  }

  /**
   * Disconnect from the socket server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
      logger.info('🔌 Disconnected from WhatsApp socket server');
    }
  }

  /**
   * Get connection status
   */
  getStatus(): { connected: boolean; socketId: string | null; provider: string } {
    return {
      connected: this.isConnected,
      socketId: this.socket?.id || null,
      provider: this.provider.name,
    };
  }

  /**
   * Get the handler registry (for testing or adding more handlers)
   */
  getRegistry(): WebhookHandlerRegistry {
    return this.registry;
  }

  /**
   * Get the current provider
   */
  getProvider(): IWhatsAppProvider {
    return this.provider;
  }
}

// Export singleton instance
export const socketManager = new WhatsAppSocketManager();

// Export handler types for external use
export { WebhookHandlerRegistry } from './handler';
export type { IWebhookHandler } from './handler';
export * from './types';

