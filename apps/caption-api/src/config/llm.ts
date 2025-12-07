import { createAzure } from '@ai-sdk/azure';
import { openai } from '@ai-sdk/openai';
import type { LanguageModelV2 } from '@ai-sdk/provider';
import { Memory } from '@mastra/memory';
import { PgVector, PostgresStore } from '@mastra/pg';
import { env } from './env';

/**
 * LLM Configuration for Video Captioning Bot
 * 
 * Supports both Azure OpenAI and OpenAI providers.
 */

// Extract resource name from endpoint URL (e.g., https://zerocarbonesg.openai.azure.com -> zerocarbonesg)
const extractResourceName = (endpoint: string | undefined): string | undefined => {
  if (!endpoint) return undefined;
  const match = endpoint.match(/https?:\/\/([^.]+)\.openai\.azure\.com/);
  return match ? match[1] : undefined;
};

// Check if Azure configuration is available
const azureResourceName = extractResourceName(env.AZURE_OPENAI_ENDPOINT);
const isAzureConfigured = !!(
  azureResourceName &&
  env.AZURE_OPENAI_API_KEY &&
  env.AZURE_OPENAI_DEPLOYMENT
);

// Determine provider based on LLM_PROVIDER env var or Azure availability
const useAzure = env.LLM_PROVIDER === 'azure' && isAzureConfigured;

// Create Azure provider if configured - using resourceName and deployment-based URLs
const azure = useAzure && azureResourceName && env.AZURE_OPENAI_API_KEY
  ? createAzure({
      resourceName: azureResourceName,
      apiKey: env.AZURE_OPENAI_API_KEY,
      apiVersion: '2023-05-15', // Use stable version that works with Mastra
      useDeploymentBasedUrls: true,
    })
  : null;

/**
 * Primary model for the caption agent
 * Uses GPT-4o for best performance
 */
export const primaryModel: LanguageModelV2 = (azure && env.AZURE_OPENAI_DEPLOYMENT
  ? azure(env.AZURE_OPENAI_DEPLOYMENT)
  : openai(env.OPENAI_MODEL || 'gpt-4o')) as LanguageModelV2;

/**
 * Secondary model for faster/cheaper tasks
 * Uses GPT-4o-mini
 */
export const secondaryModel: LanguageModelV2 = (azure && env.AZURE_OPENAI_DEPLOYMENT
  ? azure(env.AZURE_OPENAI_DEPLOYMENT) // Can use same deployment or different one
  : openai('gpt-4o-mini')) as LanguageModelV2;

/**
 * Embedder model for memory storage
 */
const getEmbeddingModel = () => {
  if (useAzure && azureResourceName && env.AZURE_OPENAI_API_KEY && env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT) {
    return createAzure({
      resourceName: azureResourceName,
      apiKey: env.AZURE_OPENAI_API_KEY,
      apiVersion: '2023-05-15',
      useDeploymentBasedUrls: true,
    }).textEmbeddingModel(env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT);
  }
  return openai.embedding('text-embedding-3-small');
};

/**
 * Export provider info for logging/debugging
 */
export const llmConfig = {
  provider: useAzure ? 'azure' : 'openai',
  primaryModel: useAzure ? env.AZURE_OPENAI_DEPLOYMENT : (env.OPENAI_MODEL || 'gpt-4o'),
  secondaryModel: useAzure ? env.AZURE_OPENAI_DEPLOYMENT : 'gpt-4o-mini',
  endpoint: env.AZURE_OPENAI_ENDPOINT,
  isAzureConfigured: useAzure,
};

// Log LLM configuration on startup
console.log('🤖 LLM Configuration:', {
  provider: llmConfig.provider,
  primaryModel: llmConfig.primaryModel,
  secondaryModel: llmConfig.secondaryModel,
  ...(useAzure && {
    endpoint: llmConfig.endpoint,
    embeddingDeployment: env.AZURE_OPENAI_EMBEDDING_DEPLOYMENT,
  }),
});

/**
 * Centralized Memory Configuration
 * 
 * Configured with PostgreSQL storage and PgVector for semantic search.
 */
export const memory = new Memory({
  storage: new PostgresStore({
    connectionString: env.DATABASE_URL,
  }),
  vector: new PgVector({
    connectionString: env.DATABASE_URL,
  }),
  options: {
    lastMessages: 10, // Keep last 10 messages for context
    semanticRecall: {
      topK: 3,
      messageRange: 2,
    },
  },
  embedder: getEmbeddingModel(),
});

/**
 * Default generation options
 */
export const DEFAULT_GEN_OPTIONS = {
  temperature: 0,
  maxSteps: 10,
  maxTokens: 1500,
};
