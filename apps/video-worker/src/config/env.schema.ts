import { z } from 'zod';

export const envSchema = z.object({
  // Node Environment
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // Redis Configuration
  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  // Azure Blob Storage
  AZURE_STORAGE_CONNECTION_STRING: z.string().min(1),
  AZURE_STORAGE_CONTAINER_NAME: z.string().default('caption-videos'),

  // Transcription Provider Configuration
  // Options: 'azure-openai' (Whisper - segment-level), 'fal-whisper' (Fal.ai - word-level)
  // Use 'azure-openai' for segment-level timestamps, 'fal-whisper' for word-level timestamps
  TRANSCRIPTION_PROVIDER: z.enum(['azure-openai', 'fal-whisper']).default('azure-openai'),
  
  // Word-level transcription provider (for word-by-word captions)
  // Fal.ai Whisper provides more accurate word-level timestamps
  WORD_TRANSCRIPTION_PROVIDER: z.enum(['azure-openai', 'fal-whisper']).default('fal-whisper'),

  // Azure OpenAI Configuration (for Whisper - segment-level transcription)
  AZURE_OPENAI_ENDPOINT: z.string().url().optional(),
  AZURE_OPENAI_API_KEY: z.string().optional(),
  AZURE_OPENAI_WHISPER_DEPLOYMENT: z.string().default('whisper'),
  AZURE_OPENAI_API_VERSION: z.string().default('2024-02-01'),

  // Fal.ai Configuration (for word-level transcription)
  // Get your API key from https://fal.ai/dashboard/keys
  FAL_KEY: z.string().optional(),
  // Fal.ai poll interval in milliseconds (default 3000 = 3 seconds)
  FAL_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(3000),

  // OpenAI Configuration (fallback/alternative)
  OPENAI_API_KEY: z.string().optional(),

  // FFmpeg Configuration
  FFMPEG_PATH: z.string().optional(),
  FFPROBE_PATH: z.string().optional(),

  // Worker Configuration
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(2),
  MAX_RETRY_ATTEMPTS: z.coerce.number().int().positive().default(3),

  // Temp Directory for video processing
  TEMP_DIR: z.string().default('/tmp/caption-worker'),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function validateEnv(): EnvConfig {
  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    console.error(result.error.format());
    process.exit(1);
  }

  return result.data;
}
