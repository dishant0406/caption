/**
 * WhatsApp Provider Types
 * 
 * Unified types for supporting multiple WhatsApp API providers
 */

/**
 * Supported WhatsApp providers
 */
export type WhatsAppProviderType = 'evolution' | 'wasender';

/**
 * Normalized message key (common across providers)
 */
export interface NormalizedMessageKey {
  id: string;
  remoteJid: string;
  fromMe: boolean;
  participant?: string | undefined;
}

/**
 * Normalized video message
 */
export interface NormalizedVideoMessage {
  url: string;
  mimetype: string;
  fileLength: number;
  seconds: number;
  caption?: string | undefined;
  mediaKey?: string | undefined;
  fileSha256?: string | undefined;
  fileEncSha256?: string | undefined;
  directPath?: string | undefined;
  height?: number | undefined;
  width?: number | undefined;
  jpegThumbnail?: string | undefined;
}

/**
 * Normalized text message
 */
export interface NormalizedTextMessage {
  text: string;
}

/**
 * Normalized image message
 */
export interface NormalizedImageMessage {
  url: string;
  mimetype: string;
  caption?: string | undefined;
  mediaKey?: string | undefined;
}

/**
 * Normalized audio message
 */
export interface NormalizedAudioMessage {
  url: string;
  mimetype: string;
  seconds?: number | undefined;
  mediaKey?: string | undefined;
}

/**
 * Normalized document message
 */
export interface NormalizedDocumentMessage {
  url: string;
  mimetype: string;
  fileName: string;
  mediaKey?: string | undefined;
}

/**
 * Union type for all normalized message content types
 */
export type NormalizedMessageContent =
  | { type: 'text'; data: NormalizedTextMessage }
  | { type: 'video'; data: NormalizedVideoMessage }
  | { type: 'image'; data: NormalizedImageMessage }
  | { type: 'audio'; data: NormalizedAudioMessage }
  | { type: 'document'; data: NormalizedDocumentMessage }
  | { type: 'unknown'; data: unknown };

/**
 * Normalized incoming message (common across all providers)
 */
export interface NormalizedMessage {
  key: NormalizedMessageKey;
  pushName?: string | undefined;
  timestamp: number;
  content: NormalizedMessageContent;
  /** Raw message data from the provider for debugging/provider-specific operations */
  rawMessage: unknown;
  /** Session ID from the provider (if applicable) */
  sessionId?: string | undefined;
}

/**
 * Normalized incoming event payload
 */
export interface NormalizedEventPayload {
  event: string;
  messages: NormalizedMessage[];
  timestamp: number;
  /** Provider-specific data */
  providerData: unknown;
}

/**
 * Media decryption result
 */
export interface MediaDecryptionResult {
  success: boolean;
  publicUrl?: string | undefined;
  error?: string | undefined;
}

/**
 * Message send options
 */
export interface SendMessageOptions {
  delay?: number;
  presence?: 'composing' | 'recording' | 'available';
  linkPreview?: boolean;
}

/**
 * Message send response
 */
export interface SendMessageResponse {
  messageId: string;
  remoteJid: string;
  status: 'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
}

/**
 * Interactive button
 */
export interface InteractiveButton {
  type: 'reply';
  reply: {
    id: string;
    title: string;
  };
}

/**
 * Interactive list row
 */
export interface InteractiveListRow {
  id: string;
  title: string;
  description?: string;
}

/**
 * Interactive list section
 */
export interface InteractiveListSection {
  title: string;
  rows: InteractiveListRow[];
}

/**
 * Interactive button message
 */
export interface InteractiveButtonMessage {
  type: 'button';
  header?: {
    type: 'text' | 'video' | 'image';
    text?: string;
    video?: { link: string };
    image?: { link: string };
  };
  body: { text: string };
  footer?: { text: string };
  action: {
    buttons: InteractiveButton[];
  };
}

/**
 * Interactive list message
 */
export interface InteractiveListMessage {
  type: 'list';
  header?: { type: 'text'; text: string };
  body: { text: string };
  footer?: { text: string };
  action: {
    button: string;
    sections: InteractiveListSection[];
  };
}

/**
 * WhatsApp Provider Interface
 * 
 * All providers must implement this interface
 */
export interface IWhatsAppProvider {
  /** Provider name */
  readonly name: WhatsAppProviderType;
  
  /** Check if provider is properly configured */
  isConfigured(): boolean;
  
  /** Get the events this provider listens to */
  getEventNames(): string[];
  
  /** Get the socket URL for this provider */
  getSocketUrl(): string;
  
