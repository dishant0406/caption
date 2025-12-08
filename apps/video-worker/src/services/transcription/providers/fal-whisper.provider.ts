/**
 * Fal.ai Whisper Transcription Provider
 * 
 * Uses Fal.ai's Whisper API for word-level transcription with accurate timestamps.
 * Best suited for word-by-word caption mode due to reliable word-level timestamps.
 */

import { logger } from '@/plugins/logger';
import axios from 'axios';

import {
  ITranscriptionProvider,
  ProviderCapabilities,
  TranscriptionOptions,
  TranscriptionResult,
  TranscriptionSegment,
} from './types';

export interface FalWhisperConfig {
  apiKey: string;           // FAL_KEY environment variable
  chunkLevel?: 'word' | 'segment'; // Default to 'word' for word-level timestamps
  pollIntervalMs?: number;  // Poll interval in milliseconds (default 3000)
}

// Fal.ai Whisper response structure
interface FalWhisperChunk {
  timestamp: [number, number]; // [start, end] in seconds
  text: string;
  speaker: string | null;
}

interface FalWhisperResponse {
  text: string;
  chunks: FalWhisperChunk[];
  inferred_languages?: string[];
  diarization_segments?: unknown[];
}

// Fal.ai queue submit response
interface FalQueueResponse {
  request_id: string;
  status?: string;
  response_url?: string;
}

// Fal.ai status check response
interface FalStatusResponse {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  response_url?: string;
  logs?: Array<{ message: string; timestamp: string }>;
}

const FAL_API_BASE = 'https://queue.fal.run';

export class FalWhisperProvider implements ITranscriptionProvider {
  readonly name = 'fal-whisper';
  
  private config!: FalWhisperConfig;
  private configured: boolean = false;

  constructor(config?: FalWhisperConfig) {
    if (config) {
      this.configure(config);
    }
  }

  /**
   * Configure the provider with Fal.ai credentials
   */
  configure(config: FalWhisperConfig): void {
    this.config = {
      ...config,
      chunkLevel: config.chunkLevel || 'word', // Default to word-level for accurate timestamps
      pollIntervalMs: config.pollIntervalMs || 3000, // Default 3 seconds
    };
    
    this.configured = !!config.apiKey;

    if (this.configured) {
      logger.info('Fal.ai Whisper provider configured', {
        chunkLevel: this.config.chunkLevel,
        pollIntervalMs: this.config.pollIntervalMs,
      });
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsWordTimings: true, // Fal.ai Whisper supports word-level timestamps
      supportsLanguageDetection: true,
      supportedLanguages: [
        'en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'pl', 'ru',
        'ja', 'ko', 'zh', 'ar', 'hi', 'tr', 'vi', 'th', 'id',
        'ms', 'fil', 'uk', 'cs', 'ro', 'el', 'hu', 'sv', 'da',
        'fi', 'no', 'he', 'bn', 'ta', 'te', 'mr', 'gu', 'kn',
      ],
      maxAudioDurationSeconds: 7200, // 2 hours
      maxFileSizeMB: 100, // Fal.ai supports larger files via URL
      supportedFormats: ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm', 'flac', 'ogg'],
    };
  }

  async healthCheck(): Promise<boolean> {
    // Simple check that credentials are configured
    return this.configured;
  }

