/**
 * Logger types
 */

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

export interface LoggerConfig {
  level: LogLevel;
  format: 'json' | 'simple';
  fileEnabled?: boolean;
  filePath?: string;
}

export interface LogMeta {
  [key: string]: unknown;
}

export interface ILogger {
  error(message: string, error?: Error, meta?: LogMeta): void;
  warn(message: string, meta?: LogMeta): void;
  info(message: string, meta?: LogMeta): void;
  debug(message: string, meta?: LogMeta): void;
}
