/**
 * Application limits and configuration constants
 */

import type { RenderSettings } from '../types/caption.types';

// Subscription tiers (minutes-based pricing)
export const SUBSCRIPTION_TIERS = {
  FREE: {
    planType: 'FREE',
    minutesPerMonth: 2,
    maxVideoLength: 60, // 1 minute
    maxFileSize: 50 * 1024 * 1024, // 50MB
    price: 0,
    refillMonthly: true,
    features: [
      '2 minutes per month',
      'Up to 60 second videos',
      'Basic caption styles',
      'Standard quality',
    ],
  },
  STARTER: {
    planType: 'STARTER',
    minutesPerMonth: 30,
    maxVideoLength: 180, // 3 minutes
    maxFileSize: 100 * 1024 * 1024, // 100MB
    price: 5,
    refillMonthly: true,
    features: [
      '30 minutes per month',
      'Up to 3 minute videos',
      'All caption styles',
      'HD quality (1080p)',
      'Priority support',
    ],
  },
  PRO: {
    planType: 'PRO',
    minutesPerMonth: 150,
    maxVideoLength: 300, // 5 minutes
    maxFileSize: 200 * 1024 * 1024, // 200MB
    price: 15,
    refillMonthly: true,
    features: [
      '150 minutes per month',
      'Up to 5 minute videos',
      'All caption styles',
      'HD quality (1080p)',
      'Custom fonts',
      'Batch processing',
      'Priority support',
    ],
  },
  UNLIMITED: {
    planType: 'UNLIMITED',
    minutesPerMonth: Infinity,
    maxVideoLength: 600, // 10 minutes
    maxFileSize: 500 * 1024 * 1024, // 500MB
    price: 30,
    refillMonthly: true,
    features: [
      'Unlimited minutes',
      'Up to 10 minute videos',
      'All caption styles',
      '4K quality support',
      'Custom fonts & animations',
      'Batch processing',
      'API access',
      'Priority support',
      'White-label option',
    ],
  },
} as const;

// Legacy support - will be deprecated
export const FREE_TIER = {
  MAX_FREE_VIDEOS: 2,
  MAX_VIDEO_DURATION: 60,
  MAX_FILE_SIZE: 50 * 1024 * 1024,
} as const;

export const PAID_TIER = {
  MAX_VIDEO_DURATION: 300,
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

// Pricing and credits
export const PRICING = {
  // One-time top-up pricing (per minute)
  TOPUP_PRICE_PER_MINUTE: 1, // $1 per minute
  
  // Referral bonuses
  FREE_REFERRAL_BONUS: 0.5, // 30 seconds
  PAID_REFERRAL_BONUS: 3, // 3 minutes
  MAX_FREE_REFERRALS: 10, // Maximum 10 free referrals (5 minutes total)
  
  // Video duration rounding (±5 seconds)
  DURATION_ROUNDING_THRESHOLD: 5,
  
  // Minimum chargeable duration (rounded)
  MIN_CHARGEABLE_DURATION: 0, // Videos under ~22s are free (rounds to 0)
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
  VIDEO_TOO_LONG: 'Video is too long for your plan. Maximum duration is {maxDuration} seconds.',
  VIDEO_TOO_LARGE: 'Video file is too large. Maximum size is {maxSize}MB.',
  UNSUPPORTED_FORMAT: 'Unsupported video format. Supported formats: {formats}.',
  INSUFFICIENT_MINUTES: 'You need {required} more minutes. Current balance: {balance} minutes.',
  FREE_LIMIT_REACHED: 'You have used all your free minutes this month. Upgrade or top up to continue.',
  PROCESSING_FAILED: 'Failed to process your video. Please try again.',
  TRANSCRIPTION_FAILED: 'Could not transcribe audio. Please ensure the video has clear speech.',
  NO_SPEECH_DETECTED: 'No speech detected in the video.',
  SESSION_EXPIRED: 'Your session has expired. Please send a new video to start over.',
  INVALID_STYLE: 'Invalid caption style selected.',
  RENDER_FAILED: 'Failed to render the final video. Please try again.',
  MAX_FREE_REFERRALS_REACHED: 'You have reached the maximum of 10 free referrals.',
  INVALID_REFERRAL_CODE: 'Invalid referral code.',
} as const;

// Success messages
export const SUCCESS_MESSAGES = {
  VIDEO_RECEIVED: '📹 Video received! Processing your video...',
  PROCESSING_STARTED: '⏳ Processing started. This may take a moment...',
  CHUNKS_READY: '✅ Video processed! Ready for review.',
  CHUNK_APPROVED: '✅ Chunk approved!',
  ALL_APPROVED: '🎉 All chunks approved! Rendering final video...',
  RENDER_COMPLETE: '🎬 Your captioned video is ready!',
  SUBSCRIPTION_ACTIVE: '✅ Subscription activated! Enjoy your minutes.',
  TOPUP_SUCCESS: '✅ Top-up successful! {minutes} minutes added to your balance.',
  REFERRAL_REWARD: '🎁 Referral bonus! {minutes} minutes added to your account.',
} as const;

// Helper functions - Minutes-based system
export const roundDuration = (durationSeconds: number): number => {
  // Round to nearest ±5 seconds, then convert to minutes
  const roundedSeconds = Math.round(durationSeconds / 5) * 5;
  const minutes = roundedSeconds / 60;
  
  // Round to nearest 0.5 minutes
  return Math.round(minutes * 2) / 2;
};

export const calculateMinutesRequired = (durationSeconds: number): number => {
  return roundDuration(durationSeconds);
};

export const calculateTopupCost = (minutes: number): number => {
  return Math.ceil(minutes) * PRICING.TOPUP_PRICE_PER_MINUTE;
};

export const hasEnoughMinutes = (balance: number, required: number): boolean => {
  return balance >= required;
};

export const getPlanByType = (planType: keyof typeof SUBSCRIPTION_TIERS) => {
  return SUBSCRIPTION_TIERS[planType];
};

// Legacy functions - will be deprecated
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
