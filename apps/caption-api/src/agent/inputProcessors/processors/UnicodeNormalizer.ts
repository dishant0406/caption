import { BaseInputProcessor, ProcessorConfig, ProcessorContext, ProcessorResult } from '../types';

/**
 * UnicodeNormalizer Processor
 * 
 * Strips control characters and normalizes Unicode to:
 * - Reduce token count
 * - Prevent encoding-based attacks
 * - Normalize input for consistent processing
 * 
 * Based on Mastra's UnicodeNormalizer implementation.
 */
export class UnicodeNormalizer extends BaseInputProcessor {
  private readonly stripControlChars: boolean;
  private readonly normalizeForm: 'NFC' | 'NFD' | 'NFKC' | 'NFKD';

  constructor(config: ProcessorConfig & {
    stripControlChars?: boolean;
    normalizeForm?: 'NFC' | 'NFD' | 'NFKC' | 'NFKD';
  } = {}) {
    super('UnicodeNormalizer', config);
    this.stripControlChars = config.stripControlChars !== false; // Default: true
    this.normalizeForm = config.normalizeForm || 'NFC';
  }

  async process(content: string, _context?: ProcessorContext): Promise<ProcessorResult> {
    if (!this.isEnabled()) {
      return this.allowContent(content);
    }

    let normalized = content;

    // Strip control characters (except newlines, tabs, carriage returns)
    if (this.stripControlChars) {
      normalized = normalized.replace(
        /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g,
        ''
      );
    }

    // Normalize Unicode
    try {
      normalized = normalized.normalize(this.normalizeForm);
    } catch (error) {
      // If normalization fails, continue with stripped version
      console.warn('[UnicodeNormalizer] Failed to normalize Unicode:', error);
    }

    // Trim excessive whitespace
    normalized = normalized
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim();

    const hasChanges = normalized !== content;

    return this.allowContent(
      normalized,
      hasChanges ? 'Content was normalized and cleaned' : undefined
    );
  }
}
