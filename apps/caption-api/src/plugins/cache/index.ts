import { getRedisConfig } from '@/config';
import { logger } from '@/plugins/logger';
import {
  createClient,
  createCluster,
  RedisClientType,
  RedisClusterType,
} from 'redis';

// Redis client type union
type RedisClient = RedisClientType | RedisClusterType;

// Cache configuration interface
export interface CacheConfig {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  url?: string;
  cluster?: boolean;
  nodes?: Array<{ host: string; port: number }>;
  keyPrefix?: string;
  defaultTTL?: number;
}

// Cache operation options
export interface CacheOptions {
  ttl?: number;
  nx?: boolean;
  xx?: boolean;
}

// Cache instance class
export class CacheInstance {
  private client: RedisClient;
  private config: CacheConfig & {
    host: string;
    port: number;
    db: number;
    cluster: boolean;
    keyPrefix: string;
    defaultTTL: number;
    nodes: Array<{ host: string; port: number }>;
  };
  private connected = false;

  constructor(config: CacheConfig) {
    this.config = {
      host: 'localhost',
      port: 6379,
      db: 0,
      cluster: false,
      defaultTTL: 3600,
      keyPrefix: 'caption:',
      nodes: [],
      ...config,
    };

    if (config.password) {
      this.config.password = config.password;
    }
    if (config.url) {
      this.config.url = config.url;
    }

    this.client = this.createClient();
  }

  private createClient(): RedisClient {
    if (this.config.cluster && this.config.nodes.length > 0) {
      const clusterOptions: Parameters<typeof createCluster>[0] = {
        rootNodes: this.config.nodes.map((node) => ({
          url: `redis://${node.host}:${node.port}`,
        })),
      };

      if (this.config.password) {
        clusterOptions.defaults = {
          password: this.config.password,
        };
      }

      return createCluster(clusterOptions) as unknown as RedisClient;
    }

    const options: Parameters<typeof createClient>[0] = {};

    if (this.config.url) {
      options.url = this.config.url;
    } else {
      options.socket = {
        host: this.config.host,
        port: this.config.port,
      };
      if (this.config.password) {
        options.password = this.config.password;
      }
      options.database = this.config.db;
    }

    return createClient(options) as RedisClientType;
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    try {
      await this.client.connect();
      this.connected = true;

      this.client.on('error', (error: Error) => {
        logger.error('Redis error', error);
        this.connected = false;
      });

      logger.info('Redis connected successfully');
    } catch (error) {
      throw new Error(
        `Failed to connect to Redis: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.client.quit();
      this.connected = false;
      logger.info('Redis disconnected');
    }
  }

  private getKey(key: string): string {
    return this.config.keyPrefix ? `${this.config.keyPrefix}${key}` : key;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(this.getKey(key));
      return value ? (JSON.parse(value) as T) : null;
    } catch (error) {
      throw new Error(
        `Cache get failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async set(
    key: string,
    value: unknown,
    options?: CacheOptions
  ): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      const cacheKey = this.getKey(key);
      const ttl = options?.ttl || this.config.defaultTTL;

      const setOptions: Parameters<(typeof this.client)['set']>[2] = {
        EX: ttl,
      };

      if (options?.nx) {
        setOptions.NX = true;
      } else if (options?.xx) {
        setOptions.XX = true;
      }

      await this.client.set(cacheKey, serialized, setOptions);
    } catch (error) {
      throw new Error(
        `Cache set failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async setNX(
    key: string,
    value: unknown,
    options?: CacheOptions
  ): Promise<boolean> {
    try {
      const serialized = JSON.stringify(value);
      const cacheKey = this.getKey(key);
      const ttl = options?.ttl || this.config.defaultTTL;

      const result = await this.client.set(cacheKey, serialized, {
        EX: ttl,
        NX: true,
      });

      return result === 'OK';
    } catch (error) {
      throw new Error(
        `Cache setNX failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const result = await this.client.del(this.getKey(key));
      return result > 0;
    } catch (error) {
      throw new Error(
        `Cache delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(this.getKey(key));
      return result > 0;
    } catch (error) {
      throw new Error(
        `Cache exists failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async expire(key: string, seconds: number): Promise<boolean> {
    try {
      const result = await this.client.expire(this.getKey(key), seconds);
      return result > 0;
    } catch (error) {
      throw new Error(
        `Cache expire failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(this.getKey(key));
    } catch (error) {
      throw new Error(
        `Cache TTL failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async increment(key: string, by = 1): Promise<number> {
    try {
      return await this.client.incrBy(this.getKey(key), by);
    } catch (error) {
      throw new Error(
        `Cache increment failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async invalidate(pattern: string): Promise<number> {
    try {
      const searchPattern = this.getKey(pattern);
      const keys = await this.client.keys(searchPattern);

      if (keys.length === 0) return 0;

      return await this.client.del(keys);
    } catch (error) {
      throw new Error(
        `Cache invalidation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  async clear(): Promise<void> {
    try {
      await this.client.flushDb();
    } catch (error) {
      throw new Error(
        `Cache clear failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  getClient(): RedisClient {
    return this.client;
  }
}

// Singleton cache instance
let cacheInstance: CacheInstance | null = null;

// Cache factory
export class CacheFactory {
  static create(config: CacheConfig): CacheInstance {
    return new CacheInstance(config);
  }

  static getSingleton(): CacheInstance {
    if (!cacheInstance) {
      throw new Error('Cache not initialized. Call initializeCache() first.');
    }
    return cacheInstance;
  }
}

// Initialize cache
export const initializeCache = async (): Promise<void> => {
  const redisConfig = getRedisConfig();

  let config: CacheConfig;

  if ('cluster' in redisConfig) {
    // Cluster mode
    config = {
      cluster: true,
      nodes: redisConfig.nodes,
    };
    if (redisConfig.password) {
      config.password = redisConfig.password;
    }
  } else if ('url' in redisConfig) {
    // URL mode
    config = { url: redisConfig.url };
  } else {
    // Standard mode - use explicit property access
    const { host, port, db, password } = redisConfig;
    config = { host, port, db };
    if (password) {
      config.password = password;
    }
  }

  cacheInstance = new CacheInstance(config);
  await cacheInstance.connect();
};

// Get cache instance
export const getCache = (): CacheInstance => {
  return CacheFactory.getSingleton();
};

// Export cache singleton proxy
export const cache = {
  get: async <T = unknown>(key: string): Promise<T | null> =>
    getCache().get<T>(key),
  set: async (
    key: string,
    value: unknown,
    options?: CacheOptions
  ): Promise<void> => getCache().set(key, value, options),
  delete: async (key: string): Promise<boolean> => getCache().delete(key),
  exists: async (key: string): Promise<boolean> => getCache().exists(key),
  expire: async (key: string, seconds: number): Promise<boolean> =>
    getCache().expire(key, seconds),
  ttl: async (key: string): Promise<number> => getCache().ttl(key),
  increment: async (key: string, by?: number): Promise<number> =>
    getCache().increment(key, by),
  invalidate: async (pattern: string): Promise<number> =>
    getCache().invalidate(pattern),
  clear: async (): Promise<void> => getCache().clear(),
  isConnected: (): boolean => cacheInstance?.isConnected() ?? false,
  disconnect: async (): Promise<void> => cacheInstance?.disconnect(),
};
