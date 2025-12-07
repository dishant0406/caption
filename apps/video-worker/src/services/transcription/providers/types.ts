/**
 * Transcription Provider Types and Interfaces
 * 
 * This module defines the contracts for transcription providers,
 * allowing easy switching between different services (Azure OpenAI, OpenAI, Deepgram, etc.)
 */

// Transcription segment with timing information
export interface TranscriptionSegment {
  start: number;      // Start time in seconds
  end: number;        // End time in seconds
  text: string;       // Transcribed text
  confidence?: number; // Optional confidence score (0-1)
  words?: WordTiming[]; // Optional word-level timings
}

// Word-level timing for karaoke-style captions
export interface WordTiming {
  word: string;
  start: number;
  end: number;
  confidence?: number;
}

// Result from transcription
export interface TranscriptionResult {
  text: string;                    // Full transcribed text
  segments: TranscriptionSegment[]; // Timed segments
  language: string;                // Detected or specified language
  duration: number;                // Audio duration in seconds
  provider: string;                // Which provider was used
  modelUsed?: string;              // Specific model used
  processingTimeMs?: number;       // How long transcription took
}

// Options for transcription
export interface TranscriptionOptions {
  language?: string;               // Target language code (e.g., 'en', 'es')
  prompt?: string;                 // Optional context/prompt to improve accuracy
  temperature?: number;            // Model temperature (0-1)
  timestampGranularity?: 'segment' | 'word'; // Level of timestamp detail
  responseFormat?: 'json' | 'verbose_json' | 'text' | 'srt' | 'vtt';
}

// Provider configuration
export interface TranscriptionProviderConfig {
  provider: 'azure-openai' | 'openai' | 'deepgram' | 'assemblyai' | 'custom';
  apiKey: string;
  
  // Azure-specific
  azureEndpoint?: string;
  azureDeploymentName?: string;
  azureApiVersion?: string;
  
  // Model settings
  model?: string;
  
  // Rate limiting
  maxConcurrentRequests?: number;
  requestsPerMinute?: number;
  
  // Retry settings
  maxRetries?: number;
  retryDelayMs?: number;
}

// Abstract interface that all providers must implement
export interface ITranscriptionProvider {
  /**
   * Provider name identifier
   */
  readonly name: string;
  
  /**
   * Check if provider is properly configured and ready
   */
  isConfigured(): boolean;
  
  /**
   * Transcribe an audio file
   * @param audioPath Path to audio file
   * @param options Transcription options
   * @returns Transcription result
   */
  transcribe(audioPath: string, options?: TranscriptionOptions): Promise<TranscriptionResult>;
  
  /**
   * Check provider health/availability
   */
  healthCheck(): Promise<boolean>;
  
  /**
   * Get provider capabilities
   */
  getCapabilities(): ProviderCapabilities;
}

// Provider capabilities for feature detection
export interface ProviderCapabilities {
  supportsWordTimings: boolean;
  supportsLanguageDetection: boolean;
  supportedLanguages: string[];
  maxAudioDurationSeconds: number;
  maxFileSizeMB: number;
  supportedFormats: string[];
}

// Provider health status
export interface ProviderHealthStatus {
  isHealthy: boolean;
  latencyMs?: number;
  lastChecked: Date;
  errorMessage?: string;
}
