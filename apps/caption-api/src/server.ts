import { database, env, initializeDatabase, isDevelopment } from '@/config';
import { initializeModels } from '@/models';
import { cache, initializeCache } from '@/plugins/cache';
import { initializeLogger, logger } from '@/plugins/logger';
import type { LogLevel } from '@/plugins/logger/types';
import { initializeQueue, jobQueue } from '@/plugins/queue';
import { initializeJobResultHandler } from '@/services/jobResultHandler';
import { socketManager } from '@/socket';
import app from './app';

// Initialize application
async function startServer(): Promise<void> {
  try {
    // Initialize logger first
    initializeLogger({
      level: env.LOG_LEVEL as LogLevel,
      format: env.LOG_FORMAT as 'json' | 'simple',
      fileEnabled: env.LOG_FILE_ENABLED,
      filePath: env.LOG_FILE_PATH,
    });

    logger.info('Starting Caption Bot API server...', {
      nodeEnv: env.NODE_ENV,
      port: env.PORT,
      apiPrefix: env.API_PREFIX,
    });

    // Initialize database
    await initializeDatabase();
    logger.info('Database connected successfully');

    // Initialize models and associations
    initializeModels();
    logger.info('Models initialized');

    // Sync database in development
    if (isDevelopment()) {
      await database.sync({ alter: true });
      logger.info('Database synchronized in development mode');
    }

    // Initialize cache
    try {
      await initializeCache();
      logger.info('Cache connected successfully');
    } catch (error) {
      logger.warn('Cache connection failed, continuing without cache', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Initialize job queue
    try {
      await initializeQueue();
      logger.info('Job queue connected successfully');

      // Initialize job result handler after queue is ready
      initializeJobResultHandler();
    } catch (error) {
      logger.warn('Job queue connection failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Connect to WhatsApp socket server
    try {
      socketManager.connect();
      logger.info('WhatsApp socket manager initialized');
    } catch (error) {
      logger.warn('WhatsApp socket connection failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Start HTTP server
    const server = app.listen(env.PORT, env.HOST, () => {
      logger.info(`Server is running on ${env.HOST}:${env.PORT}`, {
        environment: env.NODE_ENV,
        apiUrl: `http://${env.HOST}:${env.PORT}${env.API_PREFIX}`,
        healthCheck: `http://${env.HOST}:${env.PORT}/health`,
      });
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string): Promise<void> => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);

      server.close(async () => {
        try {
          // Disconnect WhatsApp socket
          try {
            socketManager.disconnect();
            logger.info('WhatsApp socket disconnected');
          } catch {
            // Socket might not be connected
          }

          // Close database connection
          await database.disconnect();
          logger.info('Database disconnected');

          // Close cache connection
          try {
            await cache.disconnect();
            logger.info('Cache disconnected');
          } catch {
            // Cache might not be connected
          }

          // Close job queue connection
          try {
            await jobQueue.disconnect();
            logger.info('Job queue disconnected');
          } catch {
            // Queue might not be connected
          }

          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error(
            'Error during shutdown',
            error instanceof Error ? error : new Error('Unknown error')
          );
          process.exit(1);
        }
      });
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      logger.error('Uncaught exception', error);
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: unknown) => {
      logger.error(
        'Unhandled promise rejection',
        reason instanceof Error ? reason : new Error(String(reason))
      );
      process.exit(1);
    });
  } catch (error) {
    // Fallback to console if logger isn't initialized yet
    // eslint-disable-next-line no-console
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Server startup failed:', error);
  process.exit(1);
});
