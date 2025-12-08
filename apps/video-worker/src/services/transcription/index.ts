/**
 * Transcription Service
 * 
 * Main entry point for transcription functionality.
 * Uses the provider pattern for pluggable transcription services.
 */

import { logger } from '@/plugins/logger';

import {
  getTranscriptionFactory,
  getTranscriptionProvider,
  initializeTranscriptionProviders,
  TranscriptionOptions,
  TranscriptionResult,
  TranscriptionSegment
} from './providers';

// Re-export types from providers
export { TranscriptionOptions, TranscriptionResult, TranscriptionSegment } from './providers';

// Track initialization state
let isInitialized = false;

/**
 * Initialize the transcription service
 * Must be called before using transcription functions
 */
export function initializeTranscription(): void {
  if (isInitialized) {
    logger.debug('Transcription service already initialized');
    return;
  }

  initializeTranscriptionProviders();
  isInitialized = true;
  logger.info('Transcription service initialized');
}

/**
 * Transcribe audio file using the configured provider
 */
export async function transcribeAudio(
  audioPath: string,
  language?: string
): Promise<TranscriptionResult> {
  if (!isInitialized) {
    initializeTranscription();
  }

  const provider = getTranscriptionProvider();
  logger.info('Starting transcription', { 
    audioPath, 
    language,
    provider: provider.name,
  });

  try {
    const options: TranscriptionOptions = {
      language,
      responseFormat: 'verbose_json',
    };

    const result = await provider.transcribe(audioPath, options);

    logger.info('Transcription completed', {
      textLength: result.text.length,
      segmentCount: result.segments.length,
      language: result.language,
      provider: provider.name,
    });

    return result;
  } catch (error) {
    logger.error('Transcription failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      provider: provider.name,
    });
    throw error;
  }
}

/**
 * Format transcription segments into caption-friendly chunks
 * Splits long segments and ensures proper timing
 */
export function formatCaptionSegments(
  segments: TranscriptionSegment[],
  maxWordsPerLine: number = 8,
  maxCharsPerLine: number = 42
): TranscriptionSegment[] {
  const formattedSegments: TranscriptionSegment[] = [];

  for (const segment of segments) {
    const words = segment.text.split(' ');
    const segmentDuration = segment.end - segment.start;
    const wordDuration = segmentDuration / words.length;

    let currentLine = '';
    let currentLineWords: string[] = [];
    let lineStartTime = segment.start;

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const testLine = currentLine ? `${currentLine} ${word}` : word;

      // Check if we need to start a new line
      if (
        currentLineWords.length >= maxWordsPerLine ||
        testLine.length > maxCharsPerLine
      ) {
        if (currentLineWords.length > 0) {
          const lineEndTime = lineStartTime + currentLineWords.length * wordDuration;
          formattedSegments.push({
            start: lineStartTime,
            end: lineEndTime,
            text: currentLine,
          });
          lineStartTime = lineEndTime;
        }
        currentLine = word;
        currentLineWords = [word];
      } else {
        currentLine = testLine;
        currentLineWords.push(word);
      }
    }

    // Push remaining text
    if (currentLineWords.length > 0) {
      formattedSegments.push({
        start: lineStartTime,
        end: segment.end,
        text: currentLine,
      });
    }
  }

  return formattedSegments;
}

/**
 * Merge short segments to reduce caption flickering
 */
export function mergeShortSegments(
  segments: TranscriptionSegment[],
  minDuration: number = 1.0
): TranscriptionSegment[] {
  if (segments.length === 0) return [];

  const merged: TranscriptionSegment[] = [];
  let current = { ...segments[0] };

  for (let i = 1; i < segments.length; i++) {
    const next = segments[i];
    const currentDuration = current.end - current.start;

    // If current segment is too short and next segment is close, merge them
    if (currentDuration < minDuration && next.start - current.end < 0.5) {
      current.end = next.end;
      current.text = `${current.text} ${next.text}`;
    } else {
      merged.push(current);
      current = { ...next };
    }
  }

  merged.push(current);
  return merged;
}

/**
 * Apply highlight word effect by adding timing for each word
 */
export interface WordTiming {
  word: string;
  start: number;
  end: number;
}

export interface SegmentWithWordTimings extends TranscriptionSegment {
  words: WordTiming[];
}

export function generateWordTimings(
  segments: TranscriptionSegment[]
): SegmentWithWordTimings[] {
  return segments.map((segment) => {
    const words = segment.text.split(' ');
    const duration = segment.end - segment.start;
    const wordDuration = duration / words.length;

    return {
      ...segment,
      words: words.map((word, index) => ({
        word,
        start: segment.start + index * wordDuration,
        end: segment.start + (index + 1) * wordDuration,
      })),
    };
  });
}

/**
 * Get available transcription providers
 */
export function getAvailableProviders(): string[] {
  return getTranscriptionFactory().getAvailableProviders();
}

/**
 * Switch the active transcription provider
 */
export function switchProvider(providerName: string): void {
  getTranscriptionFactory().setActiveProvider(providerName);
  logger.info(`Switched transcription provider to: ${providerName}`);
}

/**
 * Health check all providers
 */
export async function healthCheckProviders(): Promise<Record<string, boolean>> {
  return getTranscriptionFactory().healthCheckAll();
}

/**
 * Transcribe audio with word-level timestamps
 * Uses the configured word-level provider (default: fal-whisper)
 * Best for word-by-word caption mode
 */
export async function transcribeAudioWithWordTimings(
  audioUrl: string,
  language?: string
): Promise<TranscriptionResult> {
  if (!isInitialized) {
    initializeTranscription();
  }

  // Get the word-level provider (fal-whisper by default)
  const factory = getTranscriptionFactory();
  let provider;
  
  try {
    // Try to get the word-level provider
    const wordProvider = factory.getProviderByName('fal-whisper');
    if (wordProvider && wordProvider.isConfigured()) {
      provider = wordProvider;
    } else {
      // Fall back to default provider
      provider = getTranscriptionProvider();
    }
  } catch {
    provider = getTranscriptionProvider();
  }

  logger.info('Starting word-level transcription', {
    audioUrl,
    language,
    provider: provider.name,
  });

  try {
    const options: TranscriptionOptions = {
      language,
      timestampGranularity: 'word',
    };

    const result = await provider.transcribe(audioUrl, options);

    logger.info('Word-level transcription completed', {
      textLength: result.text.length,
      segmentCount: result.segments.length,
      language: result.language,
      provider: provider.name,
    });

    return result;
  } catch (error) {
    logger.error('Word-level transcription failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      provider: provider.name,
    });
    throw error;
  }
}

// Export as default object for backwards compatibility
export default {
  initializeTranscription,
  transcribeAudio,
  transcribeAudioWithWordTimings,
  formatCaptionSegments,
  mergeShortSegments,
  generateWordTimings,
  getAvailableProviders,
  switchProvider,
  healthCheckProviders,
};
