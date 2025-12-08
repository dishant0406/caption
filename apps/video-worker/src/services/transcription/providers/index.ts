/**
 * Transcription Provider Factory
 * 
 * Creates and manages transcription provider instances.
 * Supports multiple providers:
 * - Azure OpenAI Whisper: For segment-level transcription
 * - Fal.ai Whisper: For word-level transcription (more accurate word timestamps)
 */

import { getEnv } from '@/config';
import { logger } from '@/plugins/logger';

import { AzureOpenAIConfig, AzureOpenAIWhisperProvider } from './azure-openai.provider';
import { FalWhisperConfig, FalWhisperProvider } from './fal-whisper.provider';
import { ITranscriptionProvider } from './types';

export { AzureOpenAIWhisperProvider } from './azure-openai.provider';
export { FalWhisperProvider } from './fal-whisper.provider';
export * from './types';

// Provider type enum
export type TranscriptionProviderType = 'azure-openai' | 'fal-whisper';

// Factory configuration
export interface TranscriptionFactoryConfig {
  provider: TranscriptionProviderType;
  fallbackProvider?: TranscriptionProviderType;
  
  // Azure OpenAI config
  azureOpenAI?: AzureOpenAIConfig;
  
  // Fal.ai config
  falWhisper?: FalWhisperConfig;
}

/**
 * Transcription Provider Factory
 * Singleton pattern for provider management
 */
class TranscriptionProviderFactory {
  private static instance: TranscriptionProviderFactory;
  private providers: Map<string, ITranscriptionProvider> = new Map();
  private activeProvider: ITranscriptionProvider | null = null;
  private wordLevelProvider: ITranscriptionProvider | null = null;

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

    // Determine which provider to use for segment-level transcription
    const providerType = (env.TRANSCRIPTION_PROVIDER || 'azure-openai') as TranscriptionProviderType;
    
    // Determine which provider to use for word-level transcription
    const wordProviderType = (env.WORD_TRANSCRIPTION_PROVIDER || 'fal-whisper') as TranscriptionProviderType;

    logger.info('Initializing transcription providers', { 
      segmentProvider: providerType,
      wordProvider: wordProviderType,
    });

    // Initialize Azure OpenAI if needed
    if (providerType === 'azure-openai' || wordProviderType === 'azure-openai') {
      this.initializeAzureOpenAI(env);
    }

    // Initialize Fal.ai Whisper if needed
    if (providerType === 'fal-whisper' || wordProviderType === 'fal-whisper') {
      this.initializeFalWhisper(env);
    }

    // Set active providers
    this.activeProvider = this.providers.get(providerType) || null;
    this.wordLevelProvider = this.providers.get(wordProviderType) || null;

    // Fallback: if word-level provider not available, use segment provider
    if (!this.wordLevelProvider && this.activeProvider) {
      logger.warn('Word-level provider not available, falling back to segment provider');
      this.wordLevelProvider = this.activeProvider;
    }

    // Fallback: if segment provider not available, use word provider
    if (!this.activeProvider && this.wordLevelProvider) {
      logger.warn('Segment provider not available, falling back to word provider');
      this.activeProvider = this.wordLevelProvider;
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
   * Initialize Fal.ai Whisper provider
   */
  private initializeFalWhisper(env: ReturnType<typeof getEnv>): void {
    const falConfig: FalWhisperConfig = {
      apiKey: env.FAL_KEY || '',
      chunkLevel: 'word', // Default to word-level for accurate timestamps
      pollIntervalMs: env.FAL_POLL_INTERVAL_MS || 3000, // Configurable poll interval
    };

    const provider = new FalWhisperProvider(falConfig);
    
    if (provider.isConfigured()) {
      this.providers.set('fal-whisper', provider);
      logger.info('Fal.ai Whisper provider initialized successfully', {
        pollIntervalMs: falConfig.pollIntervalMs,
      });
    } else {
      logger.error('Fal.ai Whisper provider configuration incomplete', {
        hasApiKey: !!falConfig.apiKey,
      });
    }
  }

  /**
   * Get the active provider (for segment-level transcription)
   */
  getProvider(): ITranscriptionProvider {
    if (!this.activeProvider) {
      throw new Error('No transcription provider configured. Call initializeFromEnv() first.');
    }
    return this.activeProvider;
  }

  /**
   * Get the word-level provider (for word-by-word captions)
   */
  getWordLevelProvider(): ITranscriptionProvider {
    if (!this.wordLevelProvider) {
      throw new Error('No word-level transcription provider configured. Call initializeFromEnv() first.');
    }
    return this.wordLevelProvider;
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

// Convenience function to get the active provider (segment-level)
export function getTranscriptionProvider(): ITranscriptionProvider {
  return TranscriptionProviderFactory.getInstance().getProvider();
}

// Convenience function to get the word-level provider
export function getWordLevelTranscriptionProvider(): ITranscriptionProvider {
  return TranscriptionProviderFactory.getInstance().getWordLevelProvider();
}

// Initialize providers from environment
export function initializeTranscriptionProviders(): void {
  TranscriptionProviderFactory.getInstance().initializeFromEnv();
}
