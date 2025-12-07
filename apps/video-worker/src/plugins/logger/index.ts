import { getEnv, isDevelopment } from '@/config';
import winston from 'winston';

const { combine, timestamp, printf, colorize, errors } = winston.format;

// Custom log format
const logFormat = printf(({ level, message, timestamp, stack, ...metadata }) => {
  let log = `${timestamp} [video-worker] ${level}: ${message}`;

  if (Object.keys(metadata).length > 0) {
    log += ` ${JSON.stringify(metadata)}`;
  }

  if (stack) {
    log += `\n${stack}`;
  }

  return log;
});

// Create logger instance
const createLogger = () => {
  const env = getEnv();

  const logger = winston.createLogger({
    level: env.LOG_LEVEL,
    format: combine(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), errors({ stack: true }), logFormat),
    defaultMeta: { service: 'video-worker' },
    transports: [
      new winston.transports.Console({
        format: isDevelopment() ? combine(colorize(), logFormat) : logFormat,
      }),
    ],
  });

  return logger;
};

// Singleton logger instance
let loggerInstance: winston.Logger | null = null;

export function getLogger(): winston.Logger {
  if (!loggerInstance) {
    loggerInstance = createLogger();
  }
  return loggerInstance;
}

// Export convenience methods
export const logger = {
  info: (message: string, meta?: object) => getLogger().info(message, meta),
  error: (message: string, meta?: object) => getLogger().error(message, meta),
  warn: (message: string, meta?: object) => getLogger().warn(message, meta),
  debug: (message: string, meta?: object) => getLogger().debug(message, meta),
};

export default logger;
