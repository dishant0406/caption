import { getRedisConfig } from '@/config';
import { logger } from '@/plugins/logger';
import {
  QUEUE_CHANNELS,
  type JobPayload,
  type JobPriority,
  type JobResult,
  type JobType,
} from '@caption/shared';
import { createClient } from 'redis';
import { v4 as uuidv4 } from 'uuid';

// Queue client type - using ReturnType to match what createClient returns
type QueueClient = ReturnType<typeof createClient>;

// Queue configuration
export interface QueueConfig {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  db?: number;
}

// Job creation options
export interface CreateJobOptions {
  priority?: JobPriority;
  maxAttempts?: number;
}

/**
 * Job Queue Manager
 * Handles publishing jobs to Redis pub/sub and listening for results
 */
export class JobQueueManager {
  private publisher: QueueClient | null = null;
  private subscriber: QueueClient | null = null;
  private isConnected = false;
  private resultHandlers: Map<
    string,
    (result: JobResult) => void
  > = new Map();

  constructor(private config: QueueConfig) {}

  /**
   * Connect to Redis for pub/sub
   */
  async connect(): Promise<void> {
    if (this.isConnected) return;

    try {
      const clientOptions = this.getClientOptions();

      // Create publisher client
      this.publisher = createClient(clientOptions);
      await this.publisher.connect();

      // Create subscriber client (separate connection required)
      this.subscriber = createClient(clientOptions);
      await this.subscriber.connect();

      // Subscribe to results channel
      await this.subscriber.subscribe(
        QUEUE_CHANNELS.VIDEO_RESULTS,
        (message) => {
          this.handleResultMessage(message);
        }
      );

      this.isConnected = true;
      logger.info('Job queue connected successfully');
    } catch (error) {
      logger.error(
        'Failed to connect job queue',
        error instanceof Error ? error : new Error(String(error))
      );
      throw error;
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected) return;

    try {
      if (this.subscriber) {
        await this.subscriber.unsubscribe(QUEUE_CHANNELS.VIDEO_RESULTS);
        await this.subscriber.quit();
      }
      if (this.publisher) {
        await this.publisher.quit();
      }
      this.isConnected = false;
      logger.info('Job queue disconnected');
    } catch (error) {
      logger.error(
        'Error disconnecting job queue',
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Publish a job to the queue
   */
  async publishJob<T extends JobPayload>(job: T): Promise<string> {
    if (!this.publisher || !this.isConnected) {
      throw new Error('Job queue not connected');
    }

    try {
      const message = JSON.stringify(job);
      await this.publisher.publish(QUEUE_CHANNELS.VIDEO_JOBS, message);

      logger.info('Job published', {
        jobId: job.jobId,
        jobType: job.jobType,
        sessionId: job.sessionId,
      });

      return job.jobId;
    } catch (error) {
      logger.error(
        'Failed to publish job',
        error instanceof Error ? error : new Error(String(error)),
        { jobId: job.jobId, jobType: job.jobType }
      );
      throw error;
    }
  }

  /**
   * Create and publish a new job
   */
  async createJob<T extends JobPayload>(
    jobType: JobType,
    sessionId: string,
    userPhone: string,
    data: T['data'],
    options: CreateJobOptions = {}
  ): Promise<string> {
    const jobId = uuidv4();
    const job = {
      jobId,
      jobType,
      sessionId,
      userPhone,
      priority: options.priority || 'NORMAL',
      attempts: 0,
      maxAttempts: options.maxAttempts || 3,
      createdAt: new Date().toISOString(),
      data,
    } as T;

    return this.publishJob(job);
  }

  /**
   * Wait for a job result with timeout
   */
  waitForResult(
    jobId: string,
    timeoutMs: number = 60000
  ): Promise<JobResult> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.resultHandlers.delete(jobId);
        reject(new Error(`Job ${jobId} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.resultHandlers.set(jobId, (result) => {
        clearTimeout(timeoutId);
        this.resultHandlers.delete(jobId);
        resolve(result);
      });
    });
  }

  /**
   * Handle incoming result messages
   */
  private handleResultMessage(message: string): void {
    try {
      const result = JSON.parse(message) as JobResult;

      logger.debug('Received job result', {
        jobId: result.jobId,
        jobType: result.jobType,
        status: result.status,
      });

      // Check if there's a handler waiting for this result
      const handler = this.resultHandlers.get(result.jobId);
      if (handler) {
        handler(result);
      }

      // Emit event for other listeners (can be extended)
      this.onJobResult(result);
    } catch (error) {
      logger.error(
        'Failed to parse job result',
        error instanceof Error ? error : new Error(String(error)),
        { message }
      );
    }
  }

  /**
   * Override this method to handle job results
   */
  protected onJobResult(result: JobResult): void {
    // Default implementation - can be overridden or extended
    logger.debug('Job result received', {
      jobId: result.jobId,
      status: result.status,
    });
  }

  /**
   * Get client options from config
   */
  private getClientOptions(): Parameters<typeof createClient>[0] {
    if (this.config.url) {
      return { url: this.config.url };
    }

    const options: Parameters<typeof createClient>[0] = {
      socket: {
        host: this.config.host || 'localhost',
        port: this.config.port || 6379,
      },
    };

    if (this.config.db !== undefined) {
      options.database = this.config.db;
    }

    if (this.config.password) {
      options.password = this.config.password;
    }

    return options;
  }

  /**
   * Check if connected
   */
  isQueueConnected(): boolean {
    return this.isConnected;
  }
}

// Singleton queue instance
let queueInstance: JobQueueManager | null = null;

/**
 * Initialize the job queue
 */
export const initializeQueue = async (): Promise<void> => {
  const redisConfig = getRedisConfig();

  let config: QueueConfig;

  if ('url' in redisConfig) {
    config = { url: redisConfig.url };
  } else if ('cluster' in redisConfig) {
    // For cluster, use first node (pub/sub doesn't work well with cluster)
    const firstNode = redisConfig.nodes[0];
    config = {
      host: firstNode?.host || 'localhost',
      port: firstNode?.port || 6379,
    };
    if (redisConfig.password) {
      config.password = redisConfig.password;
    }
  } else {
    const { host, port, db, password } = redisConfig;
    config = { host, port, db };
    if (password) {
      config.password = password;
    }
  }

  queueInstance = new JobQueueManager(config);
  await queueInstance.connect();
};

/**
 * Get the queue instance
 */
export const getQueue = (): JobQueueManager => {
  if (!queueInstance) {
    throw new Error('Queue not initialized. Call initializeQueue() first.');
  }
  return queueInstance;
};

/**
 * Export queue singleton proxy
 */
export const jobQueue = {
  publishJob: async <T extends JobPayload>(job: T): Promise<string> =>
    getQueue().publishJob(job),

  createJob: async <T extends JobPayload>(
    jobType: JobType,
    sessionId: string,
    userPhone: string,
    data: T['data'],
    options?: CreateJobOptions
  ): Promise<string> =>
    getQueue().createJob(jobType, sessionId, userPhone, data, options),

  waitForResult: (jobId: string, timeoutMs?: number): Promise<JobResult> =>
    getQueue().waitForResult(jobId, timeoutMs),

  isConnected: (): boolean => queueInstance?.isQueueConnected() ?? false,

  disconnect: async (): Promise<void> => queueInstance?.disconnect(),
};
