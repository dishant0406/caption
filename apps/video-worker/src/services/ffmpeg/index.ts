import { getEnv } from '@/config';
import { logger } from '@/plugins/logger';
import { CaptionStyleConfig, RENDER_SETTINGS, VIDEO_PROCESSING, VideoMetadata } from '@caption/shared';
import ffmpeg from 'fluent-ffmpeg';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Set FFmpeg path if provided
const env = getEnv();
if (env.FFMPEG_PATH) {
  ffmpeg.setFfmpegPath(env.FFMPEG_PATH);
}
if (env.FFPROBE_PATH) {
  ffmpeg.setFfprobePath(env.FFPROBE_PATH);
}

/**
 * Get video metadata using ffprobe
 */
export async function getVideoMetadata(inputPath: string): Promise<VideoMetadata> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) {
        logger.error('Failed to get video metadata', { error: err.message });
        reject(err);
        return;
      }

      const videoStream = metadata.streams.find((s) => s.codec_type === 'video');
      const audioStream = metadata.streams.find((s) => s.codec_type === 'audio');

      if (!videoStream) {
        reject(new Error('No video stream found'));
        return;
      }

      // Calculate FPS from frame rate string (e.g., "30/1" or "30000/1001")
      let fps = 30;
      if (videoStream.r_frame_rate) {
        const parts = videoStream.r_frame_rate.split('/');
        if (parts.length === 2) {
          fps = parseInt(parts[0], 10) / parseInt(parts[1], 10);
        } else {
          fps = parseFloat(videoStream.r_frame_rate);
        }
      }

      resolve({
        duration: metadata.format.duration || 0,
        width: videoStream.width || 0,
        height: videoStream.height || 0,
        fps,
        codec: videoStream.codec_name || 'unknown',
        bitrate: metadata.format.bit_rate ? parseInt(String(metadata.format.bit_rate), 10) : 0,
        audioCodec: audioStream?.codec_name,
        fileSize: metadata.format.size || 0,
        mimeType: 'video/mp4', // Default to mp4, will be determined by extension
      });
    });
  });
}

/**
 * Extract audio from video for transcription
 */
export async function extractAudio(inputPath: string, outputDir: string): Promise<string> {
  const outputPath = path.join(outputDir, `${uuidv4()}.mp3`);

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioCodec('libmp3lame')
      .audioBitrate('128k')
      .audioFrequency(16000) // 16kHz for Whisper
      .audioChannels(1) // Mono for Whisper
      .output(outputPath)
      .on('start', (cmd) => logger.debug('FFmpeg extractAudio started', { cmd }))
      .on('end', () => {
        logger.debug('Audio extraction completed', { outputPath });
        resolve(outputPath);
      })
      .on('error', (err) => {
        logger.error('Audio extraction failed', { error: err.message });
        reject(err);
      })
      .run();
  });
}

/**
 * Split video into chunks of specified duration
 */
export async function splitVideoIntoChunks(
  inputPath: string,
  outputDir: string,
  chunkDuration: number = VIDEO_PROCESSING.MAX_CHUNK_DURATION
): Promise<string[]> {
  const metadata = await getVideoMetadata(inputPath);
  const totalDuration = metadata.duration;
  const chunks: string[] = [];

  const numChunks = Math.ceil(totalDuration / chunkDuration);

  for (let i = 0; i < numChunks; i++) {
    const startTime = i * chunkDuration;
    const outputPath = path.join(outputDir, `chunk_${i.toString().padStart(3, '0')}.mp4`);

    await new Promise<void>((resolve, reject) => {
      ffmpeg(inputPath)
        .setStartTime(startTime)
        .setDuration(Math.min(chunkDuration, totalDuration - startTime))
        .output(outputPath)
        .outputOptions(['-c copy', '-avoid_negative_ts make_zero'])
        .on('end', () => {
          logger.debug(`Chunk ${i} created`, { outputPath });
          chunks.push(outputPath);
          resolve();
        })
        .on('error', (err) => {
          logger.error(`Chunk ${i} creation failed`, { error: err.message });
          reject(err);
        })
        .run();
    });
  }

  return chunks;
}

/**
 * Generate low-res preview video
 */
export async function generatePreview(inputPath: string, outputDir: string): Promise<string> {
  const outputPath = path.join(outputDir, `preview_${uuidv4()}.mp4`);

  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .size(`${RENDER_SETTINGS.previewWidth}x?`)
      .videoBitrate(RENDER_SETTINGS.previewBitrate)
      .output(outputPath)
      .outputOptions(['-preset ultrafast', '-crf 28'])
      .on('end', () => {
        logger.debug('Preview generated', { outputPath });
        resolve(outputPath);
      })
      .on('error', (err) => {
        logger.error('Preview generation failed', { error: err.message });
        reject(err);
      })
      .run();
  });
}

