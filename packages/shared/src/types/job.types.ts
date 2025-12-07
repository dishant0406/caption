/**
 * Job Types for Redis Pub/Sub Queue
 */

// Job type definitions
export type JobType =
  | 'VIDEO_UPLOADED'      // Trigger: chunking + transcription
  | 'CHUNK_VIDEO'         // Split video into chunks
  | 'TRANSCRIBE_CHUNK'    // Transcribe a single chunk
  | 'GENERATE_PREVIEW'    // Generate low-res preview for a chunk
  | 'RENDER_FINAL'        // Render final HD video with captions
  | 'CLEANUP';            // Clean up temporary files

// Job status
export type JobStatus = 
  | 'QUEUED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED'
  | 'RETRYING';

// Job priority levels
export type JobPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

// Base job payload interface
export interface BaseJobPayload {
  jobId: string;
  jobType: JobType;
  sessionId: string;
  userPhone: string;
  priority: JobPriority;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
}

// Video uploaded job - triggers chunking
export interface VideoUploadedJobPayload extends BaseJobPayload {
  jobType: 'VIDEO_UPLOADED';
  data: {
    videoUrl: string;
    videoDuration: number;
    videoSize: number;
    mimeType: string;
  };
}

// Chunk video job
export interface ChunkVideoJobPayload extends BaseJobPayload {
  jobType: 'CHUNK_VIDEO';
  data: {
    videoUrl: string;
    videoDuration: number;
    chunkDuration: number; // seconds per chunk (15-30)
  };
}

// Transcribe chunk job
export interface TranscribeChunkJobPayload extends BaseJobPayload {
  jobType: 'TRANSCRIBE_CHUNK';
  data: {
    chunkId: string;
    chunkUrl: string;
    chunkIndex: number;
    startTime: number;
    endTime: number;
  };
}

// Caption mode type
export type CaptionMode = 'word' | 'sentence';

// Generate preview job
export interface GeneratePreviewJobPayload extends BaseJobPayload {
  jobType: 'GENERATE_PREVIEW';
  data: {
    chunkId: string;
    chunkUrl: string;
    chunkIndex: number;
    transcript: TranscriptSegment[];
    styleId: string;
    captionMode?: CaptionMode; // 'word' for word-by-word, 'sentence' for sentence chunks
  };
}

// Render final video job
export interface RenderFinalJobPayload extends BaseJobPayload {
  jobType: 'RENDER_FINAL';
  data: {
    originalVideoUrl: string;
    chunks: ApprovedChunk[];
    styleId: string;
    outputFormat: 'mp4' | 'mov';
  };
}

// Cleanup job
export interface CleanupJobPayload extends BaseJobPayload {
  jobType: 'CLEANUP';
  data: {
    filesToDelete: string[];
    sessionCompleted: boolean;
  };
}

// Union type for all job payloads
export type JobPayload =
  | VideoUploadedJobPayload
  | ChunkVideoJobPayload
  | TranscribeChunkJobPayload
  | GeneratePreviewJobPayload
  | RenderFinalJobPayload
  | CleanupJobPayload;

// Transcript segment from Whisper
export interface TranscriptSegment {
  id: number;
  start: number;      // seconds
  end: number;        // seconds
  text: string;
  confidence?: number;
}

// Approved chunk data
export interface ApprovedChunk {
  chunkId: string;
  chunkIndex: number;
  startTime: number;
  endTime: number;
  transcript: TranscriptSegment[];
}

// Job result interfaces
export interface BaseJobResult {
  jobId: string;
  jobType: JobType;
  sessionId: string;
  status: JobStatus;
  processedAt: string;
}

export interface ChunkVideoResult extends BaseJobResult {
  jobType: 'CHUNK_VIDEO';
  data: {
    totalChunks: number;
    chunks: {
      chunkId: string;
      chunkIndex: number;
      chunkUrl: string;
      startTime: number;
      endTime: number;
    }[];
  };
}

export interface TranscribeChunkResult extends BaseJobResult {
  jobType: 'TRANSCRIBE_CHUNK';
  data: {
    chunkId: string;
    transcript: TranscriptSegment[];
    language: string;
    duration: number;
  };
}

export interface GeneratePreviewResult extends BaseJobResult {
  jobType: 'GENERATE_PREVIEW';
  data: {
    chunkId: string;
    previewUrl: string;
    thumbnailUrl?: string;
  };
}

export interface RenderFinalResult extends BaseJobResult {
  jobType: 'RENDER_FINAL';
  data: {
    finalVideoUrl: string;
    duration: number;
    fileSize: number;
  };
}

export interface VideoUploadedResult extends BaseJobResult {
  jobType: 'VIDEO_UPLOADED';
  data: {
    videoUrl: string;
    videoDuration: number;
    videoSize: number;
    storedUrl: string;
    chunkJobId?: string;
  };
}

export type JobResult =
  | VideoUploadedResult
  | ChunkVideoResult
  | TranscribeChunkResult
  | GeneratePreviewResult
  | RenderFinalResult;

// Redis channel names
export const QUEUE_CHANNELS = {
  VIDEO_JOBS: 'caption:video:jobs',
  VIDEO_RESULTS: 'caption:video:results',
  JOB_STATUS: 'caption:job:status',
} as const;
