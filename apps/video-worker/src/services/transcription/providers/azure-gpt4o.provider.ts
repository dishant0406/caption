/**
 * Azure OpenAI GPT-4o Transcription Provider
 * 
 * Uses Azure OpenAI's GPT-4o transcription model with diarization support.
 * This is a newer model with potentially better accuracy than Whisper.
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

export interface AzureGPT4oConfig {
  endpoint: string;          // Azure OpenAI endpoint (e.g., https://xxx.openai.azure.com)
  apiKey: string;            // Azure API key (used as Bearer token)
  deploymentName: string;    // GPT-4o deployment name (e.g., 'gpt-4o-transcribe-diarize')
  apiVersion: string;        // API version (e.g., '2025-03-01-preview')
}

// GPT-4o specific response structure
interface GPT4oTranscriptionResponse {
  text: string;
  usage?: {
    type: string;
    total_tokens: number;
    input_tokens: number;
    input_token_details?: {
      text_tokens: number;
      audio_tokens: number;
    };
    output_tokens: number;
  };
  // GPT-4o may return segments in a different format
  segments?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
  // Word-level timestamps (when timestamp_granularities includes 'word')
  words?: Array<{
    word: string;
    start: number;
    end: number;
  }>;
  language?: string;
  duration?: number;
}

export class AzureGPT4oTranscriptionProvider implements ITranscriptionProvider {
  readonly name = 'azure-gpt4o-transcribe';
  
  private config!: AzureGPT4oConfig;
  private configured: boolean = false;

  constructor(config?: AzureGPT4oConfig) {
    if (config) {
      this.configure(config);
    }
  }

  /**
   * Configure the provider with Azure credentials
   */
  configure(config: AzureGPT4oConfig): void {
    this.config = config;
    this.configured = !!(
      config.endpoint &&
      config.apiKey &&
      config.deploymentName &&
      config.apiVersion
    );

    if (this.configured) {
      logger.info('Azure GPT-4o Transcription provider configured', {
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
      supportsWordTimings: true, // GPT-4o supports word-level timings when requested
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
      // Simple connectivity check
      const url = `${this.config.endpoint}/openai/deployments?api-version=${this.config.apiVersion}`;
      const response = await axios.get(url, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        timeout: 5000,
      });
      return response.status === 200;
    } catch (error) {
      logger.warn('Azure GPT-4o health check failed', {
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
      throw new Error('Azure GPT-4o Transcription provider is not configured');
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

    logger.info('Starting Azure GPT-4o transcription', {
      audioPath,
      fileSizeMB: fileSizeMB.toFixed(2),
      language: options.language,
      deploymentName: this.config.deploymentName,
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
      
      // Add model name
      formData.append('model', this.config.deploymentName);
      
      // Request verbose_json format to get timestamps (same as Whisper)
      formData.append('response_format', 'verbose_json');
      
      // Request timestamp granularities - both word and segment level
      // Word-level timestamps are needed for accurate word-by-word captions
      formData.append('timestamp_granularities[]', 'word');
      formData.append('timestamp_granularities[]', 'segment');
      
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

      // Make the API request with Bearer token auth
      const response = await axios.post<GPT4oTranscriptionResponse>(url, formData, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          ...formData.getHeaders(),
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 300000, // 5 minutes timeout
      });

      const data = response.data;
      const processingTimeMs = Date.now() - startTime;

      // Log usage information
      if (data.usage) {
        logger.info('GPT-4o transcription usage', {
          totalTokens: data.usage.total_tokens,
          inputTokens: data.usage.input_tokens,
          outputTokens: data.usage.output_tokens,
          audioTokens: data.usage.input_token_details?.audio_tokens,
        });
      }

      // Parse segments from response
      // Prefer word-level timestamps for accurate word-by-word captions
      const segments: TranscriptionSegment[] = [];
      
      // Check if word-level timestamps are available (better for word-by-word mode)
      if (data.words && Array.isArray(data.words) && data.words.length > 0) {
        // Use word-level timestamps - each word becomes a segment
        logger.info('Using word-level timestamps from API', { wordCount: data.words.length });
        for (const wordData of data.words) {
          segments.push({
            start: wordData.start,
            end: wordData.end,
            text: wordData.word.trim(),
          });
        }
      } else if (data.segments && Array.isArray(data.segments) && data.segments.length > 0) {
        // Fall back to segment-level timestamps
        logger.info('Using segment-level timestamps from API', { segmentCount: data.segments.length });
        for (const seg of data.segments) {
          segments.push({
            start: seg.start,
            end: seg.end,
            text: seg.text.trim(),
          });
        }
      } else if (data.text) {
        // If no segments returned, create segments from the text
        logger.warn('No timestamps in API response, creating estimated segments');
        const estimatedDuration = await this.getAudioDuration(audioPath);
        
        // Split text into sentences and create approximate segments
        const sentences = this.splitIntoSentences(data.text);
        const durationPerSentence = estimatedDuration / Math.max(sentences.length, 1);
        
        let currentTime = 0;
        for (const sentence of sentences) {
          if (sentence.trim()) {
            segments.push({
              start: currentTime,
              end: currentTime + durationPerSentence,
              text: sentence.trim(),
            });
            currentTime += durationPerSentence;
          }
        }
      }

      logger.info('Azure GPT-4o transcription completed', {
        textLength: data.text?.length || 0,
        segmentCount: segments.length,
        hasWordTimestamps: !!(data.words && data.words.length > 0),
        hasSegmentTimestamps: !!(data.segments && data.segments.length > 0),
        language: data.language || options.language || 'auto',
        processingTimeMs,
      });

      // Get duration from segments or estimate
      const duration = segments.length > 0 
        ? segments[segments.length - 1].end 
        : await this.getAudioDuration(audioPath);

      return {
        text: data.text || '',
        segments,
        language: data.language || options.language || 'unknown',
        duration,
        provider: this.name,
        modelUsed: `azure/${this.config.deploymentName}`,
        processingTimeMs,
      };
    } catch (error) {
      const processingTimeMs = Date.now() - startTime;
      
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const errorData = error.response?.data;
        
        logger.error('Azure GPT-4o transcription failed', {
          status,
          error: errorData?.error?.message || error.message,
          processingTimeMs,
        });

        // Handle specific error codes
        if (status === 429) {
          throw new Error('Rate limit exceeded. Please retry after a moment.');
        }
        if (status === 401 || status === 403) {
          throw new Error('Azure GPT-4o authentication failed. Check API key.');
        }
        if (status === 413) {
          throw new Error('Audio file too large for Azure GPT-4o.');
        }

        throw new Error(
          `Azure GPT-4o transcription failed: ${errorData?.error?.message || error.message}`
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

  /**
   * Split text into sentences for segment creation
   */
  private splitIntoSentences(text: string): string[] {
    // Split on sentence-ending punctuation
    const sentences = text.split(/(?<=[.!?।。！？])\s+/);
    return sentences.filter(s => s.trim().length > 0);
  }

  /**
   * Get audio duration (estimate if not available)
   */
  private async getAudioDuration(audioPath: string): Promise<number> {
    try {
      // Try to get duration using ffprobe if available
      const { exec } = await import('child_process');
      const { promisify } = await import('util');
      const execAsync = promisify(exec);
      
      const { stdout } = await execAsync(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${audioPath}"`
      );
      const duration = parseFloat(stdout.trim());
      if (!isNaN(duration)) {
        return duration;
      }
    } catch {
      // ffprobe not available or failed, estimate based on file size
      logger.debug('Could not get audio duration with ffprobe, estimating');
    }
    
    // Estimate: ~128kbps average audio = ~16KB per second
    const stats = fs.statSync(audioPath);
    const estimatedDuration = stats.size / (16 * 1024);
    return Math.max(estimatedDuration, 1);
  }
}

export default AzureGPT4oTranscriptionProvider;
