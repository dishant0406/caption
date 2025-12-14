import { getEnv } from '@/config';
import { logger } from '@/plugins/logger';
import { createClient, RedisClientType } from 'redis';

let redisClient: RedisClientType | null = null;

export async function initializeCache(): Promise<RedisClientType> {
  if (redisClient && redisClient.isOpen) {
    return redisClient;
  }

  const env = getEnv();

  redisClient = createClient({
    url: env.REDIS_URL,
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 20) {
          logger.error('Redis max reconnection attempts reached');
          return new Error('Max reconnection attempts reached');
        }
        const delay = Math.min(retries * 100, 3000);
        logger.warn(`Redis reconnecting in ${delay}ms (attempt ${retries})`);
        return delay;
      },
    },
  });

  redisClient.on('error', (err) => {
    logger.error('Redis Client Error', { error: err.message });
  });

  redisClient.on('connect', () => {
    logger.info('Redis client connected');
  });

  redisClient.on('reconnecting', () => {
    logger.warn('Redis client reconnecting');
  });

  redisClient.on('ready', () => {
    logger.info('Redis client ready');
  });

  await redisClient.connect();

  return redisClient;
}

export function getRedisClient(): RedisClientType {
  if (!redisClient || !redisClient.isOpen) {
    throw new Error('Redis client not initialized. Call initializeCache() first.');
  }
  return redisClient;
}

export async function closeCache(): Promise<void> {
  if (redisClient && redisClient.isOpen) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis client disconnected');
  }
}

// Cache utility functions
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const client = getRedisClient();
    const value = await client.get(key);
    return value ? JSON.parse(value) : null;
  },

  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const client = getRedisClient();
    const stringValue = JSON.stringify(value);
    if (ttlSeconds) {
      await client.setEx(key, ttlSeconds, stringValue);
    } else {
      await client.set(key, stringValue);
    }
  },

  async delete(key: string): Promise<void> {
    const client = getRedisClient();
    await client.del(key);
  },

  async exists(key: string): Promise<boolean> {
    const client = getRedisClient();
    const result = await client.exists(key);
    return result === 1;
  },
};

export default cache;
