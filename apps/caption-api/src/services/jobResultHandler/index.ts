/**
 * Job Result Handler Service
 * 
 * Handles results from video-worker and chains the next jobs.
 * Implements the workflow: VIDEO_UPLOADED → CHUNK_VIDEO → TRANSCRIBE_CHUNK → STYLE_SELECTION
 */

import { env } from '@/config';
import { CaptionSession, VideoChunk } from '@/models';
import { logger } from '@/plugins/logger';
import { getQueue, jobQueue } from '@/plugins/queue';
import { whatsappService } from '@/services/whatsapp/WhatsAppService';
import {
  ChunkVideoJobPayload,
  ChunkVideoResult,
  GeneratePreviewResult,
  JobResult,
  RenderFinalResult,
  TranscribeChunkResult,
  VideoUploadedResult
} from '@caption/shared';
import { v4 as uuidv4 } from 'uuid';

/**
 * Initialize the job result handler
 * This should be called after the queue is initialized
 */
export function initializeJobResultHandler(): void {
  const queue = getQueue();
  
  // Override the onJobResult method to handle results
  (queue as any).onJobResult = handleJobResult;
  
  logger.info('📋 Job result handler initialized');
}

/**
 * Handle incoming job results and chain next jobs
 */
async function handleJobResult(result: JobResult): Promise<void> {
  logger.info('📬 Received job result', {
    jobId: result.jobId,
    jobType: result.jobType,
    status: result.status,
    sessionId: result.sessionId,
  });

  if (result.status === 'FAILED') {
    await handleFailedJob(result);
    return;
  }

  try {
    switch (result.jobType) {
      case 'VIDEO_UPLOADED':
        await handleVideoUploadedResult(result as VideoUploadedResult);
        break;
      case 'CHUNK_VIDEO':
        await handleChunkVideoResult(result as ChunkVideoResult);
        break;
      case 'TRANSCRIBE_CHUNK':
        await handleTranscribeChunkResult(result as TranscribeChunkResult);
        break;
      case 'GENERATE_PREVIEW':
        await handleGeneratePreviewResult(result as GeneratePreviewResult);
        break;
      case 'RENDER_FINAL':
        await handleRenderFinalResult(result as RenderFinalResult);
        break;
      default: {
        const _exhaustiveCheck: never = result;
        logger.warn(`Unknown job type: ${(_exhaustiveCheck as JobResult).jobType}`);
        break;
      }
    }
  } catch (error) {
    logger.error(
      'Failed to handle job result',
      error instanceof Error ? error : new Error(String(error)),
      { jobId: result.jobId, jobType: result.jobType }
    );
  }
}

/**
 * Handle VIDEO_UPLOADED result → Queue CHUNK_VIDEO
 */
async function handleVideoUploadedResult(result: VideoUploadedResult): Promise<void> {
  const { sessionId, data } = result;
  
  logger.info('🎬 Video uploaded, starting chunking', { sessionId });

  // Update session with video URL and metadata
  const session = await CaptionSession.findOne({ where: { sessionId } });
  if (!session) {
    logger.error('Session not found', new Error('Session not found'), { sessionId });
    return;
  }

  // Update session status and video URL
  await session.update({
    status: 'CHUNKING',
    originalVideoUrl: data.storedUrl,
    originalVideoDuration: data.videoDuration,
    originalVideoSize: data.videoSize,
  });

  // Get chunk duration from validated env config
  const chunkDuration = env.CHUNK_DURATION_SECONDS;

  // Queue CHUNK_VIDEO job
  const chunkJobId = uuidv4();
  const chunkJob: ChunkVideoJobPayload = {
    jobId: chunkJobId,
    jobType: 'CHUNK_VIDEO',
    sessionId,
    userPhone: session.userPhone,
    priority: 'NORMAL',
    attempts: 0,
    maxAttempts: 3,
    createdAt: new Date().toISOString(),
    data: {
      videoUrl: data.storedUrl,
      videoDuration: data.videoDuration,
      chunkDuration,
    },
  };

  await jobQueue.publishJob(chunkJob);
  logger.info('📤 CHUNK_VIDEO job queued', { jobId: chunkJobId, sessionId });
}

/**
 * Handle CHUNK_VIDEO result → Create chunks in DB, then ask for style selection
 * SEQUENTIAL FLOW: Chunk → Style Selection → Process chunks one by one
 */
