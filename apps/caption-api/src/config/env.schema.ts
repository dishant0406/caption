import { z } from 'zod';

// Custom boolean transform that properly handles string boolean values
const booleanString = z
  .string()
  .transform((val) => {
    const lower = val.toLowerCase();
    if (lower === 'true' || lower === '1') return true;
    if (lower === 'false' || lower === '0') return false;
    throw new Error(
      `Invalid boolean value: ${val}. Expected: true, false, 1, or 0`
    );
  })
  .or(z.boolean())
  .default(false);

// Environment schema - Single source of truth
export const envSchema = z.object({
  // Server Configuration
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),

  // Database Configuration
  DATABASE_URL: z.string().url('Invalid DATABASE_URL format'),
  DATABASE_HOST: z.string().optional(),
  DATABASE_PORT: z.coerce.number().min(1).max(65535).optional(),
  DATABASE_NAME: z.string().optional(),
  DATABASE_USER: z.string().optional(),
  DATABASE_PASSWORD: z.string().optional(),
  DATABASE_SSL: booleanString,
  DATABASE_POOL_MIN: z.coerce.number().min(0).default(2),
  DATABASE_POOL_MAX: z.coerce.number().min(1).default(10),

  // Redis Configuration
  REDIS_URL: z.string().url('Invalid REDIS_URL format').optional(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().min(1).max(65535).default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().min(0).max(15).default(0),
  REDIS_CLUSTER_MODE: booleanString,
  REDIS_CLUSTER_NODES: z.string().optional(),

  // Azure Storage Configuration
  AZURE_STORAGE_CONNECTION_STRING: z.string().optional(),
  AZURE_STORAGE_ACCOUNT: z.string().optional(),
  AZURE_STORAGE_KEY: z.string().optional(),
  AZURE_STORAGE_CONTAINER: z.string().default('caption-videos'),

  // WhatsApp Configuration
  WHATSAPP_PROVIDER: z.enum(['evolution', 'wasender']).default('evolution'),
  WHATSAPP_SENDER_PROVIDER: z.enum(['evolution', 'wasender']).default('evolution'),
  WHATSAPP_SERVER_URL: z
    .string()
    .url('Invalid WHATSAPP_SERVER_URL format')
    .optional(),
  WHATSAPP_SOCKET_URL: z
    .string()
    .url('Invalid WHATSAPP_SOCKET_URL format')
    .optional(),
  WHATSAPP_API_KEY: z.string().optional(),
  WHATSAPP_INSTANCE: z.string().optional(),
  
  // WaSender API Configuration (alternative to Evolution API)
  WASENDER_SERVER_URL: z
    .string()
    .url('Invalid WASENDER_SERVER_URL format')
    .optional(),
  WASENDER_SOCKET_URL: z
    .string()
    .url('Invalid WASENDER_SOCKET_URL format')
    .optional(),
  WASENDER_API_KEY: z.string().optional(),
  WASENDER_SESSION_ID: z.string().optional(),

  // Bot phone number (E.164 format without +, e.g., 919876543210)
  // Used to filter out webhook events from the bot's own number
  BOT_PHONE_NUMBER: z.string().optional(),

  // AI/LLM Configuration
  LLM_PROVIDER: z.enum(['azure', 'openai']).default('openai'),
  
  // OpenAI Configuration
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o'),
  
  // Azure OpenAI Configuration
  AZURE_OPENAI_API_KEY: z.string().optional(),
  AZURE_OPENAI_ENDPOINT: z.string().url().optional(),
  AZURE_OPENAI_DEPLOYMENT: z.string().optional(),
  AZURE_OPENAI_API_VERSION: z.string().default('2024-08-01-preview'),
  AZURE_OPENAI_EMBEDDING_DEPLOYMENT: z.string().optional(),

  // Logging Configuration
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FORMAT: z.enum(['json', 'simple']).default('json'),
  LOG_FILE_ENABLED: booleanString,
  LOG_FILE_PATH: z.string().default('./logs/app.log'),

  // Security Configuration
  CORS_ORIGIN: z.string().default('*'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),

  // Application Configuration
  API_PREFIX: z.string().default('/api/v1'),
  REQUEST_TIMEOUT: z.coerce.number().default(30000), // 30 seconds

  // Caption Session Configuration
  SESSION_INACTIVITY_TIMEOUT: z.coerce.number().min(60000).default(1800000), // 30 minutes in milliseconds
  CHUNK_REVIEW_TIMEOUT: z.coerce.number().min(60000).default(600000), // 10 minutes

  // Video Processing Configuration
  CHUNK_DURATION_SECONDS: z.coerce.number().min(10).max(60).default(20),
  MAX_VIDEO_DURATION_FREE: z.coerce.number().default(60), // 1 minute
  MAX_VIDEO_DURATION_PAID: z.coerce.number().default(300), // 5 minutes
  MAX_FILE_SIZE_FREE: z.coerce.number().default(52428800), // 50MB
  MAX_FILE_SIZE_PAID: z.coerce.number().default(209715200), // 200MB

  // Input Guardrails Configuration
  GUARDRAILS_ENABLED: booleanString.default(true),
  GUARDRAILS_UNICODE_NORMALIZER_ENABLED: booleanString.default(true),
  GUARDRAILS_SPAM_DETECTOR_ENABLED: booleanString.default(true),
  GUARDRAILS_SPAM_MAX_PER_MINUTE: z.coerce.number().min(1).default(15),
  GUARDRAILS_SPAM_MAX_PER_HOUR: z.coerce.number().min(1).default(150),
  GUARDRAILS_PROMPT_INJECTION_ENABLED: booleanString.default(true),
  GUARDRAILS_PROMPT_INJECTION_THRESHOLD: z.coerce.number().min(0).max(1).default(0.7),
  GUARDRAILS_MODERATION_ENABLED: booleanString.default(true),
  GUARDRAILS_MODERATION_THRESHOLD: z.coerce.number().min(0).max(1).default(0.8),
});

