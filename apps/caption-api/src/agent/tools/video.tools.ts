import { CaptionSession, VideoChunk } from '@/models';
import { logger } from '@/plugins/logger';
import { jobQueue } from '@/plugins/queue';
import {
  DEFAULT_CAPTION_STYLES,
  type RenderFinalJobPayload,
  type TranscriptSegment,
  type VideoUploadedJobPayload
} from '@caption/shared';
import { createTool } from '@mastra/core';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { INTENT_METADATA } from '../intents/metadata';
import { IntentType } from '../types';

/**
 * Video Processing Tools
 * These tools handle all video captioning operations
 */

export const processVideoTool = createTool({
  id: IntentType.PROCESS_VIDEO,
  description: INTENT_METADATA[IntentType.PROCESS_VIDEO].description,
  inputSchema: z.object({
    videoUrl: z.string().describe('URL of the video to process'),
    userPhone: z.string().describe('User phone number'),
    sessionId: z.string().describe('Current session ID'),
  }),
  outputSchema: z.object({
    message: z.string(),
    jobId: z.string().optional(),
    sessionId: z.string().optional(),
  }),
  execute: async ({ context }) => {
    const { videoUrl, userPhone, sessionId } = context;

    logger.info('[TOOL CALLED] processVideoTool', {
      toolId: IntentType.PROCESS_VIDEO,
      input: { videoUrl, userPhone, sessionId },
    });

    try {
      const jobId = uuidv4();

      // Create job payload matching VideoUploadedJobPayload
      const job: VideoUploadedJobPayload = {
        jobId,
        jobType: 'VIDEO_UPLOADED',
        sessionId,
        userPhone,
        priority: 'NORMAL',
        attempts: 0,
        maxAttempts: 3,
        createdAt: new Date().toISOString(),
        data: {
          videoUrl,
          videoDuration: 0, // Will be determined by worker
          videoSize: 0, // Will be determined by worker
          mimeType: 'video/mp4',
        },
      };

      // Publish video upload job to the worker
      await jobQueue.publishJob(job);

      logger.info('[TOOL SUCCESS] processVideoTool', { jobId, sessionId });

      return {
        message: `🎬 Video received! Processing has started.\n\nI'll split your video into chunks and transcribe each part. This may take a few minutes depending on the video length.\n\nI'll notify you when it's ready for review.`,
        jobId,
        sessionId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to process video';
      logger.error('[TOOL ERROR] processVideoTool', error instanceof Error ? error : new Error(String(error)));

      return {
        message: `❌ Failed to start video processing: ${errorMessage}`,
      };
    }
  },
});

export const viewCaptionStylesTool = createTool({
  id: IntentType.VIEW_CAPTION_STYLES,
  description: INTENT_METADATA[IntentType.VIEW_CAPTION_STYLES].description,
  inputSchema: z.object({
    userPhone: z.string().describe('User phone number'),
  }),
  outputSchema: z.object({
    message: z.string(),
    styles: z.array(z.object({
      id: z.string(),
      name: z.string(),
      description: z.string(),
    })).optional(),
  }),
  execute: async ({ context }) => {
    const { userPhone } = context;

    logger.info('[TOOL CALLED] viewCaptionStylesTool', {
      toolId: IntentType.VIEW_CAPTION_STYLES,
      input: { userPhone },
    });

    try {
      const styleList = DEFAULT_CAPTION_STYLES
        .filter(style => style.isActive)
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((style) => ({
          id: style.styleId,
          name: style.name,
          description: style.description || '',
        }));

      const styleMessage = styleList
        .map((s, i) => `${i + 1}. *${s.name}*\n   ${s.description}`)
        .join('\n\n');

      logger.info('[TOOL SUCCESS] viewCaptionStylesTool', { styleCount: styleList.length });

      return {
        message: `🎨 *Available Caption Styles:*\n\n${styleMessage}\n\n💡 Reply with the style number or name to select it.`,
        styles: styleList,
      };
    } catch (error) {
      logger.error('[TOOL ERROR] viewCaptionStylesTool', error instanceof Error ? error : new Error(String(error)));
      return {
        message: '❌ Failed to retrieve caption styles.',
      };
    }
  },
});

export const selectCaptionStyleTool = createTool({
  id: IntentType.SELECT_CAPTION_STYLE,
  description: INTENT_METADATA[IntentType.SELECT_CAPTION_STYLE].description,
  inputSchema: z.object({
    styleId: z.string().describe('Style ID, number, or combined format like "1A" (style + mode)'),
    userPhone: z.string().describe('User phone number'),
    sessionId: z.string().describe('Current session ID'),
  }),
  outputSchema: z.object({
    message: z.string(),
    selectedStyle: z.string().optional(),
    captionMode: z.string().optional(),
    jobsQueued: z.number().optional(),
  }),
  execute: async ({ context }) => {
    const { styleId, userPhone, sessionId } = context;

    logger.info('[TOOL CALLED] selectCaptionStyleTool', {
      toolId: IntentType.SELECT_CAPTION_STYLE,
      input: { styleId, userPhone, sessionId },
    });

    try {
      // Parse combined format like "1A", "2B", "3a", etc.
      let styleInput = styleId.trim();
      let captionMode: 'word' | 'sentence' = 'sentence'; // Default to sentence
      
      // Check for combined format (e.g., "1A", "2B")
      const combinedMatch = styleInput.match(/^(\d+)([AaBb])$/);
      if (combinedMatch && combinedMatch[1] && combinedMatch[2]) {
        styleInput = combinedMatch[1]; // Extract the number
        const modeChar = combinedMatch[2].toUpperCase();
        captionMode = modeChar === 'A' ? 'word' : 'sentence';
      } else if (styleInput.toLowerCase() === 'a' || styleInput.toLowerCase() === 'word') {
        // Just mode selection without style - ask for style
        return {
          message: '❌ Please include a style number. E.g., "1A" for Classic White + Word-by-word',
        };
      } else if (styleInput.toLowerCase() === 'b' || styleInput.toLowerCase() === 'sentence') {
        return {
          message: '❌ Please include a style number. E.g., "2B" for Bold Yellow + Sentence chunks',
        };
      }

      // Find style by ID
      let selectedStyle = DEFAULT_CAPTION_STYLES.find(s => s.styleId === styleInput);
      let selectedStyleId = styleInput;

      if (!selectedStyle) {
        // Try to find by number (1-based index)
        const styleIndex = parseInt(styleInput) - 1;
        const activeStyles = DEFAULT_CAPTION_STYLES
          .filter(s => s.isActive)
          .sort((a, b) => a.sortOrder - b.sortOrder);
        
        if (styleIndex >= 0 && styleIndex < activeStyles.length) {
          const foundStyle = activeStyles[styleIndex];
          if (foundStyle) {
            selectedStyle = foundStyle;
            selectedStyleId = foundStyle.styleId;
          }
        }
      }

      if (!selectedStyle) {
        // Try to find by name (case-insensitive)
        selectedStyle = DEFAULT_CAPTION_STYLES.find(
          s => s.name.toLowerCase().includes(styleInput.toLowerCase())
        );
        if (selectedStyle) {
          selectedStyleId = selectedStyle.styleId;
        }
      }

      if (!selectedStyle) {
        return {
          message: `❌ Style "${styleInput}" not found. Please reply with style + mode (e.g., "1A" or "2B").`,
        };
      }

      // Get session from database
      const session = await CaptionSession.findOne({ where: { sessionId } });
      if (!session) {
        return {
          message: '❌ Session not found. Please start a new video processing session.',
        };
      }

      // Get all chunks for this session
      const chunks = await VideoChunk.findAll({
        where: { sessionId },
        order: [['chunkIndex', 'ASC']],
      });

      if (chunks.length === 0) {
        return {
          message: '❌ No video chunks found. Please wait for video processing to complete.',
        };
      }

      // Update session with selected style, caption mode, and set to TRANSCRIBING
      await session.update({
        selectedStyleId,
        captionMode,
        status: 'TRANSCRIBING',
        currentChunkIndex: 0,
      });

      // SEQUENTIAL FLOW: Only queue transcription for the FIRST chunk (chunk 0)
      // After approval, the next chunk will be processed
      const firstChunk = chunks[0];
      
      if (!firstChunk) {
        return {
          message: '❌ No chunks found for processing.',
        };
      }
      
      // Queue TRANSCRIBE_CHUNK job for chunk 0 only
      const transcribeJob = {
        jobId: uuidv4(),
        jobType: 'TRANSCRIBE_CHUNK' as const,
        sessionId,
        userPhone,
        priority: 'NORMAL' as const,
        attempts: 0,
        maxAttempts: 3,
        createdAt: new Date().toISOString(),
        data: {
          chunkId: firstChunk.chunkId,
          chunkUrl: firstChunk.chunkUrl,
          chunkIndex: firstChunk.chunkIndex,
          startTime: firstChunk.startTime,
          endTime: firstChunk.endTime,
        },
      };

      await jobQueue.publishJob(transcribeJob);
      await firstChunk.update({ status: 'TRANSCRIBING' });

      logger.info('📤 TRANSCRIBE_CHUNK job queued for first chunk (sequential flow)', {
        jobId: transcribeJob.jobId,
        sessionId,
        chunkIndex: 0,
        totalChunks: chunks.length,
      });

      logger.info('[TOOL SUCCESS] selectCaptionStyleTool', {
        selectedStyleId,
        styleName: selectedStyle.name,
        sequentialFlow: true,
      });

      return {
        message: `✅ Selected style: *${selectedStyle.name}*\n\n🎬 Processing chunk 1 of ${chunks.length}...\n\nI'll send you the preview for approval shortly.`,
        selectedStyle: selectedStyleId,
        jobsQueued: 1,
      };
    } catch (error) {
      logger.error('[TOOL ERROR] selectCaptionStyleTool', error instanceof Error ? error : new Error(String(error)));
      return {
        message: '❌ Failed to select caption style.',
      };
    }
  },
});

export const approveChunkTool = createTool({
  id: IntentType.APPROVE_CHUNK,
  description: INTENT_METADATA[IntentType.APPROVE_CHUNK].description,
  inputSchema: z.object({
    userPhone: z.string().describe('User phone number'),
    sessionId: z.string().describe('Current session ID'),
  }),
  outputSchema: z.object({
    message: z.string(),
    nextChunk: z.number().optional(),
    isComplete: z.boolean().optional(),
    jobQueued: z.boolean().optional(),
  }),
  execute: async ({ context }) => {
    const { userPhone, sessionId } = context;

    logger.info('[TOOL CALLED] approveChunkTool', {
      toolId: IntentType.APPROVE_CHUNK,
      input: { userPhone, sessionId },
    });

    try {
      // Get session - ALWAYS read currentChunkIndex from DB, not from LLM
      const session = await CaptionSession.findOne({ where: { sessionId } });
      if (!session) {
        return { message: '❌ Session not found.' };
      }

      // Get the ACTUAL current chunk index from the database
      const chunkIndex = session.currentChunkIndex;

      // Get all chunks
      const chunks = await VideoChunk.findAll({
        where: { sessionId },
        order: [['chunkIndex', 'ASC']],
      });

      // Find and approve current chunk
      const currentChunk = chunks.find(c => c.chunkIndex === chunkIndex);
      if (currentChunk) {
        await currentChunk.update({ userApproved: true, status: 'APPROVED' });
        logger.info('Approved chunk', { chunkIndex, chunkId: currentChunk.chunkId });
      } else {
        logger.warn('Current chunk not found for approval', { chunkIndex, sessionId });
      }

      const totalChunks = chunks.length;
      const nextChunkIndex = chunkIndex + 1;

      // Check if this was the last chunk
      if (nextChunkIndex >= totalChunks) {
        // All chunks approved - ready for final render
        await session.update({ 
          status: 'REVIEWING',
          currentChunkIndex: nextChunkIndex,
        });

        logger.info('[TOOL SUCCESS] approveChunkTool - all chunks approved', {
          sessionId,
          totalChunks,
        });

        return {
          message: `✅ Chunk ${chunkIndex + 1} approved!\n\n🎉 All ${totalChunks} chunks have been reviewed!\n\nReady to render the final video with captions?\n\nReply "render" to start or "cancel" to cancel session.`,
          isComplete: true,
        };
      }

      // SEQUENTIAL FLOW: Queue transcription for the NEXT chunk
      // The transcription will auto-queue preview generation,
      // which will auto-send the preview to the user
      const nextChunk = chunks.find(c => c.chunkIndex === nextChunkIndex);
      
      if (!nextChunk) {
        return { message: '❌ Next chunk not found.' };
      }

      // Update session
      await session.update({ 
        status: 'TRANSCRIBING',
        currentChunkIndex: nextChunkIndex,
      });

      // Queue TRANSCRIBE_CHUNK job for next chunk
      const transcribeJob = {
        jobId: uuidv4(),
        jobType: 'TRANSCRIBE_CHUNK' as const,
        sessionId,
        userPhone,
        priority: 'NORMAL' as const,
        attempts: 0,
        maxAttempts: 3,
        createdAt: new Date().toISOString(),
        data: {
          chunkId: nextChunk.chunkId,
          chunkUrl: nextChunk.chunkUrl,
          chunkIndex: nextChunk.chunkIndex,
          startTime: nextChunk.startTime,
          endTime: nextChunk.endTime,
        },
      };

      await jobQueue.publishJob(transcribeJob);
      await nextChunk.update({ status: 'TRANSCRIBING' });

      logger.info('[TOOL SUCCESS] approveChunkTool - queued next chunk transcription', {
        chunkIndex,
        nextChunkIndex,
        jobId: transcribeJob.jobId,
        totalChunks,
      });

      return {
        message: `✅ Chunk ${chunkIndex + 1} approved!\n\n🎬 Processing chunk ${nextChunkIndex + 1} of ${totalChunks}...\n\nI'll send you the preview shortly.`,
        nextChunk: nextChunkIndex,
        isComplete: false,
        jobQueued: true,
      };
    } catch (error) {
      logger.error('[TOOL ERROR] approveChunkTool', error instanceof Error ? error : new Error(String(error)));
      return {
        message: '❌ Failed to approve chunk.',
      };
    }
  },
});

export const rejectChunkTool = createTool({
  id: IntentType.REJECT_CHUNK,
  description: INTENT_METADATA[IntentType.REJECT_CHUNK].description,
  inputSchema: z.object({
    userPhone: z.string().describe('User phone number'),
    sessionId: z.string().describe('Current session ID'),
  }),
  outputSchema: z.object({
    message: z.string(),
    jobQueued: z.boolean().optional(),
  }),
  execute: async ({ context }) => {
    const { userPhone, sessionId } = context;

    logger.info('[TOOL CALLED] rejectChunkTool', {
      toolId: IntentType.REJECT_CHUNK,
      input: { userPhone, sessionId },
    });

    try {
      // Get session - ALWAYS read currentChunkIndex from DB, not from LLM
      const session = await CaptionSession.findOne({ where: { sessionId } });
      if (!session) {
        return { message: '❌ Session not found.' };
      }

      // Get the ACTUAL current chunk index from the database
      const chunkIndex = session.currentChunkIndex;

      // Get the chunk to reject
      const chunk = await VideoChunk.findOne({ 
        where: { sessionId, chunkIndex } 
      });
      
      if (!chunk) {
        return { message: '❌ Chunk not found.' };
      }

      // Update chunk status and increment reprocess count
      await chunk.update({ 
        status: 'REPROCESSING',
        userApproved: false,
        reprocessCount: chunk.reprocessCount + 1,
        transcript: null,  // Clear transcript for re-processing
        previewUrl: null,  // Clear preview
      });

      // Queue a new transcription job for this chunk
      const transcribeJob = {
        jobId: uuidv4(),
        jobType: 'TRANSCRIBE_CHUNK' as const,
        sessionId,
        userPhone,
        priority: 'HIGH' as const,
        attempts: 0,
        maxAttempts: 3,
        createdAt: new Date().toISOString(),
        data: {
          chunkId: chunk.chunkId,
          chunkUrl: chunk.chunkUrl,
          chunkIndex: chunk.chunkIndex,
          startTime: chunk.startTime,
          endTime: chunk.endTime,
        },
      };

      await jobQueue.publishJob(transcribeJob);

      logger.info('[TOOL SUCCESS] rejectChunkTool - queued retranscription', {
        chunkIndex,
        jobId: transcribeJob.jobId,
        reprocessCount: chunk.reprocessCount + 1,
      });

      return {
        message: `🔄 Re-transcribing chunk ${chunkIndex + 1}...\n\nI'll send you a new preview once it's ready. This may take a minute.`,
        jobQueued: true,
      };
    } catch (error) {
      logger.error('[TOOL ERROR] rejectChunkTool', error instanceof Error ? error : new Error(String(error)));
      return {
        message: '❌ Failed to reject chunk.',
      };
    }
  },
});

export const startFinalRenderTool = createTool({
  id: IntentType.START_FINAL_RENDER,
  description: INTENT_METADATA[IntentType.START_FINAL_RENDER].description,
  inputSchema: z.object({
    userPhone: z.string().describe('User phone number'),
    sessionId: z.string().describe('Current session ID'),
  }),
  outputSchema: z.object({
    message: z.string(),
    jobId: z.string().optional(),
  }),
  execute: async ({ context }) => {
    const { userPhone, sessionId } = context;

    logger.info('[TOOL CALLED] startFinalRenderTool', {
      toolId: IntentType.START_FINAL_RENDER,
      input: { userPhone, sessionId },
    });

    try {
      // Get session from database
      const session = await CaptionSession.findOne({ where: { sessionId } });
      if (!session) {
        return { message: '❌ Session not found.' };
      }

      if (!session.selectedStyleId) {
        return { message: '❌ No caption style selected. Please select a style first.' };
      }

      // Get all approved chunks
      const chunks = await VideoChunk.findAll({
        where: { sessionId },
        order: [['chunkIndex', 'ASC']],
      });

      // Build chunks data for render job
      const approvedChunks: Array<{
        chunkId: string;
        chunkIndex: number;
        startTime: number;
        endTime: number;
        transcript: TranscriptSegment[];
      }> = chunks.map(chunk => ({
        chunkId: chunk.chunkId,
        chunkIndex: chunk.chunkIndex,
        startTime: chunk.startTime,
        endTime: chunk.endTime,
        transcript: chunk.transcript ? JSON.parse(chunk.transcript as string) : [],
      }));

      const jobId = uuidv4();

      // Create job payload matching RenderFinalJobPayload
      const job: RenderFinalJobPayload = {
        jobId,
        jobType: 'RENDER_FINAL',
        sessionId,
        userPhone,
        priority: 'HIGH',
        attempts: 0,
        maxAttempts: 3,
        createdAt: new Date().toISOString(),
        data: {
          originalVideoUrl: session.originalVideoUrl,
          chunks: approvedChunks,
          styleId: session.selectedStyleId,
          outputFormat: 'mp4',
        },
      };

      // Update session status
      await session.update({ status: 'RENDERING' });

      // Publish final render job
      await jobQueue.publishJob(job);

      logger.info('[TOOL SUCCESS] startFinalRenderTool', { jobId, sessionId });

      return {
        message: `🎬 *Final render started!*\n\nI'm creating your HD video with beautiful captions. This may take a few minutes.\n\n⏳ Please wait, I'll send the video when it's ready.`,
        jobId,
      };
    } catch (error) {
      logger.error('[TOOL ERROR] startFinalRenderTool', error instanceof Error ? error : new Error(String(error)));
      return {
        message: '❌ Failed to start final render.',
      };
    }
  },
});

export const correctTranscriptionTool = createTool({
  id: IntentType.CORRECT_TRANSCRIPTION,
  description: INTENT_METADATA[IntentType.CORRECT_TRANSCRIPTION].description,
  inputSchema: z.object({
    correctedText: z.string().describe('The corrected transcription text from user'),
    userPhone: z.string().describe('User phone number'),
    sessionId: z.string().describe('Current session ID'),
  }),
  outputSchema: z.object({
    message: z.string(),
    jobQueued: z.boolean().optional(),
  }),
  execute: async ({ context }) => {
    const { correctedText, userPhone, sessionId } = context;

    logger.info('[TOOL CALLED] correctTranscriptionTool', {
      toolId: IntentType.CORRECT_TRANSCRIPTION,
      input: { correctedText: correctedText.substring(0, 50) + '...', userPhone, sessionId },
    });

    try {
      // Get session - read currentChunkIndex from DB
      const session = await CaptionSession.findOne({ where: { sessionId } });
      if (!session) {
        return { message: '❌ Session not found.' };
      }

      // Get the current chunk index from database
      const chunkIndex = session.currentChunkIndex;

      // Get the chunk to correct
      const chunk = await VideoChunk.findOne({ 
        where: { sessionId, chunkIndex } 
      });
      
      if (!chunk) {
        return { message: '❌ Chunk not found.' };
      }

      // Parse the original transcript to get timestamps
      let originalTranscript: TranscriptSegment[] = [];
      try {
        originalTranscript = chunk.transcript ? JSON.parse(chunk.transcript as string) : [];
      } catch (e) {
        logger.warn('Failed to parse original transcript', { chunkId: chunk.chunkId });
      }

      // If no original transcript, we can't align timestamps
      if (originalTranscript.length === 0) {
        return { 
          message: '❌ No original transcript found to align timestamps. Please reject and re-transcribe instead.' 
        };
      }

      // Get the total time span from the original transcript
      const firstSegment = originalTranscript[0];
      const lastSegment = originalTranscript[originalTranscript.length - 1];
      const startTime = firstSegment?.start ?? 0;
      const endTime = lastSegment?.end ?? (chunk.endTime - chunk.startTime);
      const totalDuration = endTime - startTime;

      // Split the corrected text into words
      const correctedWords = correctedText.trim().split(/\s+/).filter(w => w.length > 0);
      
      if (correctedWords.length === 0) {
        return { message: '❌ Please provide the corrected text.' };
      }

      // Create new transcript segments by distributing words across the time span
      // This preserves the original timing but uses the corrected text
      const newTranscript: TranscriptSegment[] = [];
      const wordDuration = totalDuration / correctedWords.length;

      correctedWords.forEach((word, index) => {
        const wordStart = startTime + (index * wordDuration);
        const wordEnd = wordStart + wordDuration;
        
        newTranscript.push({
          id: index,
          text: word,
          start: Number(wordStart.toFixed(3)),
          end: Number(wordEnd.toFixed(3)),
        });
      });

      // Update the chunk with corrected transcript
      await chunk.update({
        transcript: JSON.stringify(newTranscript),
        status: 'GENERATING_PREVIEW',
        reprocessCount: chunk.reprocessCount + 1,
        previewUrl: null, // Clear old preview
      });

      // Queue GENERATE_PREVIEW job with the corrected transcript
      const previewJobId = uuidv4();
      const previewJob = {
        jobId: previewJobId,
        jobType: 'GENERATE_PREVIEW' as const,
        sessionId,
        userPhone,
        priority: 'HIGH' as const,
        attempts: 0,
        maxAttempts: 3,
        createdAt: new Date().toISOString(),
        data: {
          chunkId: chunk.chunkId,
          chunkUrl: chunk.chunkUrl,
          chunkIndex: chunk.chunkIndex,
          transcript: newTranscript,
          styleId: session.selectedStyleId || 'classic-white',
          captionMode: session.captionMode || 'sentence',
        },
      };

      await jobQueue.publishJob(previewJob);

      logger.info('[TOOL SUCCESS] correctTranscriptionTool - queued preview with corrected transcript', {
        chunkIndex,
        jobId: previewJobId,
        originalWordCount: originalTranscript.length,
        correctedWordCount: correctedWords.length,
      });

      return {
        message: `✏️ Transcript corrected!\n\n🎬 Regenerating preview with your corrections...\n\nI'll send you the updated preview shortly.`,
        jobQueued: true,
      };
    } catch (error) {
      logger.error('[TOOL ERROR] correctTranscriptionTool', error instanceof Error ? error : new Error(String(error)));
      return {
        message: '❌ Failed to correct transcription.',
      };
    }
  },
});

export const convertTranscriptTool = createTool({
  id: IntentType.CONVERT_TRANSCRIPT,
  description: INTENT_METADATA[IntentType.CONVERT_TRANSCRIPT].description,
  inputSchema: z.object({
    conversionType: z.string().describe('The type of conversion requested (e.g., "Hinglish", "English", "casual", "formal")'),
    userPhone: z.string().describe('User phone number'),
    sessionId: z.string().describe('Current session ID'),
  }),
  outputSchema: z.object({
    message: z.string(),
    convertedText: z.string().optional(),
    jobQueued: z.boolean().optional(),
  }),
  execute: async ({ context }) => {
    const { conversionType, userPhone, sessionId } = context;

    logger.info('[TOOL CALLED] convertTranscriptTool', {
      toolId: IntentType.CONVERT_TRANSCRIPT,
      input: { conversionType, userPhone, sessionId },
    });

    try {
      // Get session - read currentChunkIndex from DB
      const session = await CaptionSession.findOne({ where: { sessionId } });
      if (!session) {
        logger.warn('[convertTranscriptTool] Session not found: ' + sessionId);
        return { message: '❌ Session not found.' };
      }

      // Get the current chunk index from database
      const chunkIndex = session.currentChunkIndex;
      logger.info('[convertTranscriptTool] Got session: ' + sessionId + ', chunkIndex: ' + chunkIndex);

      // Get the chunk to convert
      const chunk = await VideoChunk.findOne({ 
        where: { sessionId, chunkIndex } 
      });
      
      if (!chunk) {
        logger.warn('[convertTranscriptTool] Chunk not found for session: ' + sessionId + ', chunkIndex: ' + chunkIndex);
        return { message: '❌ Chunk not found.' };
      }

      logger.info('[convertTranscriptTool] Got chunk: ' + chunk.chunkId);

      // Parse the original transcript
      let originalTranscript: TranscriptSegment[] = [];
      try {
        originalTranscript = chunk.transcript ? JSON.parse(chunk.transcript as string) : [];
      } catch (e) {
        logger.warn('[convertTranscriptTool] Failed to parse original transcript for chunk: ' + chunk.chunkId);
      }

      if (originalTranscript.length === 0) {
        logger.warn('[convertTranscriptTool] No transcript found for chunk: ' + chunk.chunkId);
        return { 
          message: '❌ No transcript found to convert. Please wait for transcription to complete.' 
        };
      }

      // Get the full text from transcript
      const originalText = originalTranscript
        .map(seg => seg.text)
        .join(' ')
        .trim();

      if (!originalText) {
        logger.warn('[convertTranscriptTool] Transcript is empty for chunk: ' + chunk.chunkId);
        return { message: '❌ Transcript is empty.' };
      }

      logger.info('[convertTranscriptTool] Original text ready, length: ' + originalText.length);

      // Build the conversion prompt
      const conversionPrompt = buildConversionPrompt(conversionType, originalText);

      logger.info('[convertTranscriptTool] Calling LLM for conversion type: ' + conversionType);

      // Use Azure OpenAI REST API directly to avoid AI SDK version compatibility issues
      let convertedText: string | undefined;
      try {
        // Get Azure credentials from environment
        const envModule = await import('@/config/env');
        const endpoint = envModule.env.AZURE_OPENAI_ENDPOINT;
        const apiKey = envModule.env.AZURE_OPENAI_API_KEY;
        const deployment = envModule.env.AZURE_OPENAI_DEPLOYMENT;
        
        if (!endpoint || !apiKey || !deployment) {
          logger.error('[convertTranscriptTool] Azure OpenAI not configured');
          return { message: '❌ AI service not configured. Please contact support.' };
        }

        // Build Azure OpenAI API URL
        const apiUrl = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=2024-02-15-preview`;
        
        logger.info('[convertTranscriptTool] Calling Azure OpenAI: ' + deployment);

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': apiKey,
          },
          body: JSON.stringify({
            messages: [
              {
                role: 'system',
                content: 'You are a helpful assistant that converts text as requested. Only output the converted text, nothing else. Preserve the meaning and flow of the original text.',
              },
              {
                role: 'user',
                content: conversionPrompt,
              },
            ],
            max_tokens: 1000,
            temperature: 0.3,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          logger.error('[convertTranscriptTool] Azure API error: ' + response.status + ' - ' + errorText);
          return { message: '❌ Failed to convert transcript. AI service error. Please try again.' };
        }

        const data = await response.json() as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        
        convertedText = data.choices?.[0]?.message?.content?.trim();
        logger.info('[convertTranscriptTool] LLM response received, text length: ' + (convertedText?.length || 0));
      } catch (llmError) {
        logger.error('[convertTranscriptTool] LLM call failed', llmError instanceof Error ? llmError : new Error(String(llmError)));
        return { message: '❌ Failed to convert transcript. AI service error. Please try again.' };
      }

      if (!convertedText) {
        logger.warn('[convertTranscriptTool] LLM returned empty text');
        return { message: '❌ Failed to convert transcript. Please try again.' };
      }

      logger.info('[convertTranscriptTool] LLM conversion completed. Original: ' + originalText.length + ' chars, Converted: ' + convertedText.length + ' chars');

      // Get timing info from original transcript
      const firstSegment = originalTranscript[0];
      const lastSegment = originalTranscript[originalTranscript.length - 1];
      const startTime = firstSegment?.start ?? 0;
      const endTime = lastSegment?.end ?? (chunk.endTime - chunk.startTime);
      const totalDuration = endTime - startTime;

      // Split converted text into words and distribute timing
      const convertedWords: string[] = convertedText.split(/\s+/).filter((w: string) => w.length > 0);
      
      if (convertedWords.length === 0) {
        return { message: '❌ Conversion resulted in empty text.' };
      }

      const wordDuration = totalDuration / convertedWords.length;
      const newTranscript: TranscriptSegment[] = [];

      convertedWords.forEach((word: string, index: number) => {
        const wordStart = startTime + (index * wordDuration);
        const wordEnd = wordStart + wordDuration;
        
        newTranscript.push({
          id: index,
          text: word,
          start: Number(wordStart.toFixed(3)),
          end: Number(wordEnd.toFixed(3)),
        });
      });

      logger.info('[convertTranscriptTool] New transcript created', {
        wordCount: newTranscript.length,
        totalDuration,
        wordDuration,
        timestamps: newTranscript.slice(0, 3).map(t => ({ text: t.text, start: t.start, end: t.end }))
      });

      // Update the chunk with converted transcript
      await chunk.update({
        transcript: JSON.stringify(newTranscript),
        status: 'GENERATING_PREVIEW',
        reprocessCount: chunk.reprocessCount + 1,
        previewUrl: null, // Clear old preview
      });

      // Queue GENERATE_PREVIEW job with the converted transcript
      const previewJobId = uuidv4();
      const previewJob = {
        jobId: previewJobId,
        jobType: 'GENERATE_PREVIEW' as const,
        sessionId,
        userPhone,
        priority: 'HIGH' as const,
        attempts: 0,
        maxAttempts: 3,
        createdAt: new Date().toISOString(),
        data: {
          chunkId: chunk.chunkId,
          chunkUrl: chunk.chunkUrl,
          chunkIndex: chunk.chunkIndex,
          transcript: newTranscript,
          styleId: session.selectedStyleId || 'classic-white',
          captionMode: session.captionMode || 'sentence',
        },
      };

      await jobQueue.publishJob(previewJob);

      logger.info('[TOOL SUCCESS] convertTranscriptTool - queued preview with converted transcript', {
        chunkIndex,
        jobId: previewJobId,
        conversionType,
        originalWordCount: originalTranscript.length,
        convertedWordCount: convertedWords.length,
      });

      return {
        message: `🔄 Transcript converted to ${conversionType}!\n\n📝 *Original:* "${originalText.substring(0, 100)}${originalText.length > 100 ? '...' : ''}"\n\n✨ *Converted:* "${convertedText.substring(0, 100)}${convertedText.length > 100 ? '...' : ''}"\n\n🎬 Regenerating preview with the converted text...\n\nI'll send you the updated preview shortly.`,
        convertedText,
        jobQueued: true,
      };
    } catch (error) {
      logger.error('[TOOL ERROR] convertTranscriptTool', error instanceof Error ? error : new Error(String(error)));
      return {
        message: '❌ Failed to convert transcript. Please try again.',
      };
    }
  },
});

export const changeCaptionModeTool = createTool({
  id: IntentType.CHANGE_CAPTION_MODE,
  description: INTENT_METADATA[IntentType.CHANGE_CAPTION_MODE].description,
  inputSchema: z.object({
    captionMode: z.string().describe('The caption mode to switch to: "word" for word-by-word or "sentence" for sentence chunks'),
    userPhone: z.string().describe('User phone number'),
    sessionId: z.string().describe('Current session ID'),
  }),
  outputSchema: z.object({
    message: z.string(),
    newMode: z.string().optional(),
    jobQueued: z.boolean().optional(),
  }),
  execute: async ({ context }) => {
    const { captionMode, userPhone, sessionId } = context;

    logger.info('[TOOL CALLED] changeCaptionModeTool', {
      toolId: IntentType.CHANGE_CAPTION_MODE,
      input: { captionMode, userPhone, sessionId },
    });

    try {
      // Normalize the caption mode input
      let newMode: 'word' | 'sentence' = 'sentence';
      const modeInput = captionMode.toLowerCase();
      
      if (modeInput.includes('word') || modeInput === 'a' || modeInput.includes('tiktok')) {
        newMode = 'word';
      } else if (modeInput.includes('sentence') || modeInput === 'b' || modeInput.includes('youtube') || modeInput.includes('chunk')) {
        newMode = 'sentence';
      }

      // Get session from database
      const session = await CaptionSession.findOne({ where: { sessionId } });
      if (!session) {
        return { message: '❌ Session not found.' };
      }

      // Check if mode is already the same
      if (session.captionMode === newMode) {
        return { 
          message: `✅ Caption mode is already set to *${newMode === 'word' ? 'Word-by-word (TikTok style)' : 'Sentence chunks (YouTube style)'}*.`,
          newMode,
        };
      }

      // Get the current chunk index
      const chunkIndex = session.currentChunkIndex;

      // Get the current chunk
      const chunk = await VideoChunk.findOne({ 
        where: { sessionId, chunkIndex } 
      });
      
      if (!chunk) {
        return { message: '❌ No chunk found to regenerate.' };
      }

      // Parse the transcript
      let transcript: TranscriptSegment[] = [];
      try {
        transcript = chunk.transcript ? JSON.parse(chunk.transcript as string) : [];
      } catch (e) {
        logger.warn('Failed to parse transcript', { chunkId: chunk.chunkId });
      }

      if (transcript.length === 0) {
        return { message: '❌ No transcript found. Please wait for transcription to complete.' };
      }

      // Update session with new caption mode
      await session.update({ captionMode: newMode });

      // Update chunk status
      await chunk.update({
        status: 'GENERATING_PREVIEW',
        previewUrl: null, // Clear old preview
      });

      // Queue GENERATE_PREVIEW job with the new caption mode
      const previewJobId = uuidv4();
      const previewJob = {
        jobId: previewJobId,
        jobType: 'GENERATE_PREVIEW' as const,
        sessionId,
        userPhone,
        priority: 'HIGH' as const,
        attempts: 0,
        maxAttempts: 3,
        createdAt: new Date().toISOString(),
        data: {
          chunkId: chunk.chunkId,
          chunkUrl: chunk.chunkUrl,
          chunkIndex: chunk.chunkIndex,
          transcript,
          styleId: session.selectedStyleId || 'classic-white',
          captionMode: newMode,
        },
      };

      await jobQueue.publishJob(previewJob);

      const modeDescription = newMode === 'word' 
        ? 'Word-by-word (TikTok style) 🎵' 
        : 'Sentence chunks (YouTube style) 📺';

      logger.info('[TOOL SUCCESS] changeCaptionModeTool', {
        chunkIndex,
        jobId: previewJobId,
        oldMode: session.captionMode,
        newMode,
      });

      return {
        message: `✅ Caption mode changed to *${modeDescription}*!\n\n🎬 Regenerating preview with the new mode...\n\nI'll send you the updated preview shortly.`,
        newMode,
        jobQueued: true,
      };
    } catch (error) {
      logger.error('[TOOL ERROR] changeCaptionModeTool', error instanceof Error ? error : new Error(String(error)));
      return {
        message: '❌ Failed to change caption mode.',
      };
    }
  },
});

/**
 * Build a conversion prompt based on the conversion type
 */
function buildConversionPrompt(conversionType: string, originalText: string): string {
  const type = conversionType.toLowerCase();
  
  if (type.includes('hinglish') || type.includes('roman')) {
    return `Convert the following Hindi/Devanagari text to Hinglish (Hindi written in Roman/English script). Keep the same meaning and natural flow:\n\n"${originalText}"`;
  }
  
  if (type.includes('hindi')) {
    return `Translate the following text to Hindi (Devanagari script). Keep it natural and conversational:\n\n"${originalText}"`;
  }
  
  if (type.includes('english')) {
    return `Translate the following text to English. Keep it natural and conversational:\n\n"${originalText}"`;
  }
  
  if (type.includes('casual') || type.includes('informal')) {
    return `Rewrite the following text in a casual, informal style. Keep the same meaning but make it sound more conversational:\n\n"${originalText}"`;
  }
  
  if (type.includes('formal') || type.includes('professional')) {
    return `Rewrite the following text in a formal, professional style. Keep the same meaning but make it sound more professional:\n\n"${originalText}"`;
  }
  
  // Default: Use the conversion type directly in the prompt
  return `Convert the following text to ${conversionType}. Preserve the meaning and keep it natural:\n\n"${originalText}"`;
}

export const checkVideoStatusTool = createTool({
  id: IntentType.CHECK_VIDEO_STATUS,
  description: INTENT_METADATA[IntentType.CHECK_VIDEO_STATUS].description,
  inputSchema: z.object({
    userPhone: z.string().describe('User phone number'),
    sessionId: z.string().optional().describe('Session ID to check'),
  }),
  outputSchema: z.object({
    message: z.string(),
    status: z.string().optional(),
    progress: z.number().optional(),
  }),
  execute: async ({ context }) => {
    const { userPhone, sessionId } = context;

    logger.info('[TOOL CALLED] checkVideoStatusTool', {
      toolId: IntentType.CHECK_VIDEO_STATUS,
      input: { userPhone, sessionId },
    });

    try {
      // Get session from database
      let session;
      if (sessionId) {
        session = await CaptionSession.findOne({ where: { sessionId } });
      } else {
        // Get most recent session for user
        session = await CaptionSession.findOne({
          where: { userPhone },
          order: [['createdAt', 'DESC']],
        });
      }

      if (!session) {
        return {
          message: '📊 No active video processing found.\n\nSend me a video to get started!',
          status: 'none',
        };
      }

      // Calculate progress based on status
      const statusMessages: Record<string, { message: string; progress: number }> = {
        PENDING: { message: '⏳ Waiting to start...', progress: 5 },
        CHUNKING: { message: '✂️ Splitting video into chunks...', progress: 15 },
        TRANSCRIBING: { message: '🎤 Transcribing audio...', progress: 40 },
        STYLE_SELECTION: { message: '🎨 Waiting for style selection...', progress: 50 },
        GENERATING_PREVIEW: { message: '🎬 Generating previews...', progress: 65 },
        REVIEWING: { message: '👀 Waiting for your approval...', progress: 75 },
        READY_FOR_RENDER: { message: '✅ Ready for final render!', progress: 80 },
        RENDERING: { message: '🔥 Rendering final video...', progress: 90 },
        COMPLETED: { message: '🎉 Complete!', progress: 100 },
        FAILED: { message: '❌ Failed', progress: 0 },
        CANCELLED: { message: '🚫 Cancelled', progress: 0 },
      };

      const statusInfo = statusMessages[session.status] || { message: 'Unknown status', progress: 0 };

      return {
        message: `📊 *Video Status*\n\nSession: ${session.sessionId.substring(0, 8)}...\nStatus: ${statusInfo.message}\nProgress: ${statusInfo.progress}%\n\n${session.status === 'STYLE_SELECTION' ? 'Reply with a number (1-5) to select a caption style!' : ''}`,
        status: session.status,
        progress: statusInfo.progress,
      };
    } catch (error) {
      logger.error('[TOOL ERROR] checkVideoStatusTool', error instanceof Error ? error : new Error(String(error)));
      return {
        message: '❌ Failed to check video status.',
      };
    }
  },
});

// Export all video tools
export const videoTools = [
  processVideoTool,
  viewCaptionStylesTool,
  selectCaptionStyleTool,
  changeCaptionModeTool,
  approveChunkTool,
  rejectChunkTool,
  correctTranscriptionTool,
  convertTranscriptTool,
  startFinalRenderTool,
  checkVideoStatusTool,
];