async function handleChunkVideoResult(result: ChunkVideoResult): Promise<void> {
  const { sessionId, data } = result;
  
  logger.info('🔪 Video chunked, asking for style selection', { 
    sessionId, 
    chunkCount: data.totalChunks 
  });

  // Get session
  const session = await CaptionSession.findOne({ where: { sessionId } });
  if (!session) {
    logger.error('Session not found', new Error('Session not found'), { sessionId });
    return;
  }

  // Create VideoChunk records (but DON'T start transcription yet)
  for (const chunk of data.chunks) {
    // First, check if chunk exists by sessionId + chunkIndex (the unique constraint)
    const existingChunk = await VideoChunk.findOne({
      where: { 
        sessionId,
        chunkIndex: chunk.chunkIndex,
      },
    });
    
    if (existingChunk) {
      // Chunk exists - delete for recreation
      await existingChunk.destroy();
      logger.info('🗑️ Deleted existing chunk for recreation', { 
        oldChunkId: existingChunk.chunkId,
        newChunkId: chunk.chunkId,
        sessionId, 
        chunkIndex: chunk.chunkIndex 
      });
    }

    // Create new chunk record with PENDING status
    await VideoChunk.create({
      chunkId: chunk.chunkId,
      sessionId,
      chunkIndex: chunk.chunkIndex,
      chunkUrl: chunk.chunkUrl,
      startTime: chunk.startTime,
      endTime: chunk.endTime,
      duration: chunk.endTime - chunk.startTime,
      status: 'PENDING',
      userApproved: false,
      reprocessCount: existingChunk ? (existingChunk.reprocessCount + 1) : 0,
    });

    logger.info('📝 Created chunk record', { 
      chunkId: chunk.chunkId, 
      sessionId, 
      chunkIndex: chunk.chunkIndex 
    });
  }

  // Update session - ask for style selection BEFORE transcription
  await session.update({
    status: 'STYLE_SELECTION',
    totalChunks: data.totalChunks,
    currentChunkIndex: 0,
  });

  // Send style and caption mode selection message
  await whatsappService.sendTextMessage(
    session.userPhone,
    `✅ Video split into ${data.totalChunks} segments!\n\n` +
    `🎨 *Step 1: Choose a caption style*\n\n` +
    `1️⃣ Classic White - Clean white text\n` +
    `2️⃣ Bold Yellow - Eye-catching yellow\n` +
    `3️⃣ Neon Green - Vibrant green\n` +
    `4️⃣ Boxed Black - Black background box\n` +
    `5️⃣ Gradient Pink - Stylish pink gradient\n\n` +
    `📝 *Step 2: Choose caption mode*\n\n` +
    `A) *Word-by-word* - Each word appears one at a time (TikTok style)\n` +
    `B) *Sentence chunks* - Full sentences shown together (YouTube style)\n\n` +
    `Reply with style number + mode letter, e.g.:\n` +
    `"1A" for Classic White + Word-by-word\n` +
    `"2B" for Bold Yellow + Sentence chunks`
  );
}

/**
 * Handle TRANSCRIBE_CHUNK result → Auto-queue GENERATE_PREVIEW
 * SEQUENTIAL FLOW: Style is selected BEFORE transcription, so always queue preview
 */
async function handleTranscribeChunkResult(result: TranscribeChunkResult): Promise<void> {
  const { sessionId, data } = result;
  
  logger.info('📝 Chunk transcribed', { sessionId, chunkId: data.chunkId });

  // Update chunk in database
  const chunk = await VideoChunk.findOne({ where: { chunkId: data.chunkId } });
  if (!chunk) {
    logger.error('Chunk not found', new Error('Chunk not found'), { chunkId: data.chunkId });
    return;
  }

  await chunk.update({
    status: 'TRANSCRIBED',
    transcript: JSON.stringify(data.transcript),
  });

  // Get session
  const session = await CaptionSession.findOne({ where: { sessionId } });
  if (!session) return;

  // In sequential flow, style is ALWAYS selected before transcription
  // So we always queue GENERATE_PREVIEW
  if (!session.selectedStyleId) {
    logger.error('No style selected - this should not happen in sequential flow', 
      new Error('No style selected'), { sessionId });
    return;
  }

  logger.info('🎬 Transcription complete, auto-queuing preview generation', { 
    sessionId, 
    chunkId: chunk.chunkId,
    chunkIndex: chunk.chunkIndex,
    styleId: session.selectedStyleId,
    isRetranscription: chunk.reprocessCount > 0,
  });

  // Parse transcript for preview job
  const transcript = data.transcript || [];

  // Queue GENERATE_PREVIEW job for this chunk
  const previewJobId = uuidv4();
  const previewJob = {
    jobId: previewJobId,
    jobType: 'GENERATE_PREVIEW' as const,
    sessionId,
    userPhone: session.userPhone,
    priority: 'HIGH' as const,
    attempts: 0,
    maxAttempts: 3,
    createdAt: new Date().toISOString(),
    data: {
      chunkId: chunk.chunkId,
      chunkUrl: chunk.chunkUrl,
      chunkIndex: chunk.chunkIndex,
      transcript,
      styleId: session.selectedStyleId,
      captionMode: session.captionMode || 'sentence', // Pass caption mode for word-by-word or sentence rendering
    },
  };

  await chunk.update({ status: 'GENERATING_PREVIEW' });
  await jobQueue.publishJob(previewJob);
  
  logger.info('📤 GENERATE_PREVIEW job queued', { 
    jobId: previewJobId, 
    sessionId, 
    chunkIndex: chunk.chunkIndex 
  });
}

