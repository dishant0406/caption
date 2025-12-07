/**
 * Socket Event Types
 */
export type WebhookEventType = 
  | 'messages.upsert'
  | 'messages.update'
  | 'messages.received'
  | 'messages-personal.received'
  | 'messages.sent'
  | 'messages.status'
  | 'chats.update'
  | 'contacts.update'
  | 'connection.update';

/**
 * Base webhook payload structure
 */
export interface WebhookPayload {
  event: WebhookEventType | string;  // Allow string for flexibility
  instance?: string;  // Evolution format
  sessionId?: string;  // WaSender format
  date_time?: string;
  sender?: string;
  server_url?: string;
  apikey?: string;
  timestamp?: number;  // WaSender format
  data: unknown;
}

/**
 * Message key structure
 */
export interface MessageKey {
  remoteJid: string;
  fromMe: boolean;
  id: string;
  participant?: string;
  senderPn?: string;  // WaSender specific
}

/**
 * Message data structure (unified for both providers)
 */
export interface MessageData {
  key: MessageKey;
  pushName?: string;
  messageTimestamp: number;
  messageType?: string;
  messageBody?: string;  // WaSender specific
  message: {
    conversation?: string;
    extendedTextMessage?: string | { text?: string };
    imageMessage?: {
      url?: string;
      caption?: string;
      mimetype?: string;
      mediaKey?: string;
    };
    videoMessage?: {
      url?: string;
      caption?: string;
      mimetype?: string;
      fileLength?: string;
      seconds?: number;
      mediaKey?: string;
      directPath?: string;
    };
    audioMessage?: {
      url?: string;
      mimetype?: string;
      mediaKey?: string;
    };
    documentMessage?: {
      url?: string;
      fileName?: string;
      mimetype?: string;
      mediaKey?: string;
    };
  };
}

/**
 * Messages upsert payload (Evolution format)
 */
export interface MessagesUpsertPayload extends WebhookPayload {
  event: 'messages.upsert';
  data: MessageData;
}

/**
 * WaSender webhook payload format
 */
export interface WaSenderWebhookPayload extends WebhookPayload {
  event: 'messages.received' | 'messages-personal.received' | 'messages.sent';
  sessionId: string;
  data: {
    messages: MessageData;  // Note: WaSender sends it as "messages" but it's a single object
  };
  timestamp: number;
}

/**
 * Handler context
 */
export interface HandlerContext {
  instance: string;
  sender: string;
  timestamp: Date;
  serverUrl: string;
}

/**
 * Socket webhook response wrapper
 */
export interface SocketWebhookResponse {
  body: WebhookPayload;
}

/**
 * Helper to extract message data from either Evolution or WaSender format
 */
export function extractMessageData(payload: WebhookPayload): MessageData | null {
  const data = payload.data as Record<string, unknown>;
  
  if (!data) return null;
  
  // WaSender format: data.messages
  if ('messages' in data && data.messages) {
    const messages = data.messages as unknown as MessageData;
    if (messages && typeof messages === 'object' && 'key' in messages) {
      return messages;
    }
  }
  
  // Evolution format: data is MessageData directly
  if ('key' in data) {
    return data as unknown as MessageData;
  }
  
  return null;
}

/**
 * Check if payload is a message event (from any provider)
 * Only handles personal messages - ignores group and broadcast events
 */
export function isMessageEvent(payload: WebhookPayload): boolean {
  const messageEvents = [
    'messages.upsert',           // Evolution API
    'messages-personal.received', // WaSender - personal messages only
  ];
  return messageEvents.includes(payload.event);
}
