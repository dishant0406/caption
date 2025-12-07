import type { CaptionSessionModel } from '@/models/CaptionSession';

/**
 * Intent Categories for Video Captioning Bot
 */
export enum IntentCategory {
  VIDEO_PROCESSING = 'VIDEO_PROCESSING',
  STYLE_SELECTION = 'STYLE_SELECTION',
  TRANSCRIPTION = 'TRANSCRIPTION',
  APPROVAL = 'APPROVAL',
  SESSION = 'SESSION',
  HELP = 'HELP',
  SUBSCRIPTION = 'SUBSCRIPTION',
}

/**
 * All Intent Types for Video Captioning
 */
export enum IntentType {
  // VIDEO PROCESSING INTENTS
  START_CAPTIONING = 'START_CAPTIONING',
  PROCESS_VIDEO = 'PROCESS_VIDEO',
  CHECK_VIDEO_STATUS = 'CHECK_VIDEO_STATUS',
  CANCEL_VIDEO_PROCESSING = 'CANCEL_VIDEO_PROCESSING',
  REPROCESS_VIDEO = 'REPROCESS_VIDEO',

  // STYLE SELECTION INTENTS
  VIEW_CAPTION_STYLES = 'VIEW_CAPTION_STYLES',
  SELECT_CAPTION_STYLE = 'SELECT_CAPTION_STYLE',
  PREVIEW_STYLE = 'PREVIEW_STYLE',
  CHANGE_STYLE = 'CHANGE_STYLE',
  CHANGE_CAPTION_MODE = 'CHANGE_CAPTION_MODE',

  // TRANSCRIPTION INTENTS
  VIEW_TRANSCRIPTION = 'VIEW_TRANSCRIPTION',
  EDIT_TRANSCRIPTION = 'EDIT_TRANSCRIPTION',
  CORRECT_TRANSCRIPTION = 'CORRECT_TRANSCRIPTION',
  CONVERT_TRANSCRIPT = 'CONVERT_TRANSCRIPT',
  REGENERATE_TRANSCRIPTION = 'REGENERATE_TRANSCRIPTION',

  // CHUNK APPROVAL INTENTS
  VIEW_CURRENT_CHUNK = 'VIEW_CURRENT_CHUNK',
  APPROVE_CHUNK = 'APPROVE_CHUNK',
  REJECT_CHUNK = 'REJECT_CHUNK',
  EDIT_CHUNK_CAPTION = 'EDIT_CHUNK_CAPTION',
  SKIP_TO_CHUNK = 'SKIP_TO_CHUNK',
  APPROVE_ALL_CHUNKS = 'APPROVE_ALL_CHUNKS',

  // FINAL RENDER INTENTS
  START_FINAL_RENDER = 'START_FINAL_RENDER',
  CHECK_RENDER_STATUS = 'CHECK_RENDER_STATUS',
  DOWNLOAD_VIDEO = 'DOWNLOAD_VIDEO',

  // SESSION MANAGEMENT INTENTS
  VIEW_SESSION_STATUS = 'VIEW_SESSION_STATUS',
  LIST_MY_SESSIONS = 'LIST_MY_SESSIONS',
  RESUME_SESSION = 'RESUME_SESSION',
  END_SESSION = 'END_SESSION',

  // HELP & SUPPORT INTENTS
  HELP = 'HELP',
  HOW_IT_WORKS = 'HOW_IT_WORKS',
  REPORT_ISSUE = 'REPORT_ISSUE',

  // SUBSCRIPTION INTENTS
  CHECK_USAGE = 'CHECK_USAGE',
  VIEW_SUBSCRIPTION = 'VIEW_SUBSCRIPTION',
  UPGRADE_SUBSCRIPTION = 'UPGRADE_SUBSCRIPTION',

  // CONFIRMATION INTENTS
  CONFIRM_ACTION = 'CONFIRM_ACTION',
  DENY_ACTION = 'DENY_ACTION',
}

/**
 * Intent metadata for tool descriptions
 */
export interface IntentMetadata {
  type: IntentType;
  category: IntentCategory;
  description: string;
  examples: string[];
  requiredEntities?: string[];
  optionalEntities?: string[];
}

/**
 * Agent context passed to all tools
 */
export interface AgentContext {
  session?: CaptionSessionModel;
  userPhone: string;
  sessionId?: string;
}

/**
 * Tool execution result
 */
export interface ToolResult {
  success: boolean;
  message: string;
  data?: unknown;
  requiresConfirmation?: boolean;
  nextAction?: string;
}

/**
 * Agent response structure
 */
export interface AgentResponse {
  text: string;
  toolsUsed: string[];
  toolResults: ToolResult[];
  sessionUpdated: boolean;
}

/**
 * Video processing state for session
 */
export enum VideoProcessingState {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  PROCESSING = 'PROCESSING',
  TRANSCRIBING = 'TRANSCRIBING',
  STYLE_SELECTION = 'STYLE_SELECTION',
  CHUNK_REVIEW = 'CHUNK_REVIEW',
  RENDERING = 'RENDERING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}