/**
 * Handle GENERATE_PREVIEW result → Send preview to user for approval
 * SEQUENTIAL FLOW: Always send preview directly to user (one chunk at a time)
 * Also sends the transcript text so user can correct it if needed
 */
async function handleGeneratePreviewResult(result: GeneratePreviewResult): Promise<void> {
  const { sessionId, data } = result;
  
  logger.info('🎬 Preview generated', { sessionId, chunkId: data.chunkId });

  // Update chunk
  const chunk = await VideoChunk.findOne({ where: { chunkId: data.chunkId } });
  if (!chunk) return;

  await chunk.update({
    status: 'PREVIEW_READY',
    previewUrl: data.previewUrl,
  });

  // Get session
  const session = await CaptionSession.findOne({ where: { sessionId } });
  if (!session) return;

  // Get all chunks for total count
  const allChunks = await VideoChunk.findAll({ 
    where: { sessionId },
    order: [['chunkIndex', 'ASC']]
  });

  // Update session to REVIEWING status and point to this chunk
  await session.update({ 
    status: 'REVIEWING', 
    currentChunkIndex: chunk.chunkIndex 
  });

  const isRePreview = chunk.reprocessCount > 0;

  logger.info('📺 Sending preview to user for approval', { 
    sessionId, 
    chunkId: chunk.chunkId,
    chunkIndex: chunk.chunkIndex,
    totalChunks: allChunks.length,
    isRePreview,
  });

  // Parse transcript to get full text for user review
  let transcriptText = '';
  try {
    const transcript = chunk.transcript ? JSON.parse(chunk.transcript as string) : [];
    // Build readable transcript text from segments
    transcriptText = transcript
      .map((seg: { text?: string; word?: string }) => seg.text || seg.word || '')
      .join(' ')
      .trim();
  } catch (e) {
    logger.warn('Failed to parse transcript for preview message', { chunkId: chunk.chunkId });
  }

  // Send preview directly to user for approval
  const messagePrefix = isRePreview 
    ? `📺 *New preview for chunk ${chunk.chunkIndex + 1} of ${allChunks.length}*`
    : `📺 *Preview ${chunk.chunkIndex + 1} of ${allChunks.length}*`;

  // First send the video
  await whatsappService.sendVideoMessage(
    session.userPhone,
    data.previewUrl,
    messagePrefix
  );

  // Then send the transcript text separately so user can see and correct it
  const transcriptMessage = transcriptText 
    ? `📝 *Transcript:*\n\n"${transcriptText}"\n\n` 
    : '';

  await whatsappService.sendTextMessage(
    session.userPhone,
    `${transcriptMessage}` +
    `*What would you like to do?*\n\n` +
    `✅ Reply *"yes"* or *"approve"* to approve\n` +
    `✏️ Reply *"fix: [corrected text]"* to correct the transcript\n` +
    `   Example: "fix: Hello world, this is correct"\n` +
    `❌ Reply *"no"* or *"reject"* to re-transcribe from scratch\n` +
    `🚫 Reply *"cancel"* to cancel session`
  );
}

/**
 * Handle RENDER_FINAL result → Send final video to user
 */
async function handleRenderFinalResult(result: RenderFinalResult): Promise<void> {
  const { sessionId, data } = result;
  
  logger.info('🎉 Final video rendered', { sessionId });

  const session = await CaptionSession.findOne({ where: { sessionId } });
  if (!session) return;

  // Update session
  await session.update({
    status: 'COMPLETED',
    finalVideoUrl: data.finalVideoUrl,
  });

  // Format file size
  const fileSizeMB = (data.fileSize / (1024 * 1024)).toFixed(1);
  const durationMin = Math.floor(data.duration / 60);
  const durationSec = Math.round(data.duration % 60);

  // Send final video to user
  await whatsappService.sendVideoMessage(
    session.userPhone,
    data.finalVideoUrl,
    `🎉 Your captioned video is ready!\n\n📊 Duration: ${durationMin}:${durationSec.toString().padStart(2, '0')}\n📁 Size: ${fileSizeMB}MB\n\nThanks for using Caption Bot! Send another video anytime.`
  );
}

/**
 * Handle failed job
 */
async function handleFailedJob(result: JobResult): Promise<void> {
  logger.error('Job failed', new Error(`Job ${result.jobType} failed`), {
    jobId: result.jobId,
    sessionId: result.sessionId,
  });

  const session = await CaptionSession.findOne({ where: { sessionId: result.sessionId } });
  if (!session) return;

  // Update session status
  await session.update({
    status: 'FAILED',
    errorMessage: `Processing failed at ${result.jobType} stage`,
  });

  // Notify user
  await whatsappService.sendTextMessage(
    session.userPhone,
    `❌ Sorry, something went wrong while processing your video.\n\nPlease try sending your video again. If the problem persists, the video format may not be supported.`
  );
}

export default {
  initializeJobResultHandler,
};
