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
  // Options: 'azure-openai' (Whisper), 'azure-gpt4o' (GPT-4o), 'openai', 'deepgram', 'assemblyai'
  TRANSCRIPTION_PROVIDER: z.enum(['azure-openai', 'azure-gpt4o', 'openai', 'deepgram', 'assemblyai']).default('azure-openai'),

  // Azure OpenAI Configuration (for Whisper)
  AZURE_OPENAI_ENDPOINT: z.string().url().optional(),
  AZURE_OPENAI_API_KEY: z.string().optional(),
  AZURE_OPENAI_WHISPER_DEPLOYMENT: z.string().default('whisper'),
  AZURE_OPENAI_API_VERSION: z.string().default('2024-02-01'),

  // Azure GPT-4o Transcription Configuration
  // Uses Bearer token auth instead of api-key header
  AZURE_GPT4O_ENDPOINT: z.string().url().optional(),
  AZURE_GPT4O_API_KEY: z.string().optional(),
  AZURE_GPT4O_DEPLOYMENT: z.string().default('gpt-4o-transcribe-diarize'),
  AZURE_GPT4O_API_VERSION: z.string().default('2025-03-01-preview'),

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
