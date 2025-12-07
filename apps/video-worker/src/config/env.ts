import dotenv from 'dotenv';
import path from 'path';
import { EnvConfig, validateEnv } from './env.schema';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Validate and export environment configuration
let envConfig: EnvConfig;

export function getEnv(): EnvConfig {
  if (!envConfig) {
    envConfig = validateEnv();
  }
  return envConfig;
}

// Helper functions
export const isDevelopment = (): boolean => getEnv().NODE_ENV === 'development';
export const isProduction = (): boolean => getEnv().NODE_ENV === 'production';
export const isTest = (): boolean => getEnv().NODE_ENV === 'test';
