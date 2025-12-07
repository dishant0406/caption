import { logger } from '@/plugins/logger';
import ffmpegService from '@/services/ffmpeg';
import { storage } from '@/services/storage';
import transcriptionService, { TranscriptionSegment } from '@/services/transcription';
import {
  ChunkVideoJobPayload,
  ChunkVideoResult,
  GeneratePreviewJobPayload,
  GeneratePreviewResult,
  getStyleById,
  JobPayload,
  JobResult,
  RenderFinalJobPayload,
  RenderFinalResult,
  TranscribeChunkJobPayload,
  TranscribeChunkResult,
  TranscriptSegment,
  VideoUploadedJobPayload,
  VideoUploadedResult
} from '@caption/shared';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

/**
 * Process uploaded video - download from URL and store in blob storage
 * This is the entry point for video processing pipeline
 */
export async function processVideoUploaded(payload: VideoUploadedJobPayload): Promise<VideoUploadedResult> {
  const { jobId, sessionId, userPhone, data } = payload;
  const { videoUrl, mimeType } = data;

  logger.info('Processing video upload', { jobId, sessionId, videoUrl });

  const tempDir = ffmpegService.createTempDir(`${sessionId}_upload`);

  try {
    // Determine file extension from mime type
    const extension = mimeType === 'video/quicktime' ? 'mov' : 'mp4';
    const localVideoPath = path.join(tempDir, `original.${extension}`);

    // Download video from URL (could be WhatsApp decrypted URL or direct URL)
    logger.info('Downloading video from URL', { sessionId, videoUrl });

    const response = await fetch(videoUrl);
    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.status} ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    fs.writeFileSync(localVideoPath, buffer);

    const fileStats = fs.statSync(localVideoPath);
    logger.info('Video downloaded', { sessionId, size: fileStats.size });

    // Get video metadata
    const metadata = await ffmpegService.getVideoMetadata(localVideoPath);
    logger.info('Video metadata extracted', { sessionId, metadata });

    // Upload original video to blob storage
    const blobName = `sessions/${sessionId}/original/video.${extension}`;
    await storage.uploadFromFile(localVideoPath, blobName, mimeType);
    const storedUrl = storage.getBlobUrl(blobName);

    logger.info('Video uploaded to blob storage', { sessionId, blobName, storedUrl });

    return {
      jobId,
      jobType: 'VIDEO_UPLOADED',
      sessionId,
      status: 'COMPLETED',
      processedAt: new Date().toISOString(),
      data: {
        videoUrl,
        videoDuration: metadata.duration,
        videoSize: fileStats.size,
        storedUrl,
      },
    };
  } catch (error) {
    logger.error('Video upload processing failed', {
      jobId,
      sessionId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      jobId,
      jobType: 'VIDEO_UPLOADED',
      sessionId,
      status: 'FAILED',
      processedAt: new Date().toISOString(),
      data: {
        videoUrl,
        videoDuration: 0,
        videoSize: 0,
        storedUrl: '',
      },
    };
  } finally {
    // Cleanup temp directory
    ffmpegService.cleanupTempDir(tempDir);
  }
}

/**
 * Process video chunking - split video into chunks
 */
