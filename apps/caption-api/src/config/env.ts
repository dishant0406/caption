import { config } from 'dotenv';
import { ZodError } from 'zod';
import { envSchema, type EnvConfig } from './env.schema';

// Load environment variables
config();

// Validate and parse environment variables
const parseEnv = (): EnvConfig => {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('❌ Environment validation failed:');
    if (error instanceof ZodError) {
      error.issues.forEach((issue) => {
        // eslint-disable-next-line no-console
        console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
      });
    }
    process.exit(1);
  }
};

// Export validated environment config
export const env = parseEnv();

// Type-safe environment variables - available globally
declare global {
  namespace NodeJS {
    interface ProcessEnv extends EnvConfig {}
  }
}

// Helper functions for specific configurations
export const isDevelopment = (): boolean => env.NODE_ENV === 'development';
export const isProduction = (): boolean => env.NODE_ENV === 'production';
export const isTest = (): boolean => env.NODE_ENV === 'test';

// Database configuration helper
export const getDatabaseConfig = ():
  | { url: string }
  | {
      host: string | undefined;
      port: number | undefined;
      database: string | undefined;
      username: string | undefined;
      password: string | undefined;
      ssl: boolean;
    } => {
  if (env.DATABASE_URL) {
    return { url: env.DATABASE_URL };
  }

  return {
    host: env.DATABASE_HOST,
    port: env.DATABASE_PORT,
    database: env.DATABASE_NAME,
    username: env.DATABASE_USER,
    password: env.DATABASE_PASSWORD,
    ssl: env.DATABASE_SSL,
  };
};

// Redis configuration helper
export const getRedisConfig = ():
  | {
      cluster: true;
      nodes: Array<{ host: string; port: number }>;
      password: string | undefined;
    }
  | { url: string }
  | {
      host: string;
      port: number;
      password: string | undefined;
      db: number;
    } => {
  if (env.REDIS_CLUSTER_MODE && env.REDIS_CLUSTER_NODES) {
    return {
      cluster: true,
      nodes: env.REDIS_CLUSTER_NODES.split(',').map((node) => {
        const [host, port] = node.trim().split(':');
        return {
          host: host || 'localhost',
          port: parseInt(port || '6379', 10),
        };
      }),
      password: env.REDIS_PASSWORD,
    };
  }

  if (env.REDIS_URL) {
    return { url: env.REDIS_URL };
  }

  return {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD,
    db: env.REDIS_DB,
  };
};

// Azure Storage configuration helper
export const getAzureStorageConfig = (): {
  connectionString: string | undefined;
  account: string | undefined;
  key: string | undefined;
  container: string;
} => ({
  connectionString: env.AZURE_STORAGE_CONNECTION_STRING,
  account: env.AZURE_STORAGE_ACCOUNT,
  key: env.AZURE_STORAGE_KEY,
  container: env.AZURE_STORAGE_CONTAINER,
});

// WhatsApp configuration helper
export const getWhatsAppConfig = (): {
  serverUrl: string | undefined;
  apiKey: string | undefined;
  instance: string | undefined;
  socketServerUrl: string | undefined;
} => ({
  serverUrl: env.WHATSAPP_SERVER_URL,
  apiKey: env.WHATSAPP_API_KEY,
  instance: env.WHATSAPP_INSTANCE,
  socketServerUrl: env.WHATSAPP_SOCKET_URL,
});

// Video processing configuration helper
export const getVideoProcessingConfig = (): {
  chunkDurationSeconds: number;
  maxDurationFree: number;
  maxDurationPaid: number;
  maxFileSizeFree: number;
  maxFileSizePaid: number;
} => ({
  chunkDurationSeconds: env.CHUNK_DURATION_SECONDS,
  maxDurationFree: env.MAX_VIDEO_DURATION_FREE,
  maxDurationPaid: env.MAX_VIDEO_DURATION_PAID,
  maxFileSizeFree: env.MAX_FILE_SIZE_FREE,
  maxFileSizePaid: env.MAX_FILE_SIZE_PAID,
});