// Export the schema type for TypeScript usage
export type EnvConfig = z.infer<typeof envSchema>;

// Schema metadata for generating .env.example
export const envSchemaMetadata: Record<
  keyof EnvConfig,
  { description: string; example: string }
> = {
  NODE_ENV: { description: 'Application environment', example: 'development' },
  PORT: { description: 'Server port', example: '3000' },
  HOST: { description: 'Server host', example: '0.0.0.0' },

  DATABASE_URL: {
    description: 'PostgreSQL connection URL',
    example: 'postgresql://user:password@localhost:5432/caption_bot',
  },
  DATABASE_HOST: {
    description: 'Database host (if not using URL)',
    example: 'localhost',
  },
  DATABASE_PORT: {
    description: 'Database port (if not using URL)',
    example: '5432',
  },
  DATABASE_NAME: {
    description: 'Database name (if not using URL)',
    example: 'caption_bot',
  },
  DATABASE_USER: {
    description: 'Database user (if not using URL)',
    example: 'postgres',
  },
  DATABASE_PASSWORD: {
    description: 'Database password (if not using URL)',
    example: 'password',
  },
  DATABASE_SSL: {
    description: 'Enable SSL for database connection',
    example: 'false',
  },
  DATABASE_POOL_MIN: {
    description: 'Minimum database connections in pool',
    example: '2',
  },
  DATABASE_POOL_MAX: {
    description: 'Maximum database connections in pool',
    example: '10',
  },

  REDIS_URL: {
    description: 'Redis connection URL (optional)',
    example: 'redis://localhost:6379',
  },
  REDIS_HOST: { description: 'Redis host', example: 'localhost' },
  REDIS_PORT: { description: 'Redis port', example: '6379' },
  REDIS_PASSWORD: {
    description: 'Redis password (optional)',
    example: 'redis_password',
  },
  REDIS_DB: { description: 'Redis database number', example: '0' },
  REDIS_CLUSTER_MODE: {
    description: 'Enable Redis cluster mode',
    example: 'false',
  },
  REDIS_CLUSTER_NODES: {
    description: 'Redis cluster nodes (comma separated)',
    example: 'localhost:7000,localhost:7001',
  },

  AZURE_STORAGE_CONNECTION_STRING: {
    description: 'Azure Storage connection string',
    example: 'DefaultEndpointsProtocol=https;AccountName=...',
  },
  AZURE_STORAGE_ACCOUNT: {
    description: 'Azure Storage account name',
    example: 'captionbotstorage',
  },
  AZURE_STORAGE_KEY: {
    description: 'Azure Storage access key',
    example: 'your_azure_storage_key',
  },
  AZURE_STORAGE_CONTAINER: {
    description: 'Azure Storage container name',
    example: 'caption-videos',
  },

  WHATSAPP_PROVIDER: {
    description: 'WhatsApp provider for receiving webhooks (evolution or wasender)',
    example: 'wasender',
  },
  WHATSAPP_SENDER_PROVIDER: {
    description: 'WhatsApp provider for sending messages (evolution or wasender)',
    example: 'evolution',
  },
  WHATSAPP_SERVER_URL: {
    description: 'WhatsApp API server URL (Evolution API)',
    example: 'https://your-evolution-api.com',
  },
  WHATSAPP_SOCKET_URL: {
    description: 'WhatsApp Socket.IO server URL for real-time webhooks',
    example: 'https://your-whatsapp-socket.com',
  },
  WHATSAPP_API_KEY: {
    description: 'WhatsApp API key (Evolution API)',
    example: 'your_api_key',
  },
  WHATSAPP_INSTANCE: {
    description: 'WhatsApp instance name (Evolution API)',
    example: 'caption-bot',
  },
  WASENDER_SERVER_URL: {
    description: 'WaSender API server URL',
    example: 'https://www.wasenderapi.com',
  },
  WASENDER_SOCKET_URL: {
    description: 'WaSender Socket.IO server URL for real-time webhooks',
    example: 'https://www.wasenderapi.com',
  },
  WASENDER_API_KEY: {
    description: 'WaSender API key',
    example: 'your_wasender_api_key',
  },
  WASENDER_SESSION_ID: {
    description: 'WaSender session ID',
    example: 'your_session_id',
  },
  BOT_PHONE_NUMBER: {
    description: 'Bot phone number (E.164 format without +) to filter out self-messages',
    example: '919876543210',
  },

  // AI/LLM Configuration
  LLM_PROVIDER: {
    description: 'LLM provider to use (azure or openai)',
    example: 'openai',
  },
  OPENAI_API_KEY: {
    description: 'OpenAI API key',
    example: 'sk-...',
  },
  OPENAI_MODEL: {
    description: 'OpenAI model to use',
    example: 'gpt-4o',
  },
  AZURE_OPENAI_API_KEY: {
    description: 'Azure OpenAI API key',
    example: 'your_azure_openai_key',
  },
  AZURE_OPENAI_ENDPOINT: {
    description: 'Azure OpenAI endpoint URL',
    example: 'https://your-resource.openai.azure.com',
  },
  AZURE_OPENAI_DEPLOYMENT: {
    description: 'Azure OpenAI deployment name',
    example: 'gpt-4o',
  },
  AZURE_OPENAI_API_VERSION: {
    description: 'Azure OpenAI API version',
    example: '2024-08-01-preview',
  },
  AZURE_OPENAI_EMBEDDING_DEPLOYMENT: {
    description: 'Azure OpenAI embedding deployment name',
    example: 'text-embedding-ada-002',
  },

  LOG_LEVEL: { description: 'Logging level', example: 'info' },
  LOG_FORMAT: { description: 'Log output format', example: 'json' },
  LOG_FILE_ENABLED: { description: 'Enable file logging', example: 'false' },
  LOG_FILE_PATH: { description: 'Log file path', example: './logs/app.log' },

  CORS_ORIGIN: { description: 'CORS allowed origins', example: '*' },
  RATE_LIMIT_WINDOW_MS: {
    description: 'Rate limit window in milliseconds',
    example: '900000',
  },
  RATE_LIMIT_MAX_REQUESTS: {
    description: 'Maximum requests per window',
    example: '100',
  },

  API_PREFIX: { description: 'API route prefix', example: '/api/v1' },
  REQUEST_TIMEOUT: {
    description: 'Request timeout in milliseconds',
    example: '30000',
  },

  SESSION_INACTIVITY_TIMEOUT: {
    description: 'Session inactivity timeout in milliseconds',
    example: '1800000',
  },
  CHUNK_REVIEW_TIMEOUT: {
    description: 'Chunk review timeout in milliseconds',
    example: '600000',
  },

  CHUNK_DURATION_SECONDS: {
    description: 'Video chunk duration in seconds',
    example: '20',
  },
  MAX_VIDEO_DURATION_FREE: {
    description: 'Max video duration for free tier (seconds)',
    example: '60',
  },
  MAX_VIDEO_DURATION_PAID: {
    description: 'Max video duration for paid tier (seconds)',
    example: '300',
  },
  MAX_FILE_SIZE_FREE: {
    description: 'Max file size for free tier (bytes)',
    example: '52428800',
  },
  MAX_FILE_SIZE_PAID: {
    description: 'Max file size for paid tier (bytes)',
    example: '209715200',
  },

  // Input Guardrails Configuration
  GUARDRAILS_ENABLED: {
    description: 'Enable all input guardrails',
    example: 'true',
  },
  GUARDRAILS_UNICODE_NORMALIZER_ENABLED: {
    description: 'Enable Unicode normalization processor',
    example: 'true',
  },
  GUARDRAILS_SPAM_DETECTOR_ENABLED: {
    description: 'Enable spam detection processor',
    example: 'true',
  },
  GUARDRAILS_SPAM_MAX_PER_MINUTE: {
    description: 'Maximum messages per minute before flagging as spam',
    example: '15',
  },
  GUARDRAILS_SPAM_MAX_PER_HOUR: {
    description: 'Maximum messages per hour before flagging as spam',
    example: '150',
  },
  GUARDRAILS_PROMPT_INJECTION_ENABLED: {
    description: 'Enable prompt injection detection',
    example: 'true',
  },
  GUARDRAILS_PROMPT_INJECTION_THRESHOLD: {
    description: 'Threshold for prompt injection detection (0-1)',
    example: '0.7',
  },
  GUARDRAILS_MODERATION_ENABLED: {
    description: 'Enable content moderation',
    example: 'true',
  },
  GUARDRAILS_MODERATION_THRESHOLD: {
    description: 'Threshold for content moderation (0-1)',
    example: '0.8',
  },
};