/**
 * Caption mode type - 'word' for word-by-word TikTok style, 'sentence' for sentence chunks
 */
export type CaptionMode = 'word' | 'sentence';

/**
 * Timestamp offset in seconds to apply to captions.
 * Negative value = captions appear EARLIER (anticipate speech)
 * Positive value = captions appear LATER
 * 
 * Whisper/GPT-4o timestamps are typically ~0.2-0.3s late compared to when
 * people actually start speaking. Applying a negative offset makes captions
 * appear in sync with or slightly before the speech.
 */
const TIMESTAMP_OFFSET_SECONDS = -0.2; // Show captions 200ms earlier

/**
 * Generate ASS subtitle file content from caption data
 * @param captions - Array of caption segments with start, end, and text
 * @param style - Caption style configuration
 * @param videoWidth - Video width in pixels
 * @param videoHeight - Video height in pixels
 * @param captionMode - 'word' for word-by-word, 'sentence' for full sentences (default)
 */
export function generateAssSubtitle(
  captions: Array<{ start: number; end: number; text: string }>,
  style: CaptionStyleConfig,
  videoWidth: number,
  videoHeight: number,
  captionMode: CaptionMode = 'sentence'
): string {
  // Log incoming caption timestamps for debugging
  logger.info('📝 [generateAssSubtitle] Starting ASS generation', {
    captionMode,
    totalSegments: captions.length,
    videoWidth,
    videoHeight,
    styleName: style.name,
    timestampOffset: TIMESTAMP_OFFSET_SECONDS,
  });

  // Apply timestamp offset to fix sync issues (captions appearing late)
  // This shifts all captions earlier by the offset amount
  const adjustedCaptions = captions.map(c => ({
    ...c,
    start: Math.max(0, c.start + TIMESTAMP_OFFSET_SECONDS), // Don't go below 0
    end: Math.max(0.1, c.end + TIMESTAMP_OFFSET_SECONDS),   // Keep minimum duration
  }));

  // Log each caption segment's timestamps (showing both original and adjusted)
  logger.info('📝 [generateAssSubtitle] Caption timestamps (with offset applied):', {
    offset: TIMESTAMP_OFFSET_SECONDS,
    segments: adjustedCaptions.map((c, i) => ({
      index: i,
      text: c.text.substring(0, 30) + (c.text.length > 30 ? '...' : ''),
      originalStart: captions[i]?.start.toFixed(3),
      adjustedStart: c.start.toFixed(3),
      adjustedEnd: c.end.toFixed(3),
      duration: (c.end - c.start).toFixed(3),
    })),
  });

  const fontScale = videoHeight / 1080; // Scale based on 1080p reference
  const fontSize = Math.round(style.fontSize * fontScale);
  
  // Get margin based on position
  let marginV = 80; // Default margin
  if (style.position === 'BOTTOM' && style.marginBottom) {
    marginV = Math.round(style.marginBottom * fontScale);
  } else if (style.position === 'TOP' && style.marginTop) {
    marginV = Math.round(style.marginTop * fontScale);
  }

  // Convert hex color to ASS format (&HAABBGGRR)
  const hexToAss = (hex: string): string => {
    const r = hex.slice(1, 3);
    const g = hex.slice(3, 5);
    const b = hex.slice(5, 7);
    return `&H00${b}${g}${r}`;
  };

  const primaryColor = hexToAss(style.fontColor);
  const outlineColor = style.outlineColor ? hexToAss(style.outlineColor) : '&H00000000';
  const shadowColor = style.shadowColor ? hexToAss(style.shadowColor) : '&H80000000';

  // Determine if text should be bold
  const isBold = style.fontWeight === 'BOLD' ? 1 : 0;

  let ass = `[Script Info]
Title: Caption
ScriptType: v4.00+
PlayResX: ${videoWidth}
PlayResY: ${videoHeight}

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${style.fontFamily},${fontSize},${primaryColor},${primaryColor},${outlineColor},${shadowColor},${isBold},0,0,0,100,100,0,0,1,${style.outlineWidth || 2},${style.shadowOffsetX || 1},2,10,10,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  // Convert time to ASS format (H:MM:SS.CC)
  const timeToAss = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const cs = Math.floor((seconds % 1) * 100);
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
  };

  // Process based on caption mode - use adjustedCaptions for correct timing
  if (captionMode === 'word') {
    // Word-by-word mode: Split each segment into individual words
    // Each word gets its own timed subtitle event (TikTok style)
    adjustedCaptions.forEach((caption) => {
      const words = caption.text.trim().split(/\s+/).filter(w => w.length > 0);
      if (words.length === 0) return;

      const segmentDuration = caption.end - caption.start;
      const wordDuration = segmentDuration / words.length;

      words.forEach((word, wordIndex) => {
        const wordStart = caption.start + (wordIndex * wordDuration);
        const wordEnd = wordStart + wordDuration;
        
        const startTime = timeToAss(wordStart);
        const endTime = timeToAss(wordEnd);
        
        // Escape special characters
        const escapedWord = word.replace(/\n/g, '\\N').replace(/,/g, '\\,');
        ass += `Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,${escapedWord}\n`;
      });
    });
  } else {
    // Sentence mode: Show full sentences/segments (default YouTube style)
    adjustedCaptions.forEach((caption) => {
      const startTime = timeToAss(caption.start);
      const endTime = timeToAss(caption.end);
      // Escape special characters and add text
      const text = caption.text.replace(/\n/g, '\\N').replace(/,/g, '\\,');
      ass += `Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,${text}\n`;
    });
  }

  return ass;
}

/**
 * Burn captions into video using ASS subtitles
 */
export async function burnCaptions(
  inputPath: string,
  assPath: string,
  outputPath: string,
  isPreview: boolean = false
): Promise<string> {
  // Verify input file exists
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  // Verify ASS file exists
  if (!fs.existsSync(assPath)) {
    throw new Error(`ASS subtitle file not found: ${assPath}`);
  }

  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  logger.info('burnCaptions called', {
    inputPath,
    assPath,
    outputPath,
    isPreview,
    inputExists: fs.existsSync(inputPath),
    assExists: fs.existsSync(assPath),
    outputDirExists: fs.existsSync(outputDir),
  });

  return new Promise((resolve, reject) => {
    let command = ffmpeg(inputPath);

    // For the ass filter, use subtitles filter instead which handles paths better
    // Build the video filter string
    let vfString: string;
    
    if (isPreview) {
      // For preview: scale down first, then add subtitles
      // Use subtitles filter with force_style for compatibility
      vfString = `scale=${RENDER_SETTINGS.previewWidth}:-2,subtitles='${assPath.replace(/'/g, "'\\''").replace(/:/g, '\\:')}'`;
      command = command
        .outputOptions([
          '-preset ultrafast',
          '-crf 28',
          '-c:a aac',
          '-b:a 128k',
          `-vf`, vfString,
        ]);
    } else {
      // For final render: just add subtitles
      vfString = `subtitles='${assPath.replace(/'/g, "'\\''").replace(/:/g, '\\:')}'`;
      command = command
        .outputOptions([
          '-preset slow',
          '-crf 18',
          '-c:a copy',
          `-vf`, vfString,
        ]);
    }

    command
      .output(outputPath)
      .on('start', (cmd) => logger.info('Caption burn started', { cmd, vfString }))
      .on('progress', (progress) => {
        logger.debug('Caption burn progress', { percent: progress.percent });
      })
      .on('end', () => {
        logger.info('Caption burn completed', { outputPath });
        resolve(outputPath);
      })
      .on('error', (err, stdout, stderr) => {
        logger.error('Caption burn failed', { 
          error: err.message,
          stdout,
          stderr,
        });
        reject(err);
      })
      .run();
  });
}

