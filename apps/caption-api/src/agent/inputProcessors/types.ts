/**
 * Input Processor Types
 * 
 * Based on Mastra's input processor architecture for building guardrails.
 * These processors intercept and validate user messages before they reach the AI agent.
 */

/**
 * Strategy for handling detected issues
 */
export enum ProcessorStrategy {
  /** Block the message entirely */
  BLOCK = 'block',
  /** Allow the message but add a warning */
  WARN = 'warn',
  /** Transform/redact the problematic content */
  REDACT = 'redact',
  /** Rewrite the message to be safe */
  REWRITE = 'rewrite',
  /** Allow the message unchanged */
  ALLOW = 'allow',
}

/**
 * Result from an input processor
 */
export interface ProcessorResult {
  /** Whether to allow the message to proceed */
  allowed: boolean;
  /** The (possibly modified) message content */
  content: string;
  /** Reason for blocking/modifying */
  reason?: string;
  /** Detected categories/issues */
  categories?: Record<string, number>;
  /** Warning to log/display */
  warning?: string;
  /** Name of processor that produced this result */
  processorName: string;
}

/**
 * Configuration for input processors
 */
export interface ProcessorConfig {
  /** Strategy to use when issue is detected */
  strategy?: ProcessorStrategy;
  /** Custom threshold for detection (0-1) */
  threshold?: number;
  /** Whether processor is enabled */
  enabled?: boolean;
}

/**
 * Base interface for all input processors
 */
export interface InputProcessor {
  /** Unique name for the processor */
  readonly name: string;
  
  /** Process an input message */
  process(content: string, context?: ProcessorContext): Promise<ProcessorResult>;
}

/**
 * Context passed to processors
 */
export interface ProcessorContext {
  /** User's phone number */
  userPhone: string;
  /** Current session ID */
  sessionId?: string;
  /** User's current state in the workflow */
  state?: string;
  /** Additional metadata */
  metadata?: Record<string, any>;
}

/**
 * Base abstract class for input processors
 */
export abstract class BaseInputProcessor implements InputProcessor {
  constructor(
    public readonly name: string,
    protected readonly config: ProcessorConfig = {}
  ) {
    // Set defaults
    this.config.enabled = config.enabled !== false; // Default: enabled
    this.config.strategy = config.strategy || ProcessorStrategy.BLOCK;
  }

  /**
   * Check if processor is enabled
   */
  protected isEnabled(): boolean {
    return this.config.enabled !== false;
  }

  /**
   * Get the configured strategy
   */
  protected getStrategy(): ProcessorStrategy {
    return this.config.strategy || ProcessorStrategy.BLOCK;
  }

  /**
   * Create a success result (content allowed)
   */
  protected allowContent(content: string, warning?: string): ProcessorResult {
    const result: ProcessorResult = {
      allowed: true,
      content,
      processorName: this.name,
    };
    if (warning !== undefined) {
      result.warning = warning;
    }
    return result;
  }

  /**
   * Create a block result
   */
  protected blockContent(
    reason: string,
    categories?: Record<string, number>
  ): ProcessorResult {
    const result: ProcessorResult = {
      allowed: false,
      content: '',
      reason,
      processorName: this.name,
    };
    if (categories !== undefined) {
      result.categories = categories;
    }
    return result;
  }

  /**
   * Create a warning result (allowed but flagged)
   */
  protected warnContent(
    content: string,
    warning: string,
    categories?: Record<string, number>
  ): ProcessorResult {
    const result: ProcessorResult = {
      allowed: true,
      content,
      warning,
      processorName: this.name,
    };
    if (categories !== undefined) {
      result.categories = categories;
    }
    return result;
  }

  /**
   * Create a redacted result
   */
  protected redactContent(
    content: string,
    reason: string,
    categories?: Record<string, number>
  ): ProcessorResult {
    const result: ProcessorResult = {
      allowed: true,
      content,
      reason,
      processorName: this.name,
    };
    if (categories !== undefined) {
      result.categories = categories;
    }
    return result;
  }

  abstract process(
    content: string,
    context?: ProcessorContext
  ): Promise<ProcessorResult>;
}