  /** Get authentication config for socket connection */
  getSocketAuth(): Record<string, string>;
  
  /** Normalize an incoming event payload */
  normalizeEvent(rawPayload: unknown): NormalizedEventPayload | null;
  
  /** Extract phone number from JID format */
  extractPhoneFromJid(jid: string): string;
  
  /** Format phone number to JID format */
  formatToJid(phoneNumber: string): string;
  
  /** Send a text message */
  sendTextMessage(
    phoneNumber: string,
    text: string,
    options?: SendMessageOptions
  ): Promise<SendMessageResponse>;
  
  /** Send a video message */
  sendVideoMessage(
    phoneNumber: string,
    videoUrl: string,
    caption?: string
  ): Promise<SendMessageResponse>;
  
  /** Send an interactive button message */
  sendButtonMessage(
    phoneNumber: string,
    message: InteractiveButtonMessage
  ): Promise<SendMessageResponse>;
  
  /** Send an interactive list message */
  sendListMessage(
    phoneNumber: string,
    message: InteractiveListMessage
  ): Promise<SendMessageResponse>;
  
  /** Download/decrypt media from a message */
  getMediaUrl(message: NormalizedMessage): Promise<string>;
  
  /** Decrypt media (for providers that require it) */
  decryptMedia?(messageId: string, rawMessage: unknown): Promise<MediaDecryptionResult>;
}

/**
 * Provider configuration
 */
export interface ProviderConfig {
  type: WhatsAppProviderType;
  serverUrl: string;
  socketUrl?: string;
  apiKey: string;
  instance?: string;
}

/**
 * Evolution API specific types
 */
export interface EvolutionWebhookPayload {
  event: string;
  instance: string;
  date_time: string;
  sender: string;
  server_url: string;
  apikey: string;
  data: EvolutionMessageData;
}

export interface EvolutionMessageData {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
    participant?: string;
  };
  pushName?: string;
  messageTimestamp: number;
  messageType: string;
  message: {
    conversation?: string;
    extendedTextMessage?: {
      text: string;
    };
    videoMessage?: {
      url: string;
      mimetype: string;
      caption?: string;
      fileLength?: string;
      seconds?: number;
      mediaKey?: string;
      fileSha256?: string;
      fileEncSha256?: string;
      directPath?: string;
      height?: number;
      width?: number;
      jpegThumbnail?: string;
    };
    imageMessage?: {
      url: string;
      mimetype: string;
      caption?: string;
      mediaKey?: string;
    };
    audioMessage?: {
      url: string;
      mimetype?: string;
      seconds?: number;
      mediaKey?: string;
    };
    documentMessage?: {
      url: string;
      mimetype: string;
      fileName: string;
      mediaKey?: string;
    };
  };
}

/**
 * WaSender API specific types
 */
export interface WaSenderWebhookPayload {
  event: 'messages.received' | 'messages.sent' | 'messages.status';
  sessionId: string;
  data: {
    messages: WaSenderMessageData;
  };
  timestamp: number;
}

export interface WaSenderMessageData {
  key: {
    id: string;
    fromMe: boolean;
    remoteJid: string;
    senderPn?: string;
    cleanedSenderPn?: string;
    senderLid?: string;
    addressingMode?: string;
  };
  messageTimestamp: number;
  pushName?: string;
  broadcast?: boolean;
  message: {
    conversation?: string;
    messageBody?: string;
    videoMessage?: {
      url: string;
      mimetype: string;
      fileSha256?: string;
      fileLength?: string;
      seconds?: number;
      mediaKey: string;
      height?: number;
      width?: number;
      fileEncSha256?: string;
      directPath?: string;
      mediaKeyTimestamp?: string;
      jpegThumbnail?: string;
      contextInfo?: unknown;
      streamingSidecar?: string;
      motionPhotoPresentationOffsetMs?: string;
      metadataUrl?: string;
      videoSourceType?: string;
    };
    imageMessage?: {
      url: string;
      mimetype: string;
      caption?: string;
      mediaKey: string;
      fileSha256?: string;
      fileEncSha256?: string;
    };
    audioMessage?: {
      url: string;
      mimetype?: string;
      seconds?: number;
      mediaKey?: string;
    };
    documentMessage?: {
      url: string;
      mimetype: string;
      fileName: string;
      mediaKey?: string;
    };
    messageContextInfo?: {
      deviceListMetadata?: unknown;
      deviceListMetadataVersion?: number;
      messageSecret?: string;
    };
  };
  messageBody?: string;
  remoteJid: string;
  id: string;
}
