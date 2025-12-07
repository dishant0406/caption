/**
 * Caption style and rendering type definitions
 */

// Caption position on video
export type CaptionPosition = 'TOP' | 'CENTER' | 'BOTTOM';

// Caption animation types
export type CaptionAnimation = 
  | 'NONE'          // Static text
  | 'FADE'          // Fade in/out
  | 'SLIDE_UP'      // Slide up from bottom
  | 'SLIDE_DOWN'    // Slide down from top
  | 'BOUNCE'        // Bouncy entrance
  | 'TYPEWRITER'    // Type character by character
  | 'WORD_BY_WORD'  // Reveal word by word
  | 'HIGHLIGHT';    // Highlight current word

// Text alignment
export type TextAlignment = 'LEFT' | 'CENTER' | 'RIGHT';

// Font weight
export type FontWeight = 'NORMAL' | 'BOLD' | 'LIGHT';

// Caption style configuration
export interface CaptionStyleConfig {
  styleId: string;
  name: string;
  description: string;
  
  // Font settings
  fontFamily: string;
  fontSize: number;            // In pixels (relative to 1080p)
  fontWeight: FontWeight;
  fontColor: string;           // Hex color
  
  // Background/outline
  backgroundColor?: string;    // Hex color with alpha
  backgroundPadding?: number;  // Padding around text
  backgroundBorderRadius?: number;
  outlineColor?: string;       // Text outline/stroke color
  outlineWidth?: number;       // Outline thickness
  
  // Shadow
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  
  // Position and alignment
  position: CaptionPosition;
  alignment: TextAlignment;
  marginBottom?: number;       // Distance from bottom (if position is BOTTOM)
  marginTop?: number;          // Distance from top (if position is TOP)
  maxWidth?: number;           // Max width as percentage of video width
  
  // Animation
  animation: CaptionAnimation;
  animationDuration?: number;  // milliseconds
  
  // Display options
  wordsPerLine?: number;       // Max words per line before wrap
  highlightColor?: string;     // For HIGHLIGHT animation
  
  // Preview
  previewImageUrl?: string;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
}

// Predefined style IDs
export type PredefinedStyleId = 
  | 'style_classic_white'
  | 'style_classic_black'
  | 'style_boxed_white'
  | 'style_boxed_black'
  | 'style_neon_green'
  | 'style_gradient_pop'
  | 'style_minimal'
  | 'style_bold_impact'
  | 'style_karaoke'
  | 'style_netflix';

// Render settings for FFmpeg
export interface RenderSettings {
  // Video output settings
  outputWidth: number;
  outputHeight: number;
  outputFps: number;
  outputBitrate: string;       // e.g., "5M" for 5 Mbps
  outputCodec: string;         // e.g., "libx264"
  outputFormat: string;        // e.g., "mp4"
  
  // Preview settings (lower quality)
  previewWidth: number;
  previewHeight: number;
  previewFps: number;
  previewBitrate: string;
  
  // Audio settings
  audioCodec: string;          // e.g., "aac"
  audioBitrate: string;        // e.g., "128k"
  audioSampleRate: number;     // e.g., 44100
}

// Caption data for rendering
export interface CaptionRenderData {
  startTime: number;           // seconds
  endTime: number;             // seconds
  text: string;
  wordTimings?: WordTiming[];  // For word-by-word animations
}

// Word timing for precise animations
export interface WordTiming {
  word: string;
  startTime: number;           // seconds
  endTime: number;             // seconds
}

// FFmpeg subtitle format (ASS/SSA)
export interface ASSSubtitleStyle {
  name: string;
  fontName: string;
  fontSize: number;
  primaryColor: string;        // ASS color format: &HAABBGGRR
  secondaryColor: string;
  outlineColor: string;
  backColor: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikeOut: boolean;
  scaleX: number;
  scaleY: number;
  spacing: number;
  angle: number;
  borderStyle: number;
  outline: number;
  shadow: number;
  alignment: number;           // ASS alignment (1-9)
  marginL: number;
  marginR: number;
  marginV: number;
  encoding: number;
}

// ASS dialogue event
export interface ASSDialogueEvent {
  layer: number;
  start: string;               // "H:MM:SS.cc" format
  end: string;
  style: string;
  name: string;
  marginL: number;
  marginR: number;
  marginV: number;
  effect: string;
  text: string;
}