  /**
   * Submit a transcription request to Fal.ai queue
   */
  private async submitRequest(audioUrl: string, language?: string): Promise<string> {
    const requestBody: Record<string, unknown> = {
      audio_url: audioUrl,
      chunk_level: this.config.chunkLevel || 'word',
      task: 'transcribe',
    };

    if (language) {
      requestBody.language = language;
    }

    logger.info('Submitting request to Fal.ai', { audioUrl, chunkLevel: this.config.chunkLevel });

    const response = await axios.post<FalQueueResponse>(
      `${FAL_API_BASE}/fal-ai/whisper`,
      requestBody,
      {
        headers: {
          'Authorization': `Key ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    logger.info('Fal.ai queue response', { 
      requestId: response.data.request_id,
      status: response.data.status,
    });

    return response.data.request_id;
  }

  /**
   * Check the status of a queued request
   */
  private async checkStatus(requestId: string): Promise<FalStatusResponse> {
    const response = await axios.get<FalStatusResponse>(
      `${FAL_API_BASE}/fal-ai/whisper/requests/${requestId}/status`,
      {
        headers: {
          'Authorization': `Key ${this.config.apiKey}`,
        },
      }
    );
    return response.data;
  }

  /**
   * Get the result of a completed request
   */
  private async getResult(requestId: string): Promise<FalWhisperResponse> {
    const response = await axios.get<FalWhisperResponse>(
      `${FAL_API_BASE}/fal-ai/whisper/requests/${requestId}`,
      {
        headers: {
          'Authorization': `Key ${this.config.apiKey}`,
        },
      }
    );
    return response.data;
  }

  /**
   * Poll for transcription result
   */
  private async pollResult(requestId: string): Promise<FalWhisperResponse> {
    const maxAttempts = 100; // ~5 minutes max with 3s intervals
    const pollInterval = this.config.pollIntervalMs || 3000;

    logger.info('Starting to poll for Fal.ai result', { requestId, pollInterval, maxAttempts });

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        // First check status
        const statusResponse = await this.checkStatus(requestId);
        
        logger.info('Fal.ai status check', {
          requestId,
          status: statusResponse.status,
          attempt: attempt + 1,
        });

        if (statusResponse.status === 'COMPLETED') {
          // Fetch the actual result
          const result = await this.getResult(requestId);
          logger.info('Fal.ai result fetched successfully', {
            requestId,
            textLength: result.text?.length,
            chunksCount: result.chunks?.length,
          });
          return result;
        }

        if (statusResponse.status === 'FAILED') {
          throw new Error(`Fal.ai transcription failed for request ${requestId}`);
        }

        // Status is IN_QUEUE or IN_PROGRESS, wait and try again
        logger.debug('Waiting before next poll', {
          requestId,
          status: statusResponse.status,
          waitMs: pollInterval,
        });
        
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      } catch (error) {
        // Check if it's a 404 or other transient error
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          logger.debug('Request not ready yet, continuing to poll', { requestId, attempt });
          await new Promise(resolve => setTimeout(resolve, pollInterval));
          continue;
        }
        throw error;
      }
    }

    throw new Error(`Fal.ai transcription timed out after ${maxAttempts} attempts for request ${requestId}`);
  }

  async transcribe(
    audioPath: string,
    options: TranscriptionOptions = {}
  ): Promise<TranscriptionResult> {
    if (!this.configured) {
      throw new Error('Fal.ai Whisper provider is not configured');
    }

    const startTime = Date.now();

    logger.info('Starting Fal.ai Whisper transcription', {
      audioPath,
      language: options.language,
      chunkLevel: this.config.chunkLevel,
    });

    try {
      // Fal.ai requires a URL, so we need to handle local files
      // For now, we'll assume audioPath is already a URL (from Azure Blob Storage)
      const audioUrl = audioPath;
      
      // Check if it's a local file path (starts with / or contains backslash)
      if (audioPath.startsWith('/') || audioPath.includes('\\')) {
        throw new Error('Fal.ai Whisper requires an audio URL. Please upload the file to blob storage first.');
      }

      // Submit request to queue
      const requestId = await this.submitRequest(audioUrl, options.language);
      logger.info('Fal.ai request submitted', { requestId });

      // Poll for result
      const data = await this.pollResult(requestId);
      const processingTimeMs = Date.now() - startTime;

      // Parse chunks into TranscriptionSegments (word-level)
      const segments: TranscriptionSegment[] = [];
      
      if (data.chunks && Array.isArray(data.chunks)) {
        for (const chunk of data.chunks) {
          const [start, end] = chunk.timestamp;
          segments.push({
            start,
            end,
            text: chunk.text.trim(),
          });
        }
      }

      // Detect language from response
      const detectedLanguage = data.inferred_languages?.[0] || options.language || 'unknown';

      // Calculate duration from last segment
      const duration = segments.length > 0 
        ? segments[segments.length - 1].end 
        : 0;

      logger.info('Fal.ai Whisper transcription completed', {
        textLength: data.text?.length || 0,
        segmentCount: segments.length,
        chunkLevel: this.config.chunkLevel,
        detectedLanguage,
        processingTimeMs,
        sampleWords: segments.slice(0, 3).map(s => ({ text: s.text, start: s.start, end: s.end })),
      });

      return {
        text: data.text || '',
        segments,
        language: detectedLanguage,
        duration,
        provider: this.name,
        modelUsed: 'fal-ai/whisper',
        processingTimeMs,
      };
    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      
      logger.error('Fal.ai Whisper transcription failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        processingTimeMs,
      });

      throw error;
    }
  }
}

export default FalWhisperProvider;