export async function processChunkVideo(payload: ChunkVideoJobPayload): Promise<ChunkVideoResult> {
  const { jobId, sessionId, userPhone, data } = payload;
  const { videoUrl, videoDuration, chunkDuration } = data;

  logger.info('Processing video chunking', { jobId, sessionId, videoDuration, chunkDuration });

  const tempDir = ffmpegService.createTempDir(sessionId);

  try {
    // Download video from blob storage
    const localVideoPath = path.join(tempDir, 'original.mp4');
    await storage.downloadToFile(videoUrl, localVideoPath);

    // Get video metadata
    const metadata = await ffmpegService.getVideoMetadata(localVideoPath);
    logger.info('Video metadata extracted', { sessionId, metadata });

    // Split video into chunks
    const chunkPaths = await ffmpegService.splitVideoIntoChunks(localVideoPath, tempDir, chunkDuration);
    logger.info('Video split into chunks', { sessionId, chunkCount: chunkPaths.length });

    // Upload chunks to blob storage
    const chunks: ChunkVideoResult['data']['chunks'] = [];

    for (let i = 0; i < chunkPaths.length; i++) {
      const chunkPath = chunkPaths[i];
      const chunkMetadata = await ffmpegService.getVideoMetadata(chunkPath);
      const chunkId = uuidv4();

      // Calculate start and end time
      const startTime = i * chunkDuration;
      const endTime = Math.min(startTime + chunkMetadata.duration, videoDuration);

      // Upload chunk to blob storage
      const chunkBlobName = `sessions/${sessionId}/chunks/chunk_${i}.mp4`;
      await storage.uploadFromFile(chunkPath, chunkBlobName, 'video/mp4');

      chunks.push({
        chunkId,
        chunkIndex: i,
        chunkUrl: chunkBlobName,
        startTime,
        endTime,
      });
    }

    return {
      jobId,
      jobType: 'CHUNK_VIDEO',
      sessionId,
      status: 'COMPLETED',
      processedAt: new Date().toISOString(),
      data: {
        totalChunks: chunks.length,
        chunks,
      },
    };
  } catch (error) {
    logger.error('Video chunking failed', {
      jobId,
      sessionId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      jobId,
      jobType: 'CHUNK_VIDEO',
      sessionId,
      status: 'FAILED',
      processedAt: new Date().toISOString(),
      data: {
        totalChunks: 0,
        chunks: [],
      },
    };
  } finally {
    // Cleanup temp directory
    ffmpegService.cleanupTempDir(tempDir);
  }
}

/**
 * Process transcription for a video chunk
 */
export async function processTranscribeChunk(payload: TranscribeChunkJobPayload): Promise<TranscribeChunkResult> {
  const { jobId, sessionId, data } = payload;
  const { chunkId, chunkUrl, chunkIndex, startTime, endTime } = data;

  logger.info('Processing transcription', { jobId, sessionId, chunkIndex });

  const tempDir = ffmpegService.createTempDir(`${sessionId}_transcribe_${chunkIndex}`);

  try {
    // Download chunk
    const chunkPath = path.join(tempDir, 'chunk.mp4');
    await storage.downloadToFile(chunkUrl, chunkPath);

    // Extract audio
    const audioPath = await ffmpegService.extractAudio(chunkPath, tempDir);

    // Transcribe audio
    const transcription = await transcriptionService.transcribeAudio(audioPath);

    // Format segments for captions - adjust timestamps relative to chunk
    const segments: TranscriptSegment[] = transcription.segments.map((seg, idx) => ({
      id: idx,
      start: seg.start + startTime, // Adjust to absolute time
      end: seg.end + startTime,
      text: seg.text,
    }));

    // Upload transcription result as JSON
    const transcriptionBlobName = `sessions/${sessionId}/transcriptions/chunk_${chunkIndex}.json`;
    const transcriptionData = {
      text: transcription.text,
      segments,
      language: transcription.language,
      duration: transcription.duration,
    };
    await storage.uploadBuffer(
      Buffer.from(JSON.stringify(transcriptionData, null, 2)),
      transcriptionBlobName,
      'application/json'
    );

    return {
      jobId,
      jobType: 'TRANSCRIBE_CHUNK',
      sessionId,
      status: 'COMPLETED',
      processedAt: new Date().toISOString(),
      data: {
        chunkId,
        transcript: segments,
        language: transcription.language,
        duration: transcription.duration,
      },
    };
  } catch (error) {
    logger.error('Transcription processing failed', {
      jobId,
      sessionId,
      chunkIndex,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      jobId,
      jobType: 'TRANSCRIBE_CHUNK',
      sessionId,
      status: 'FAILED',
      processedAt: new Date().toISOString(),
      data: {
        chunkId,
        transcript: [],
        language: 'unknown',
        duration: 0,
      },
    };
  } finally {
    ffmpegService.cleanupTempDir(tempDir);
  }
}

/**
 * Generate preview video with captions for approval
 */
export async function processGeneratePreview(payload: GeneratePreviewJobPayload): Promise<GeneratePreviewResult> {
  const { jobId, sessionId, data } = payload;
  const { chunkId, chunkUrl, chunkIndex, transcript, styleId, captionMode } = data;

  logger.info('Generating preview', { jobId, sessionId, chunkIndex, styleId, captionMode });

  const tempDir = ffmpegService.createTempDir(`${sessionId}_preview_${chunkIndex}`);

  try {
    // Get caption style
    const style = getStyleById(styleId);
    if (!style) {
      throw new Error(`Unknown caption style: ${styleId}`);
    }

    // Download chunk
    const chunkPath = path.join(tempDir, 'chunk.mp4');
    await storage.downloadToFile(chunkUrl, chunkPath);

    // Get video dimensions
    const metadata = await ffmpegService.getVideoMetadata(chunkPath);

    // IMPORTANT: Transcript segments have ABSOLUTE timestamps (relative to full video)
    // But the chunk video starts at 0, so we need to convert to RELATIVE timestamps
    // Find the chunk's start time from the minimum segment timestamp
    let chunkStartTime = 0;
    if (transcript.length > 0) {
      chunkStartTime = Math.min(...transcript.map(seg => seg.start));
    }

    logger.info('Converting absolute timestamps to relative', {
      chunkIndex,
      chunkStartTime,
      segmentCount: transcript.length,
      firstSegmentAbsolute: transcript[0]?.start,
      lastSegmentAbsolute: transcript[transcript.length - 1]?.end,
    });

    // Convert TranscriptSegment to TranscriptionSegment with RELATIVE timestamps
    const segments: TranscriptionSegment[] = transcript.map(seg => ({
      start: seg.start - chunkStartTime, // Convert to relative (chunk starts at 0)
      end: seg.end - chunkStartTime,
      text: seg.text,
    }));

    logger.info('Converted timestamps', {
      chunkIndex,
      firstSegmentRelative: segments[0]?.start,
      lastSegmentRelative: segments[segments.length - 1]?.end,
    });

    // Generate ASS subtitle file
    // Pass captionMode to generate word-by-word or sentence captions
    const assContent = ffmpegService.generateAssSubtitle(
      segments,
      style,
      metadata.width,
      metadata.height,
      captionMode || 'sentence' // Default to sentence mode if not specified
    );
    const assPath = path.join(tempDir, 'captions.ass');
    fs.writeFileSync(assPath, assContent);

    // Generate preview with burned captions (low-res for quick preview)
    const previewOutputPath = path.join(tempDir, 'preview_captioned.mp4');
    await ffmpegService.burnCaptions(chunkPath, assPath, previewOutputPath, true);

    // Upload preview
    const previewBlobName = `sessions/${sessionId}/captioned_previews/chunk_${chunkIndex}_${styleId}.mp4`;
    await storage.uploadFromFile(previewOutputPath, previewBlobName, 'video/mp4');

    // Generate thumbnail
    const thumbnailPath = path.join(tempDir, 'thumbnail.jpg');
    await ffmpegService.generateThumbnail(previewOutputPath, thumbnailPath);
    const thumbnailBlobName = `sessions/${sessionId}/thumbnails/chunk_${chunkIndex}_${styleId}.jpg`;
    await storage.uploadFromFile(thumbnailPath, thumbnailBlobName, 'image/jpeg');

    return {
      jobId,
      jobType: 'GENERATE_PREVIEW',
      sessionId,
      status: 'COMPLETED',
      processedAt: new Date().toISOString(),
      data: {
        chunkId,
        previewUrl: storage.getBlobUrl(previewBlobName),
        thumbnailUrl: storage.getBlobUrl(thumbnailBlobName),
      },
    };
  } catch (error) {
    logger.error('Preview generation failed', {
      jobId,
      sessionId,
      chunkIndex,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      jobId,
      jobType: 'GENERATE_PREVIEW',
      sessionId,
      status: 'FAILED',
      processedAt: new Date().toISOString(),
      data: {
        chunkId,
        previewUrl: '',
      },
    };
  } finally {
    ffmpegService.cleanupTempDir(tempDir);
  }
}

/**
 * Render final HD video with captions
 */
export async function processRenderFinal(payload: RenderFinalJobPayload): Promise<RenderFinalResult> {
  const { jobId, sessionId, data } = payload;
  const { originalVideoUrl, chunks, styleId, outputFormat } = data;

  logger.info('Processing final render', { jobId, sessionId, chunkCount: chunks.length, styleId });

  const tempDir = ffmpegService.createTempDir(`${sessionId}_final`);

  try {
    const style = getStyleById(styleId);
    if (!style) {
      throw new Error(`Unknown caption style: ${styleId}`);
    }

    // Download original video
    const originalVideoPath = path.join(tempDir, `original.${outputFormat}`);
    await storage.downloadToFile(originalVideoUrl, originalVideoPath);

    // Get original video metadata
    const originalMetadata = await ffmpegService.getVideoMetadata(originalVideoPath);

    // Merge all transcripts with absolute timestamps
    const allSegments: TranscriptionSegment[] = [];
    for (const chunk of chunks) {
      for (const seg of chunk.transcript) {
        allSegments.push({
          start: seg.start,
          end: seg.end,
          text: seg.text,
        });
      }
    }

    // Sort segments by start time
    allSegments.sort((a, b) => a.start - b.start);

    // Generate ASS subtitle for entire video
    const assContent = ffmpegService.generateAssSubtitle(
      allSegments,
      style,
      originalMetadata.width,
      originalMetadata.height
    );
    const assPath = path.join(tempDir, 'captions.ass');
    fs.writeFileSync(assPath, assContent);

    // Render final video with captions (HD quality)
    const finalOutputPath = path.join(tempDir, `final_captioned.${outputFormat}`);
    await ffmpegService.burnCaptions(originalVideoPath, assPath, finalOutputPath, false);

    // Get final video stats
    const finalMetadata = await ffmpegService.getVideoMetadata(finalOutputPath);
    const finalStats = fs.statSync(finalOutputPath);

    // Upload final video
    const finalBlobName = `sessions/${sessionId}/output/final_captioned.${outputFormat}`;
    const mimeType = outputFormat === 'mov' ? 'video/quicktime' : 'video/mp4';
    await storage.uploadFromFile(finalOutputPath, finalBlobName, mimeType);

    return {
      jobId,
      jobType: 'RENDER_FINAL',
      sessionId,
      status: 'COMPLETED',
      processedAt: new Date().toISOString(),
      data: {
        finalVideoUrl: storage.getBlobUrl(finalBlobName),
        duration: finalMetadata.duration,
        fileSize: finalStats.size,
      },
    };
  } catch (error) {
    logger.error('Final render failed', {
      jobId,
      sessionId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      jobId,
      jobType: 'RENDER_FINAL',
      sessionId,
      status: 'FAILED',
      processedAt: new Date().toISOString(),
      data: {
        finalVideoUrl: '',
        duration: 0,
        fileSize: 0,
      },
    };
  } finally {
    ffmpegService.cleanupTempDir(tempDir);
  }
}

/**
 * Route job to appropriate processor based on job type
 */
export function processJob(payload: JobPayload): Promise<JobResult> {
  switch (payload.jobType) {
    case 'VIDEO_UPLOADED':
      return processVideoUploaded(payload);
    case 'CHUNK_VIDEO':
      return processChunkVideo(payload);
    case 'TRANSCRIBE_CHUNK':
      return processTranscribeChunk(payload);
    case 'GENERATE_PREVIEW':
      return processGeneratePreview(payload);
    case 'RENDER_FINAL':
      return processRenderFinal(payload);
    default:
      throw new Error(`Unsupported job type: ${(payload as JobPayload).jobType}`);
  }
}

export default {
  processVideoUploaded,
  processChunkVideo,
  processTranscribeChunk,
  processGeneratePreview,
  processRenderFinal,
  processJob,
};
