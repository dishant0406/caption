/**
 * Video-related type definitions
 */

// Session status for caption workflow
export type SessionStatus =
  | 'PENDING'           // Video uploaded, waiting to process
  | 'CHUNKING'          // Splitting video into chunks
  | 'TRANSCRIBING'      // Transcribing audio
  | 'STYLE_SELECTION'   // Waiting for user to select style
  | 'PREVIEW_READY'     // Previews generated, ready for review
  | 'REVIEWING'         // User is reviewing chunks
  | 'RENDERING'         // Final HD render in progress
  | 'COMPLETED'         // All done, final video delivered
  | 'FAILED'            // Something went wrong
  | 'CANCELLED';        // User cancelled

// Video chunk status
export type ChunkStatus =
  | 'PENDING'           // Created, waiting to process
  | 'TRANSCRIBING'      // Transcription in progress
  | 'TRANSCRIBED'       // Transcription complete
  | 'GENERATING_PREVIEW'// Preview generation in progress
  | 'PREVIEW_READY'     // Preview ready for user review
  | 'APPROVED'          // User approved this chunk
  | 'REJECTED'          // User rejected, needs re-transcription
  | 'REPROCESSING';     // Re-transcribing after rejection

// User subscription status
export type SubscriptionStatus = 
  | 'FREE'              // Using free tier
  | 'ACTIVE'            // Paid subscription active
  | 'EXPIRED'           // Subscription expired
  | 'CANCELLED';        // User cancelled subscription

// Supported video formats
export type VideoFormat = 'mp4' | 'mov' | 'webm' | 'avi' | 'mkv';

// Video metadata
export interface VideoMetadata {
  duration: number;       // seconds
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  codec: string;
  audioCodec?: string;
  fileSize: number;       // bytes
  mimeType: string;
}

// User data interface
export interface UserData {
  phoneNumber: string;
  whatsappId: string;
  name: string;
  freeVideosUsed: number;
  subscriptionStatus: SubscriptionStatus;
  subscriptionExpiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  lastActiveAt?: Date;
}

// Caption session data interface
export interface CaptionSessionData {
  sessionId: string;
  userPhone: string;
  status: SessionStatus;
  originalVideoUrl: string;
  originalVideoMetadata?: VideoMetadata;
  selectedStyleId?: string;
  currentChunkIndex: number;
  totalChunks: number;
  finalVideoUrl?: string;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

// Video chunk data interface
export interface VideoChunkData {
  chunkId: string;
  sessionId: string;
  chunkIndex: number;
  chunkUrl: string;
  startTime: number;      // seconds
  endTime: number;        // seconds
  duration: number;       // seconds
  status: ChunkStatus;
  transcript?: string;    // JSON string of TranscriptSegment[]
  previewUrl?: string;
  userApproved: boolean;
  reprocessCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// Video job data interface
export interface VideoJobData {
  jobId: string;
  sessionId: string;
  chunkId?: string;
  jobType: string;
  status: string;
  priority: number;
  attempts: number;
  maxAttempts: number;
  payload?: string;       // JSON string of job payload
  result?: string;        // JSON string of job result
  errorMessage?: string;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// WhatsApp message types
export type WhatsAppMessageType = 
  | 'text'
  | 'video'
  | 'image'
  | 'audio'
  | 'document'
  | 'sticker'
  | 'interactive'
  | 'button_reply'
  | 'list_reply';

// Interactive message action types
export interface InteractiveButton {
  type: 'reply';
  reply: {
    id: string;
    title: string;
  };
}

export interface InteractiveListRow {
  id: string;
  title: string;
  description?: string;
}

export interface InteractiveListSection {
  title: string;
  rows: InteractiveListRow[];
}

// User workflow action
export type UserAction =
  | 'SELECT_STYLE'
  | 'APPROVE_CHUNK'
  | 'REJECT_CHUNK'
  | 'REPROCESS_CHUNK'
  | 'CANCEL'
  | 'START_OVER';
