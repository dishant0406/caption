import { getEnv } from '@/config';
import { closeCache, initializeCache } from '@/plugins/cache';
import { logger } from '@/plugins/logger';
import { getJobQueueWorker } from '@/plugins/queue';
import {
  processChunkVideo,
  processGeneratePreview,
  processRenderFinal,
  processTranscribeChunk,
  processVideoUploaded
} from '@/processors';
import { initializeStorage } from '@/services/storage';
import { JobType } from '@caption/shared';
import 'dotenv/config';

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { reason, promise });
  process.exit(1);
});

// Graceful shutdown handler
let isShuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    logger.warn('Shutdown already in progress');
    return;
  }

  isShuttingDown = true;
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  try {
    // Stop accepting new jobs
    const worker = getJobQueueWorker();
    await worker.stop();
    logger.info('Job queue worker stopped');

    // Close Redis connection
    await closeCache();
    logger.info('Cache connection closed');

    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    process.exit(1);
  }
}

// Register shutdown signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Define job type string literals (since JobType is a union type, not an enum)
const JOB_TYPES: { [key: string]: JobType } = {
  VIDEO_UPLOADED: 'VIDEO_UPLOADED',
  CHUNK_VIDEO: 'CHUNK_VIDEO',
  TRANSCRIBE_CHUNK: 'TRANSCRIBE_CHUNK',
  GENERATE_PREVIEW: 'GENERATE_PREVIEW',
  RENDER_FINAL: 'RENDER_FINAL',
} as const;

async function main(): Promise<void> {
  try {
    // Validate environment
    const env = getEnv();
    logger.info('Video Worker starting...', {
      nodeEnv: env.NODE_ENV,
      concurrency: env.WORKER_CONCURRENCY,
    });

    // Initialize Redis cache
    logger.info('Initializing Redis cache...');
    await initializeCache();

    // Initialize Azure Blob Storage
    logger.info('Initializing Azure Blob Storage...');
    await initializeStorage();

    // Initialize job queue worker
    logger.info('Initializing job queue worker...');
    const worker = getJobQueueWorker();
    await worker.initialize();

    // Register job handlers using string literals
    worker.registerHandler('VIDEO_UPLOADED', processVideoUploaded as Parameters<typeof worker.registerHandler>[1]);
    worker.registerHandler('CHUNK_VIDEO', processChunkVideo as Parameters<typeof worker.registerHandler>[1]);
    worker.registerHandler('TRANSCRIBE_CHUNK', processTranscribeChunk as Parameters<typeof worker.registerHandler>[1]);
    worker.registerHandler('GENERATE_PREVIEW', processGeneratePreview as Parameters<typeof worker.registerHandler>[1]);
    worker.registerHandler('RENDER_FINAL', processRenderFinal as Parameters<typeof worker.registerHandler>[1]);

    // Start listening for jobs
    await worker.start();

    logger.info('🎬 Video Worker is ready and listening for jobs!');
    logger.info(`Registered handlers: ${Object.keys(JOB_TYPES).join(', ')}`);
  } catch (error) {
    logger.error('Failed to start Video Worker', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    process.exit(1);
  }
}

// Start the worker
main();
