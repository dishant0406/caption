/**
 * Azure OpenAI Whisper Transcription Provider
 * 
 * Uses Azure OpenAI's Whisper deployment for transcription.
 * Recommended for production use due to enterprise SLAs and data privacy.
 */

import { logger } from '@/plugins/logger';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

import {
  ITranscriptionProvider,
  ProviderCapabilities,
  TranscriptionOptions,
  TranscriptionResult,
  TranscriptionSegment,
} from './types';

export interface AzureOpenAIConfig {
  endpoint: string;          // Azure OpenAI endpoint (e.g., https://xxx.openai.azure.com)
  apiKey: string;            // Azure API key
  deploymentName: string;    // Whisper deployment name (e.g., 'whisper')
  apiVersion: string;        // API version (e.g., '2024-02-01')
}

export class AzureOpenAIWhisperProvider implements ITranscriptionProvider {
  readonly name = 'azure-openai-whisper';
  
  private config!: AzureOpenAIConfig;
  private configured: boolean = false;

  constructor(config?: AzureOpenAIConfig) {
    if (config) {
      this.configure(config);
    }
  }

  /**
   * Configure the provider with Azure credentials
   */
  configure(config: AzureOpenAIConfig): void {
    this.config = config;
    this.configured = !!(
      config.endpoint &&
      config.apiKey &&
      config.deploymentName &&
      config.apiVersion
    );

    if (this.configured) {
      logger.info('Azure OpenAI Whisper provider configured', {
        endpoint: config.endpoint.replace(/api-key=.*/, 'api-key=***'),
        deploymentName: config.deploymentName,
        apiVersion: config.apiVersion,
      });
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  getCapabilities(): ProviderCapabilities {
    return {
      supportsWordTimings: true,
      supportsLanguageDetection: true,
      supportedLanguages: [
        'en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'pl', 'ru',
        'ja', 'ko', 'zh', 'ar', 'hi', 'tr', 'vi', 'th', 'id',
        'ms', 'fil', 'uk', 'cs', 'ro', 'el', 'hu', 'sv', 'da',
        'fi', 'no', 'he', 'bn', 'ta', 'te', 'mr', 'gu', 'kn',
      ],
      maxAudioDurationSeconds: 7200, // 2 hours
      maxFileSizeMB: 25,
      supportedFormats: ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'],
    };
  }

  async healthCheck(): Promise<boolean> {
    if (!this.configured) {
      return false;
    }

    try {
      // Simple connectivity check - Azure doesn't have a dedicated health endpoint
      // We'll just verify the endpoint is reachable
      const url = `${this.config.endpoint}/openai/deployments?api-version=${this.config.apiVersion}`;
      const response = await axios.get(url, {
        headers: {
          'api-key': this.config.apiKey,
        },
        timeout: 5000,
      });
      return response.status === 200;
    } catch (error) {
      logger.warn('Azure OpenAI health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  async transcribe(
    audioPath: string,
    options: TranscriptionOptions = {}
  ): Promise<TranscriptionResult> {
    if (!this.configured) {
      throw new Error('Azure OpenAI Whisper provider is not configured');
    }

    const startTime = Date.now();

    // Validate file exists
    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    // Check file size
    const stats = fs.statSync(audioPath);
    const fileSizeMB = stats.size / (1024 * 1024);
    if (fileSizeMB > 25) {
      throw new Error(`File size ${fileSizeMB.toFixed(2)}MB exceeds maximum of 25MB`);
    }

    logger.info('Starting Azure OpenAI Whisper transcription', {
      audioPath,
      fileSizeMB: fileSizeMB.toFixed(2),
      language: options.language,
    });

    try {
      // Build the API URL
      const url = `${this.config.endpoint}/openai/deployments/${this.config.deploymentName}/audio/transcriptions?api-version=${this.config.apiVersion}`;

      // Create form data
      const formData = new FormData();
      formData.append('file', fs.createReadStream(audioPath), {
        filename: path.basename(audioPath),
        contentType: this.getContentType(audioPath),
      });
      
      // Response format for timestamps
      formData.append('response_format', 'verbose_json');
      
      // Add optional parameters
      if (options.language) {
        formData.append('language', options.language);
      }
      if (options.prompt) {
        formData.append('prompt', options.prompt);
      }
      if (options.temperature !== undefined) {
        formData.append('temperature', options.temperature.toString());
      }
      
      // Request timestamp granularities
      formData.append('timestamp_granularities[]', 'segment');
      if (options.timestampGranularity === 'word') {
        formData.append('timestamp_granularities[]', 'word');
      }

      // Make the API request
      const response = await axios.post(url, formData, {
        headers: {
          'api-key': this.config.apiKey,
          ...formData.getHeaders(),
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 300000, // 5 minutes timeout
      });

      const data = response.data;
      const processingTimeMs = Date.now() - startTime;

      // Parse segments from response
      const segments: TranscriptionSegment[] = [];
      
      if (data.segments && Array.isArray(data.segments)) {
        for (const seg of data.segments) {
          const segment: TranscriptionSegment = {
            start: seg.start,
            end: seg.end,
            text: seg.text.trim(),
          };

          // Add word-level timings if available
          if (seg.words && Array.isArray(seg.words)) {
            segment.words = seg.words.map((w: { word: string; start: number; end: number }) => ({
              word: w.word,
              start: w.start,
              end: w.end,
            }));
          }

          segments.push(segment);
        }
      }

      logger.info('Azure OpenAI Whisper transcription completed', {
        textLength: data.text?.length || 0,
        segmentCount: segments.length,
        language: data.language || options.language || 'auto',
        duration: data.duration || 0,
        processingTimeMs,
      });

      return {
        text: data.text || '',
        segments,
        language: data.language || options.language || 'unknown',
        duration: data.duration || 0,
        provider: this.name,
        modelUsed: `azure/${this.config.deploymentName}`,
        processingTimeMs,
      };
    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const errorData = error.response?.data;
        
        logger.error('Azure OpenAI Whisper transcription failed', {
          status,
          error: errorData?.error?.message || error.message,
          processingTimeMs,
        });

        // Handle specific error codes
        if (status === 429) {
          throw new Error('Rate limit exceeded. Please retry after a moment.');
        }
        if (status === 401 || status === 403) {
          throw new Error('Azure OpenAI authentication failed. Check API key.');
        }
        if (status === 413) {
          throw new Error('Audio file too large for Azure OpenAI.');
        }

        throw new Error(
          `Azure OpenAI transcription failed: ${errorData?.error?.message || error.message}`
        );
      }

      throw error;
    }
  }

  /**
   * Get content type based on file extension
   */
  private getContentType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes: Record<string, string> = {
      '.mp3': 'audio/mpeg',
      '.mp4': 'audio/mp4',
      '.mpeg': 'audio/mpeg',
      '.mpga': 'audio/mpeg',
      '.m4a': 'audio/mp4',
      '.wav': 'audio/wav',
      '.webm': 'audio/webm',
    };
    return contentTypes[ext] || 'audio/mpeg';
  }
}

export default AzureOpenAIWhisperProvider;
