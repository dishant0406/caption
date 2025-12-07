/**
 * Transcription Provider Factory
 * 
 * Creates and manages transcription provider instances.
 * Allows easy switching between providers via configuration.
 */

import { getEnv } from '@/config';
import { logger } from '@/plugins/logger';

import { AzureOpenAIConfig, AzureOpenAIWhisperProvider } from './azure-openai.provider';
import { ITranscriptionProvider } from './types';

export { AzureGPT4oTranscriptionProvider } from './azure-gpt4o.provider';
export { AzureOpenAIWhisperProvider } from './azure-openai.provider';
export * from './types';

// Provider type enum
export type TranscriptionProviderType = 'azure-openai' | 'azure-gpt4o' | 'openai' | 'deepgram' | 'assemblyai';

// Factory configuration
export interface TranscriptionFactoryConfig {
  provider: TranscriptionProviderType;
  fallbackProvider?: TranscriptionProviderType;
  
  // Azure OpenAI config
  azureOpenAI?: AzureOpenAIConfig;
  
  // OpenAI config (for future use)
  openAI?: {
    apiKey: string;
    model?: string;
  };
  
  // Deepgram config (for future use)
  deepgram?: {
    apiKey: string;
    model?: string;
  };
}

/**
 * Transcription Provider Factory
 * Singleton pattern for provider management
 */
class TranscriptionProviderFactory {
  private static instance: TranscriptionProviderFactory;
  private providers: Map<string, ITranscriptionProvider> = new Map();
  private activeProvider: ITranscriptionProvider | null = null;
  private fallbackProvider: ITranscriptionProvider | null = null;

  private constructor() {}

  static getInstance(): TranscriptionProviderFactory {
    if (!TranscriptionProviderFactory.instance) {
      TranscriptionProviderFactory.instance = new TranscriptionProviderFactory();
    }
    return TranscriptionProviderFactory.instance;
  }

  /**
   * Initialize providers from environment variables
   */
  initializeFromEnv(): void {
    const env = getEnv();

    // Determine which provider to use from env
    const providerType = (env.TRANSCRIPTION_PROVIDER || 'azure-openai') as TranscriptionProviderType;

    logger.info('Initializing transcription provider', { provider: providerType });

    switch (providerType) {
      case 'azure-openai':
        this.initializeAzureOpenAI(env);
        break;
      case 'azure-gpt4o':
        this.initializeAzureGPT4o(env);
        break;
      case 'openai':
        // Future: OpenAI direct implementation
        logger.warn('OpenAI direct provider not yet implemented, falling back to Azure OpenAI');
        this.initializeAzureOpenAI(env);
        break;
      default:
        logger.warn(`Unknown provider type: ${providerType}, using Azure OpenAI`);
        this.initializeAzureOpenAI(env);
    }
  }

  /**
   * Initialize Azure OpenAI Whisper provider
   */
  private initializeAzureOpenAI(env: ReturnType<typeof getEnv>): void {
    const azureConfig: AzureOpenAIConfig = {
      endpoint: env.AZURE_OPENAI_ENDPOINT || '',
      apiKey: env.AZURE_OPENAI_API_KEY || '',
      deploymentName: env.AZURE_OPENAI_WHISPER_DEPLOYMENT || 'whisper',
      apiVersion: env.AZURE_OPENAI_API_VERSION || '2024-02-01',
    };

    const provider = new AzureOpenAIWhisperProvider(azureConfig);
    
    if (provider.isConfigured()) {
      this.providers.set('azure-openai', provider);
      this.activeProvider = provider;
      logger.info('Azure OpenAI Whisper provider initialized successfully');
    } else {
      logger.error('Azure OpenAI Whisper provider configuration incomplete', {
        hasEndpoint: !!azureConfig.endpoint,
        hasApiKey: !!azureConfig.apiKey,
        hasDeployment: !!azureConfig.deploymentName,
      });
    }
  }

  /**
   * Initialize Azure GPT-4o Transcription provider
   */
  private initializeAzureGPT4o(env: ReturnType<typeof getEnv>): void {
    // Dynamic import to avoid unused import being removed by formatter
    const { AzureGPT4oTranscriptionProvider } = require('./azure-gpt4o.provider');
    
    const gpt4oConfig = {
      endpoint: env.AZURE_GPT4O_ENDPOINT || env.AZURE_OPENAI_ENDPOINT || '',
      apiKey: env.AZURE_GPT4O_API_KEY || env.AZURE_OPENAI_API_KEY || '',
      deploymentName: env.AZURE_GPT4O_DEPLOYMENT || 'gpt-4o-transcribe-diarize',
      apiVersion: env.AZURE_GPT4O_API_VERSION || '2025-03-01-preview',
    };

    const provider = new AzureGPT4oTranscriptionProvider(gpt4oConfig);
    
    if (provider.isConfigured()) {
      this.providers.set('azure-gpt4o', provider);
      this.activeProvider = provider;
      logger.info('Azure GPT-4o Transcription provider initialized successfully');
    } else {
      logger.error('Azure GPT-4o Transcription provider configuration incomplete', {
        hasEndpoint: !!gpt4oConfig.endpoint,
        hasApiKey: !!gpt4oConfig.apiKey,
        hasDeployment: !!gpt4oConfig.deploymentName,
      });
    }
  }

  /**
   * Get the active provider
   */
  getProvider(): ITranscriptionProvider {
    if (!this.activeProvider) {
      throw new Error('No transcription provider configured. Call initializeFromEnv() first.');
    }
    return this.activeProvider;
  }

  /**
   * Get a specific provider by name
   */
  getProviderByName(name: string): ITranscriptionProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * Set the active provider
   */
  setActiveProvider(name: string): void {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Provider not found: ${name}`);
    }
    this.activeProvider = provider;
    logger.info(`Active transcription provider changed to: ${name}`);
  }

  /**
   * Register a custom provider
   */
  registerProvider(name: string, provider: ITranscriptionProvider): void {
    this.providers.set(name, provider);
    logger.info(`Custom transcription provider registered: ${name}`);
  }

  /**
   * Check health of all providers
   */
  async healthCheckAll(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    
    for (const [name, provider] of this.providers.entries()) {
      try {
        results[name] = await provider.healthCheck();
      } catch (error) {
        results[name] = false;
        logger.error(`Health check failed for provider: ${name}`, {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
    
    return results;
  }

  /**
   * Get list of available providers
   */
  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}

// Export singleton instance getter
export const getTranscriptionFactory = TranscriptionProviderFactory.getInstance.bind(TranscriptionProviderFactory);

// Convenience function to get the active provider
export function getTranscriptionProvider(): ITranscriptionProvider {
  return TranscriptionProviderFactory.getInstance().getProvider();
}

// Initialize providers from environment
export function initializeTranscriptionProviders(): void {
  TranscriptionProviderFactory.getInstance().initializeFromEnv();
}
