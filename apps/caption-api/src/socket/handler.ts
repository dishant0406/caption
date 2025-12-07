import { logger } from '@/plugins/logger';
import type { HandlerContext, WebhookPayload } from './types';

/**
 * Base handler interface for webhook events
 */
export interface IWebhookHandler<T extends WebhookPayload = WebhookPayload> {
  readonly eventType: string;
  /** Optional: handlers can support multiple event types */
  getSupportedEvents?(): string[];
  handle(payload: T, context: HandlerContext): Promise<void> | void;
  validate?(payload: T): boolean;
  onError?(error: Error, payload: T): void;
}

/**
 * Handler registry to manage all webhook handlers
 */
export class WebhookHandlerRegistry {
  private handlers: Map<string, IWebhookHandler[]> = new Map();

  /**
   * Register a handler for its event type(s)
   */
  register<T extends WebhookPayload>(handler: IWebhookHandler<T>): void {
    // Get all event types this handler supports
    const eventTypes = handler.getSupportedEvents?.() || [handler.eventType];
    
    for (const eventType of eventTypes) {
      const existing = this.handlers.get(eventType) || [];
      existing.push(handler as IWebhookHandler);
      this.handlers.set(eventType, existing);
      
      logger.debug(`Registered handler for event: ${eventType}`);
    }
  }

  registerAll(handlers: IWebhookHandler[]): void {
    handlers.forEach((handler) => this.register(handler));
  }

  getHandlers(eventType: string): IWebhookHandler[] {
    return this.handlers.get(eventType) || [];
  }

  async process(payload: WebhookPayload): Promise<void> {
    const handlers = this.getHandlers(payload.event);

    if (handlers.length === 0) {
      logger.warn(`⚠️ No handlers registered for event: ${payload.event}`);
      return;
    }

    const context: HandlerContext = {
      instance: payload.instance || payload.sessionId || 'unknown',
      sender: payload.sender || 'socket',
      timestamp: payload.date_time ? new Date(payload.date_time) : new Date(payload.timestamp || Date.now()),
      serverUrl: payload.server_url || '',
    };

    const promises = handlers.map(async (handler) => {
      try {
        if (handler.validate && !handler.validate(payload)) {
          logger.warn(`⚠️ Validation failed for ${payload.event} handler`);
          return;
        }

        await handler.handle(payload, context);
      } catch (error) {
        const err = error as Error;
        logger.error(`❌ Error in ${payload.event} handler`, err);

        if (handler.onError) {
          handler.onError(err, payload);
        }
      }
    });

    await Promise.all(promises);
  }

  getRegisteredEvents(): string[] {
    return Array.from(this.handlers.keys());
  }

  clear(): void {
    this.handlers.clear();
  }
}
