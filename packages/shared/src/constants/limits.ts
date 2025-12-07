/**
 * Application limits and configuration constants
 */

import type { RenderSettings } from '../types/caption.types';

// Free tier limits
export const FREE_TIER = {
  // Number of free videos allowed
  MAX_FREE_VIDEOS: 2,
  
  // Maximum video duration in seconds (1 minute)
  MAX_VIDEO_DURATION: 60,
  
  // Maximum file size in bytes (50MB)
  MAX_FILE_SIZE: 50 * 1024 * 1024,
} as const;

// Paid tier limits
export const PAID_TIER = {
  // Maximum video duration in seconds (5 minutes)
  MAX_VIDEO_DURATION: 300,
  
  // Maximum file size in bytes (200MB)
  MAX_FILE_SIZE: 200 * 1024 * 1024,
} as const;

// Video processing configuration
export const VIDEO_PROCESSING = {
  // Chunk duration in seconds (for splitting long videos)
  CHUNK_DURATION: 20,
  
  // Minimum chunk duration in seconds
  MIN_CHUNK_DURATION: 5,
  
  // Maximum chunk duration in seconds
  MAX_CHUNK_DURATION: 30,
  
  // Supported input formats
  SUPPORTED_FORMATS: ['mp4', 'mov', 'webm', 'avi', 'mkv', '3gp'] as const,
  
  // Supported MIME types
  SUPPORTED_MIME_TYPES: [
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'video/x-msvideo',
    'video/x-matroska',
    'video/3gpp',
  ] as const,
  
  // Output format
  OUTPUT_FORMAT: 'mp4',
  
  // Temporary file retention (hours)
  TEMP_FILE_RETENTION_HOURS: 24,
} as const;

// Render quality settings
export const RENDER_SETTINGS: RenderSettings = {
  // Final output settings (1080p)
  outputWidth: 1920,
  outputHeight: 1080,
  outputFps: 30,
  outputBitrate: '5M',
  outputCodec: 'libx264',
  outputFormat: 'mp4',
  
  // Preview settings (480p)
  previewWidth: 854,
  previewHeight: 480,
  previewFps: 24,
  previewBitrate: '1M',
  
  // Audio settings
  audioCodec: 'aac',
  audioBitrate: '128k',
  audioSampleRate: 44100,
};

// Render settings for vertical videos (9:16)
export const RENDER_SETTINGS_VERTICAL: RenderSettings = {
  // Final output settings (1080x1920)
  outputWidth: 1080,
  outputHeight: 1920,
  outputFps: 30,
  outputBitrate: '5M',
  outputCodec: 'libx264',
  outputFormat: 'mp4',
  
  // Preview settings (480x854)
  previewWidth: 480,
  previewHeight: 854,
  previewFps: 24,
  previewBitrate: '1M',
  
  // Audio settings
  audioCodec: 'aac',
  audioBitrate: '128k',
  audioSampleRate: 44100,
};

// Job queue settings
export const JOB_QUEUE = {
  // Maximum retry attempts for failed jobs
  MAX_RETRY_ATTEMPTS: 3,
  
  // Retry delay in milliseconds (exponential backoff base)
  RETRY_DELAY_BASE: 5000,
  
  // Job timeout in milliseconds (5 minutes)
  JOB_TIMEOUT: 5 * 60 * 1000,
  
  // Long job timeout in milliseconds (15 minutes for rendering)
  LONG_JOB_TIMEOUT: 15 * 60 * 1000,
  
  // Maximum concurrent jobs per worker
  MAX_CONCURRENT_JOBS: 2,
} as const;

// Session and timeout settings
export const SESSION = {
  // Session inactivity timeout in milliseconds (30 minutes)
  INACTIVITY_TIMEOUT: 30 * 60 * 1000,
  
  // Maximum time to wait for user response per chunk (10 minutes)
  CHUNK_REVIEW_TIMEOUT: 10 * 60 * 1000,
  
  // Session expiry after completion (24 hours)
  COMPLETED_SESSION_EXPIRY: 24 * 60 * 60 * 1000,
} as const;

