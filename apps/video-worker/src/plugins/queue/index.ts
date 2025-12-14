import { getEnv } from '@/config';
import { logger } from '@/plugins/logger';
import { JobPayload, JobResult, JobType, QUEUE_CHANNELS } from '@caption/shared';
import { createClient } from 'redis';

type RedisClient = ReturnType<typeof createClient>;
type JobHandler = (payload: JobPayload) => Promise<JobResult>;

let subscriberClient: RedisClient | null = null;
let publisherClient: RedisClient | null = null;
const jobHandlers: Map<JobType, JobHandler> = new Map();

export class JobQueueWorker {
  private isRunning = false;

  async initialize(): Promise<void> {
    const env = getEnv();

    const clientOptions = {
      url: env.REDIS_URL,
      socket: {
        reconnectStrategy: (retries: number) => {
          if (retries > 20) {
            logger.error('Redis max reconnection attempts reached');
            return new Error('Max reconnection attempts reached');
          }
          const delay = Math.min(retries * 100, 3000);
          logger.warn(`Redis reconnecting in ${delay}ms (attempt ${retries})`);
          return delay;
        },
      },
    };

    // Create subscriber client for receiving jobs
    subscriberClient = createClient(clientOptions);
    
    subscriberClient.on('error', (err) => {
      logger.error('Redis Subscriber Error', { error: err.message });
    });

    subscriberClient.on('connect', () => {
      logger.info('Redis subscriber connected');
    });

    subscriberClient.on('reconnecting', () => {
      logger.warn('Redis subscriber reconnecting');
    });

    subscriberClient.on('ready', () => {
      logger.info('Redis subscriber ready');
    });

    await subscriberClient.connect();

    // Create publisher client for sending results
    publisherClient = createClient(clientOptions);
    
    publisherClient.on('error', (err) => {
      logger.error('Redis Publisher Error', { error: err.message });
    });

    publisherClient.on('connect', () => {
      logger.info('Redis publisher connected');
    });

    publisherClient.on('reconnecting', () => {
      logger.warn('Redis publisher reconnecting');
    });

    publisherClient.on('ready', () => {
      logger.info('Redis publisher ready');
    });

    await publisherClient.connect();

    logger.info('Job queue worker initialized');
  }

  registerHandler(jobType: JobType, handler: JobHandler): void {
    jobHandlers.set(jobType, handler);
    logger.info(`Registered handler for job type: ${jobType}`);
  }

  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Job queue worker is already running');
      return;
    }

    if (!subscriberClient || !subscriberClient.isOpen) {
      throw new Error('Job queue not initialized. Call initialize() first.');
    }

    this.isRunning = true;

    // Subscribe to the jobs channel
    await subscriberClient.subscribe(QUEUE_CHANNELS.VIDEO_JOBS, async (message) => {
      try {
        const payload: JobPayload = JSON.parse(message);
        logger.info(`Received job: ${payload.jobType}`, { jobId: payload.jobId });

        await this.processJob(payload);
      } catch (error) {
        logger.error('Failed to process job message', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    logger.info('Job queue worker started, listening for jobs...');
  }

  private async processJob(payload: JobPayload): Promise<void> {
    const handler = jobHandlers.get(payload.jobType);

    if (!handler) {
      logger.warn(`No handler registered for job type: ${payload.jobType}`);
      // For unhandled jobs, we log but don't publish (no valid result type)
      return;
    }

    try {
      const result = await handler(payload);
      await this.publishResult(result);
      logger.info(`Job completed: ${payload.jobType}`, { jobId: payload.jobId, status: result.status });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Job failed: ${payload.jobType}`, { jobId: payload.jobId, error: errorMessage });
      // Error results are handled by the individual handlers
    }
  }

  private async publishResult(result: JobResult): Promise<void> {
    if (!publisherClient || !publisherClient.isOpen) {
      logger.error('Publisher client not available');
      return;
    }

    await publisherClient.publish(QUEUE_CHANNELS.VIDEO_RESULTS, JSON.stringify(result));
  }

  async stop(): Promise<void> {
    this.isRunning = false;

    if (subscriberClient && subscriberClient.isOpen) {
      await subscriberClient.unsubscribe(QUEUE_CHANNELS.VIDEO_JOBS);
      await subscriberClient.quit();
      subscriberClient = null;
    }

    if (publisherClient && publisherClient.isOpen) {
      await publisherClient.quit();
      publisherClient = null;
    }

    logger.info('Job queue worker stopped');
  }
}

// Singleton instance
let workerInstance: JobQueueWorker | null = null;

export function getJobQueueWorker(): JobQueueWorker {
  if (!workerInstance) {
    workerInstance = new JobQueueWorker();
  }
  return workerInstance;
}

export default JobQueueWorker;