/**
 * Concatenate multiple video chunks into final video
 */
export async function concatenateVideos(inputPaths: string[], outputPath: string): Promise<string> {
  // Create concat list file
  const listPath = path.join(path.dirname(outputPath), 'concat_list.txt');
  const listContent = inputPaths.map((p) => `file '${p}'`).join('\n');
  fs.writeFileSync(listPath, listContent);

  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(listPath)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions(['-c copy'])
      .output(outputPath)
      .on('end', () => {
        logger.info('Video concatenation completed', { outputPath });
        // Clean up list file
        fs.unlinkSync(listPath);
        resolve(outputPath);
      })
      .on('error', (err) => {
        logger.error('Video concatenation failed', { error: err.message });
        reject(err);
      })
      .run();
  });
}

/**
 * Generate thumbnail image from video
 */
export async function generateThumbnail(inputPath: string, outputPath: string, timestamp: number = 0): Promise<string> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .screenshots({
        timestamps: [timestamp],
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
        size: '320x?',
      })
      .on('end', () => {
        logger.debug('Thumbnail generated', { outputPath });
        resolve(outputPath);
      })
      .on('error', (err) => {
        logger.error('Thumbnail generation failed', { error: err.message });
        reject(err);
      });
  });
}

/**
 * Create temp directory for processing
 */
export function createTempDir(sessionId: string): string {
  const tempDir = path.join(env.TEMP_DIR, sessionId);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  return tempDir;
}

/**
 * Clean up temp directory
 */
export function cleanupTempDir(tempDir: string): void {
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    logger.debug('Cleaned up temp directory', { tempDir });
  }
}

export default {
  getVideoMetadata,
  extractAudio,
  splitVideoIntoChunks,
  generatePreview,
  generateAssSubtitle,
  burnCaptions,
  concatenateVideos,
  generateThumbnail,
  createTempDir,
  cleanupTempDir,
};