// WhatsApp API limits
export const WHATSAPP = {
  // Maximum file size WhatsApp can send (16MB for videos)
  MAX_VIDEO_SIZE: 16 * 1024 * 1024,
  
  // Maximum message length
  MAX_MESSAGE_LENGTH: 4096,
  
  // Rate limiting (messages per minute)
  RATE_LIMIT_PER_MINUTE: 60,
  
  // Interactive message limits
  MAX_BUTTON_TITLE_LENGTH: 20,
  MAX_LIST_TITLE_LENGTH: 24,
  MAX_LIST_DESCRIPTION_LENGTH: 72,
  MAX_BUTTONS: 3,
  MAX_LIST_SECTIONS: 10,
  MAX_LIST_ROWS_PER_SECTION: 10,
} as const;

// Transcription settings (Whisper)
export const TRANSCRIPTION = {
  // Default language
  DEFAULT_LANGUAGE: 'en',
  
  // Supported languages
  SUPPORTED_LANGUAGES: [
    'en', // English
    'es', // Spanish
    'fr', // French
    'de', // German
    'it', // Italian
    'pt', // Portuguese
    'nl', // Dutch
    'pl', // Polish
    'ru', // Russian
    'ja', // Japanese
    'ko', // Korean
    'zh', // Chinese
    'ar', // Arabic
    'hi', // Hindi
  ] as const,
  
  // Audio extraction format for Whisper
  AUDIO_FORMAT: 'wav',
  AUDIO_SAMPLE_RATE: 16000,
  AUDIO_CHANNELS: 1,
} as const;

// Storage paths
export const STORAGE_PATHS = {
  UPLOADS: 'uploads',
  CHUNKS: 'chunks',
  PREVIEWS: 'previews',
  OUTPUTS: 'outputs',
  TEMP: 'temp',
} as const;

// Error messages
export const ERROR_MESSAGES = {
  VIDEO_TOO_LONG: 'Video is too long. Maximum duration is {maxDuration} seconds.',
  VIDEO_TOO_LARGE: 'Video file is too large. Maximum size is {maxSize}MB.',
  UNSUPPORTED_FORMAT: 'Unsupported video format. Supported formats: {formats}.',
  FREE_LIMIT_REACHED: 'You have used all your free videos. Subscribe to continue.',
  PROCESSING_FAILED: 'Failed to process your video. Please try again.',
  TRANSCRIPTION_FAILED: 'Could not transcribe audio. Please ensure the video has clear speech.',
  NO_SPEECH_DETECTED: 'No speech detected in the video.',
  SESSION_EXPIRED: 'Your session has expired. Please send a new video to start over.',
  INVALID_STYLE: 'Invalid caption style selected.',
  RENDER_FAILED: 'Failed to render the final video. Please try again.',
} as const;

// Success messages
export const SUCCESS_MESSAGES = {
  VIDEO_RECEIVED: '📹 Video received! Processing your video...',
  PROCESSING_STARTED: '⏳ Processing started. This may take a moment...',
  CHUNKS_READY: '✅ Video processed! Ready for review.',
  CHUNK_APPROVED: '✅ Chunk approved!',
  ALL_APPROVED: '🎉 All chunks approved! Rendering final video...',
  RENDER_COMPLETE: '🎬 Your captioned video is ready!',
  SUBSCRIPTION_ACTIVE: '✅ Subscription activated! Enjoy unlimited captioning.',
} as const;

// Helper functions
export const isVideoTooLong = (durationSeconds: number, isPaid: boolean): boolean => {
  const maxDuration = isPaid ? PAID_TIER.MAX_VIDEO_DURATION : FREE_TIER.MAX_VIDEO_DURATION;
  return durationSeconds > maxDuration;
};

export const isFileTooLarge = (fileSizeBytes: number, isPaid: boolean): boolean => {
  const maxSize = isPaid ? PAID_TIER.MAX_FILE_SIZE : FREE_TIER.MAX_FILE_SIZE;
  return fileSizeBytes > maxSize;
};

export const hasFreeTierRemaining = (videosUsed: number): boolean => {
  return videosUsed < FREE_TIER.MAX_FREE_VIDEOS;
};

export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const formatDuration = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};
