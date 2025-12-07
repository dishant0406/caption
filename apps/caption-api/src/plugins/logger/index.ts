import winston from 'winston';
import type { ILogger, LoggerConfig, LogMeta } from './types';

// Re-export types
export type { ILogger, LoggerConfig, LogLevel, LogMeta } from './types';

// Logger class implementing ILogger interface
class Logger implements ILogger {
  private winstonLogger: winston.Logger;
  private config: LoggerConfig;

  constructor(config: LoggerConfig) {
    this.config = config;
    this.winstonLogger = this.createWinstonLogger();
  }

  private createWinstonLogger(): winston.Logger {
    const formats: winston.Logform.Format[] = [
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      winston.format.errors({ stack: true }),
    ];

    if (this.config.format === 'json') {
      formats.push(winston.format.json());
    } else {
      formats.push(
        winston.format.colorize(),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          const metaStr = Object.keys(meta).length
            ? ` ${JSON.stringify(meta)}`
            : '';
          return `${timestamp} [${level}]: ${message}${metaStr}`;
        })
      );
    }

    const transports: winston.transport[] = [
      new winston.transports.Console(),
    ];

    if (this.config.fileEnabled && this.config.filePath) {
      transports.push(
        new winston.transports.File({
          filename: this.config.filePath,
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
        })
      );
    }

    return winston.createLogger({
      level: this.config.level,
      format: winston.format.combine(...formats),
      transports,
      exitOnError: false,
    });
  }

  error(message: string, error?: Error, meta?: LogMeta): void {
    const logMeta: LogMeta = { ...meta };
    if (error) {
      logMeta.error = {
        message: error.message,
        stack: error.stack,
        name: error.name,
      };
    }
    this.winstonLogger.error(message, logMeta);
  }

  warn(message: string, meta?: LogMeta): void {
    this.winstonLogger.warn(message, meta);
  }

  info(message: string, meta?: LogMeta): void {
    this.winstonLogger.info(message, meta);
  }

  debug(message: string, meta?: LogMeta): void {
    this.winstonLogger.debug(message, meta);
  }

  // Update logger configuration
  updateConfig(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
    this.winstonLogger = this.createWinstonLogger();
  }

  // Get the underlying winston logger
  getWinstonLogger(): winston.Logger {
    return this.winstonLogger;
  }
}

// Default configuration
const defaultConfig: LoggerConfig = {
  level: 'info',
  format: 'json',
  fileEnabled: false,
};

// Singleton logger instance
let loggerInstance: Logger | null = null;

// Initialize logger with config
export const initializeLogger = (config?: Partial<LoggerConfig>): void => {
  const finalConfig: LoggerConfig = {
    ...defaultConfig,
    ...config,
  };
  loggerInstance = new Logger(finalConfig);
};

// Get logger instance
export const getLogger = (): ILogger => {
  if (!loggerInstance) {
    // Auto-initialize with defaults if not initialized
    initializeLogger();
  }
  return loggerInstance!;
};

// Export a proxy logger that always uses the singleton
export const logger: ILogger = {
  error: (message: string, error?: Error, meta?: LogMeta): void => {
    getLogger().error(message, error, meta);
  },
  warn: (message: string, meta?: LogMeta): void => {
    getLogger().warn(message, meta);
  },
  info: (message: string, meta?: LogMeta): void => {
    getLogger().info(message, meta);
  },
  debug: (message: string, meta?: LogMeta): void => {
    getLogger().debug(message, meta);
  },
};
