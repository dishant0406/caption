# WhatsApp Video Captioning Bot - Complete User Flow Documentation

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              WhatsApp Cloud API                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CAPTION-API (Express Server)                       │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │  Baileys Socket  │  │   Mastra Agent   │  │    Redis Job Queue       │  │
│  │  (WhatsApp Conn) │  │   (AI Router)    │  │    (Pub/Sub)             │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────────────┘  │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │  PostgreSQL DB   │  │   WhatsApp Svc   │  │    Azure Blob Storage    │  │
│  │  (Sequelize ORM) │  │   (Messaging)    │  │    (File Storage)        │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                    Redis Pub/Sub (caption:video:jobs)
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           VIDEO-WORKER (Background)                          │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │   FFmpeg Service │  │  Whisper (OpenAI)│  │    Azure Blob Storage    │  │
│  │   (Video Proc)   │  │  (Transcription) │  │    (File Storage)        │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Database Models

### 1. User Model
```typescript
{
  phoneNumber: string;      // Primary identifier (WhatsApp phone)
  whatsappId: string;       // WhatsApp JID
  name: string;             // User display name
  freeVideosUsed: number;   // Count of free tier usage (max 2)
  subscriptionStatus: 'FREE' | 'ACTIVE' | 'EXPIRED' | 'CANCELLED';
  subscriptionExpiresAt?: Date;
}
```

### 2. CaptionSession Model
```typescript
{
  sessionId: string;                    // UUID
  userPhone: string;                    // Foreign key to User
  status: SessionStatus;                // See below
  originalVideoUrl: string;             // Azure Blob URL
  originalVideoMetadata?: VideoMetadata;
  selectedStyleId?: string;             // Caption style chosen
  currentChunkIndex: number;            // Which chunk being reviewed
  totalChunks: number;                  // Total chunks in video
  finalVideoUrl?: string;               // Final output URL
  errorMessage?: string;
}
```

### 3. VideoChunk Model
```typescript
{
  chunkId: string;          // UUID
  sessionId: string;        // Foreign key to Session
  chunkIndex: number;       // 0, 1, 2, ...
  chunkUrl: string;         // Azure Blob URL
  startTime: number;        // Seconds
  endTime: number;          // Seconds
  duration: number;         // Seconds
  status: ChunkStatus;      // See below
  transcript?: string;      // JSON string of segments
  previewUrl?: string;      // Captioned preview URL
  userApproved: boolean;    // User approved this chunk
  reprocessCount: number;   // Times user requested re-transcription
}
```

### Session Statuses
```
PENDING → CHUNKING → TRANSCRIBING → STYLE_SELECTION → PREVIEW_READY 
→ REVIEWING → RENDERING → COMPLETED
                                   ↓
                                FAILED / CANCELLED
```

### Chunk Statuses
```
PENDING → TRANSCRIBING → TRANSCRIBED → GENERATING_PREVIEW → PREVIEW_READY
                                                                   ↓
                                              APPROVED ← User Decision → REJECTED
                                                                            ↓
                                                                     REPROCESSING
```

---

## Message Flow Components

### 1. Baileys Socket Connection (`socket/index.ts`)
- Manages WhatsApp Web socket connection
- Handles connection state (QR code, open, close)
- Registers message handlers

### 2. Messages Upsert Handler (`socket/handlers/MessagesUpsertHandler.ts`)
- Receives all incoming WhatsApp messages
- Filters for relevant messages (not from self, not broadcast)
- Routes to Mastra Agent for processing

### 3. Mastra Agent (`agent/agents/caption.agent.ts`)
- AI-powered conversation router using OpenAI GPT-4
- Analyzes user intent and routes to appropriate tools
- Maintains conversation context

### 4. Agent Tools
- **Video Tools** (`agent/tools/video.tools.ts`): Handle video uploads, style selection, chunk approval
- **Help Tools** (`agent/tools/help.tools.ts`): Provide help, status info, subscription details

### 5. Redis Job Queue
- **Publisher** (caption-api): Publishes jobs to `caption:video:jobs` channel
- **Subscriber** (video-worker): Listens and processes jobs
- **Results**: Published to `caption:video:results` channel

---

## User Flow Scenarios

---

## SCENARIO 1: Happy Path - Single Video, All Approved First Time

### User Journey
```
User sends video → Receives processing message → Selects style → Reviews chunk 1 ✓
→ Reviews chunk 2 ✓ → Reviews chunk 3 ✓ → Receives final video
```

### Detailed Flow

#### Step 1: User Sends Video
```
[WHATSAPP] User sends 45-second video
     │
     ▼
[BAILEYS SOCKET] message received
     │
     ▼
[MessagesUpsertHandler]
├── Extract message details (from, type, mediaUrl)
├── Create/Update User record in DB
├── Log message received
     │
     ▼
[MASTRA AGENT] analyzeIntent()
├── System prompt analyzes: "User sent a video message"
├── Intent detected: VIDEO_UPLOAD
├── Tool selected: handleVideoUpload
     │
     ▼
[Video Tools - handleVideoUpload]
├── Check user free tier: freeVideosUsed < 2? ✓
├── Validate video duration: < 60 seconds? ✓ (Free tier limit)
├── Download video from WhatsApp
├── Upload to Azure Blob Storage: sessions/{sessionId}/original.mp4
├── Create CaptionSession record (status: PENDING)
├── Create job payload:
│   {
│     jobId: "uuid",
│     jobType: "VIDEO_UPLOADED",
│     sessionId: "session-uuid",
│     userPhone: "1234567890",
│     data: { videoUrl, videoDuration: 45, videoSize, mimeType }
│   }
├── Publish to Redis: caption:video:jobs
├── Send WhatsApp message: "📹 Video received! Processing..."
```

#### Step 2: Video Processing (Background Worker)
```
[VIDEO-WORKER] Redis subscriber receives job
     │
     ▼
[JobQueueWorker.processJob]
├── Job type: VIDEO_UPLOADED
├── Route to handler (triggers CHUNK_VIDEO internally)
     │
     ▼
[processChunkVideo]
├── Download video from Azure Blob
├── ffprobe: Get metadata (duration: 45s, width: 1080, height: 1920)
├── Calculate chunks: 45s / 20s = 3 chunks
│   ├── Chunk 0: 0-20s
│   ├── Chunk 1: 20-40s
│   └── Chunk 2: 40-45s
├── FFmpeg: Split video into 3 chunks
├── Upload chunks to Azure:
│   ├── sessions/{sessionId}/chunks/chunk_0.mp4
│   ├── sessions/{sessionId}/chunks/chunk_1.mp4
│   └── sessions/{sessionId}/chunks/chunk_2.mp4
├── Update CaptionSession: status = CHUNKING → TRANSCRIBING
├── Create VideoChunk records in DB (status: PENDING)
├── For each chunk, queue TRANSCRIBE_CHUNK job
├── Publish result to caption:video:results
```

#### Step 3: Transcription (Per Chunk)
```
[VIDEO-WORKER] Receives TRANSCRIBE_CHUNK job for chunk 0
     │
     ▼
[processTranscribeChunk]
├── Download chunk from Azure
├── FFmpeg: Extract audio → sessions/{sessionId}/audio_0.mp3
│   ├── audioCodec: libmp3lame
│   ├── sampleRate: 16000 Hz (optimal for Whisper)
│   └── channels: 1 (mono)
├── OpenAI Whisper API:
│   POST /audio/transcriptions
│   {
│     file: audio_0.mp3,
│     model: "whisper-1",
│     response_format: "verbose_json",
│     timestamp_granularities: ["segment"]
│   }
├── Response:
│   {
│     text: "Hello everyone, welcome to my video...",
│     segments: [
│       { start: 0.0, end: 2.5, text: "Hello everyone" },
│       { start: 2.5, end: 5.0, text: "welcome to my video" },
│       ...
│     ],
│     language: "en"
│   }
├── Format segments for captions (merge short segments, split long ones)
├── Upload transcription JSON to Azure
├── Update VideoChunk: status = TRANSCRIBED, transcript = JSON
├── Publish result to caption:video:results
```

#### Step 4: All Chunks Transcribed - Prompt Style Selection
```
[CAPTION-API] Receives transcription results via Redis
     │
     ▼
[Result Handler]
├── Check: All chunks transcribed? ✓
├── Update CaptionSession: status = STYLE_SELECTION
├── Send WhatsApp interactive message:
│   {
│     type: "list",
│     header: "Choose Caption Style",
│     body: "Select a style for your captions:",
│     sections: [{
│       title: "Available Styles",
│       rows: [
│         { id: "style_classic_white", title: "Classic White" },
│         { id: "style_boxed_black", title: "Boxed Black" },
│         { id: "style_neon_green", title: "Neon Green" },
│         ...
│       ]
│     }]
│   }
```

#### Step 5: User Selects Style
```
[WHATSAPP] User taps "Classic White"
     │
     ▼
[MessagesUpsertHandler]
├── Message type: list_reply
├── Extract: selectedId = "style_classic_white"
     │
     ▼
[MASTRA AGENT]
├── Intent: STYLE_SELECTION
├── Tool: handleStyleSelection
     │
     ▼
[handleStyleSelection]
├── Validate style exists in DEFAULT_CAPTION_STYLES
├── Update CaptionSession: selectedStyleId = "style_classic_white"
├── Queue GENERATE_PREVIEW jobs for all chunks
├── Send WhatsApp: "🎨 Great choice! Generating previews..."
```

#### Step 6: Generate Previews
```
[VIDEO-WORKER] Receives GENERATE_PREVIEW job for chunk 0
     │
     ▼
[processGeneratePreview]
├── Download chunk video
├── Get style config from getStyleById("style_classic_white")
├── Generate ASS subtitle file:
│   [Script Info]
│   Title: Caption
│   PlayResX: 1080
│   PlayResY: 1920
│   
│   [V4+ Styles]
│   Style: Default,Arial,72,&H00FFFFFF,&H00FFFFFF,&H00000000,...
│   
│   [Events]
│   Dialogue: 0,0:00:00.00,0:00:02.50,Default,,Hello everyone
│   Dialogue: 0,0:00:02.50,0:00:05.00,Default,,welcome to my video
│   ...
├── FFmpeg: Burn captions (low-res preview)
│   ffmpeg -i chunk_0.mp4 -vf "ass=captions.ass" -s 854x480 -preset ultrafast
├── Upload preview to Azure: sessions/{sessionId}/previews/chunk_0_preview.mp4
├── Generate thumbnail
├── Update VideoChunk: status = PREVIEW_READY, previewUrl = ...
├── Publish result
```

#### Step 7: Send First Preview to User
```
[CAPTION-API] All previews generated
     │
     ▼
[Preview Ready Handler]
├── Update CaptionSession: status = REVIEWING, currentChunkIndex = 0
├── Send WhatsApp video message:
│   {
│     type: "video",
│     url: "preview_chunk_0_url",
│     caption: "📺 Preview 1 of 3\nDoes this look good?"
│   }
├── Send WhatsApp buttons:
│   {
│     type: "buttons",
│     buttons: [
│       { id: "approve_0", title: "✓ Approve" },
│       { id: "reject_0", title: "✗ Redo" },
│       { id: "cancel", title: "Cancel" }
│     ]
│   }
```

#### Step 8: User Approves Chunk 1
```
[WHATSAPP] User taps "✓ Approve"
     │
     ▼
[MASTRA AGENT]
├── Intent: APPROVE_CHUNK
├── Tool: handleChunkApproval
     │
     ▼
[handleChunkApproval]
├── Update VideoChunk 0: userApproved = true, status = APPROVED
├── Increment session.currentChunkIndex to 1
├── Check: More chunks? Yes (chunk 1, 2 remaining)
├── Send next preview (chunk 1)
```

#### Steps 9-10: User Approves Chunks 2 and 3
```
(Same flow as Step 8, repeated for each chunk)
```

#### Step 11: All Approved - Start Final Render
```
[handleChunkApproval] for last chunk
├── All chunks approved: true
├── Update CaptionSession: status = RENDERING
├── Queue RENDER_FINAL job:
│   {
│     jobType: "RENDER_FINAL",
│     data: {
│       originalVideoUrl: "original.mp4",
│       chunks: [
│         { transcript: [...], ... },
│         { transcript: [...], ... },
│         { transcript: [...], ... }
│       ],
│       styleId: "style_classic_white",
│       outputFormat: "mp4"
│     }
│   }
├── Send WhatsApp: "🎬 All approved! Rendering final video..."
```

#### Step 12: Final Render
```
[VIDEO-WORKER] Receives RENDER_FINAL job
     │
     ▼
[processRenderFinal]
├── Download original video (HD quality)
├── Merge all transcripts into single ASS file
├── FFmpeg: Burn captions (HD quality)
│   ffmpeg -i original.mp4 -vf "ass=captions.ass" -preset slow -crf 18
├── Upload final video: sessions/{sessionId}/output/final.mp4
├── Get file stats (duration, size)
├── Publish result
```

#### Step 13: Deliver Final Video
```
[CAPTION-API] Receives RENDER_FINAL result
     │
     ▼
[Final Render Handler]
├── Update CaptionSession: status = COMPLETED, finalVideoUrl = ...
├── Increment User.freeVideosUsed
├── Send WhatsApp video:
│   {
│     type: "video",
│     url: "final_video_url",
│     caption: "🎉 Your captioned video is ready!\n📊 Duration: 45s | Size: 12MB"
│   }
├── Send follow-up message:
│   "Thanks for using Caption Bot! You have 1 free video remaining."
```

---

## SCENARIO 2: User Rejects and Corrects Multiple Chunks

### User Journey
```
User sends video → Selects style → Reviews chunk 1 ✓ → Reviews chunk 2 ✗ (reject)
→ Reviews chunk 2 (new) ✓ → Reviews chunk 3 ✗ (reject) → Reviews chunk 3 (new) ✓ 
→ Receives final video
```

### Key Difference: Chunk Rejection Flow

#### User Rejects Chunk 2
```
[WHATSAPP] User taps "✗ Redo"
     │
     ▼
[MASTRA AGENT]
├── Intent: REJECT_CHUNK
├── Tool: handleChunkRejection
     │
     ▼
[handleChunkRejection]
├── Update VideoChunk 1:
│   ├── userApproved = false
│   ├── status = REJECTED → REPROCESSING
│   └── reprocessCount += 1
├── Check reprocessCount < 3? ✓
├── Send WhatsApp: "🔄 Got it! Re-transcribing chunk 2..."
├── Queue new TRANSCRIBE_CHUNK job for chunk 1
│   (Different Whisper parameters for retry)
```

#### Re-transcription
```
[VIDEO-WORKER] TRANSCRIBE_CHUNK (retry)
├── May use different language detection
├── Whisper processes again (results may vary)
├── New transcript generated
├── Queue GENERATE_PREVIEW with new transcript
```

#### New Preview Generated
```
[New Preview Ready]
├── Send same chunk again to user
├── WhatsApp: "📺 Here's the updated preview for chunk 2"
├── Same approve/reject buttons
```

---

## SCENARIO 3: User Goes Idle Mid-Session

### User Journey
```
User sends video → Selects style → Reviews chunk 1 ✓ → User goes offline 
→ 10 minutes pass → Session times out → User returns → Session expired message
```

### Idle Detection Flow

#### Background Timeout Checker (runs periodically)
```
[CRON JOB / Interval] Every 1 minute
     │
     ▼
[Session Timeout Checker]
├── Query: CaptionSession WHERE status IN (REVIEWING, STYLE_SELECTION)
│          AND updatedAt < NOW() - 10 minutes
├── For each expired session:
│   ├── Update CaptionSession: status = FAILED, errorMessage = "Session timed out"
│   ├── Send WhatsApp:
│   │   "⏰ Your session timed out due to inactivity.\n
│   │    Send a new video to start over."
│   └── Queue CLEANUP job to delete temp files
```

#### User Returns After Timeout
```
[WHATSAPP] User sends any message
     │
     ▼
[MASTRA AGENT]
├── Check active session for user
├── Session found but status = FAILED
├── Response: "Your previous session expired. Send a new video to start fresh!"
```

---

## SCENARIO 4: User Cancels Mid-Process

### User Journey
```
User sends video → Selects style → Reviews chunk 1 → User taps "Cancel"
→ Session cancelled → Cleanup
```

### Cancellation Flow

```
[WHATSAPP] User taps "Cancel" button
     │
     ▼
[MASTRA AGENT]
├── Intent: CANCEL_SESSION
├── Tool: handleCancellation
     │
     ▼
[handleCancellation]
├── Update CaptionSession: status = CANCELLED
├── Send WhatsApp: "❌ Session cancelled. Your video was not processed."
├── Queue CLEANUP job:
│   {
│     jobType: "CLEANUP",
│     data: {
│       filesToDelete: [
│         "sessions/{sessionId}/*"
│       ],
│       sessionCompleted: false
│     }
│   }
├── DO NOT increment freeVideosUsed (didn't complete)
```

---

## SCENARIO 5: Free Tier Exhausted

### User Journey
```
User sends 3rd video → Receives "Free tier exhausted" message → Subscription prompt
```

### Free Tier Check Flow

```
[Video Tools - handleVideoUpload]
├── Check: User.freeVideosUsed >= FREE_TIER.MAX_FREE_VIDEOS (2)?
├── Result: TRUE (user has used 2 free videos)
     │
     ▼
[Send Upgrade Prompt]
├── WhatsApp message:
│   "🎬 You've used all your free videos!\n\n
│    Upgrade to Premium for:\n
│    ✓ Unlimited videos\n
│    ✓ Up to 5 minute videos\n
│    ✓ Priority processing\n\n
│    Reply 'SUBSCRIBE' to upgrade!"
├── DO NOT process the video
├── DO NOT create session
```

---

## SCENARIO 6: Video Too Long (Free Tier)

### User Journey
```
User (free tier) sends 3-minute video → Rejected with duration error
```

### Validation Flow

```
[Video Tools - handleVideoUpload]
├── Download video metadata (no full download yet)
├── Duration: 180 seconds
├── User subscription: FREE
├── Max allowed: 60 seconds (FREE_TIER.MAX_VIDEO_DURATION)
├── 180 > 60? TRUE
     │
     ▼
[Send Rejection]
├── WhatsApp:
│   "⚠️ Video is too long!\n\n
│    Free tier limit: 1 minute\n
│    Your video: 3 minutes\n\n
│    Upgrade to Premium for videos up to 5 minutes,
│    or send a shorter video."
├── No session created
├── No files stored
```

---

## SCENARIO 7: Processing Error (Transcription Fails)

### User Journey
```
User sends video with no speech → Transcription returns empty → Error handling
```

### Error Flow

```
[VIDEO-WORKER] TRANSCRIBE_CHUNK
├── Extract audio
├── Whisper API call
├── Response: { text: "", segments: [] }
├── Check: segments.length === 0
     │
     ▼
[Handle No Speech]
├── Return result with status: FAILED
├── Publish to caption:video:results
     │
     ▼
[CAPTION-API] Receives failed result
├── Update VideoChunk: status = FAILED
├── Update CaptionSession: status = FAILED, errorMessage = "No speech detected"
├── Send WhatsApp:
│   "😕 We couldn't detect any speech in your video.\n\n
│    Please send a video with clear audio/speech."
├── Queue CLEANUP job
```

---

## SCENARIO 8: Concurrent Sessions (Not Allowed)

### User Journey
```
User has active session → Sends another video → Rejected
```

### Concurrency Check

```
[Video Tools - handleVideoUpload]
├── Query: CaptionSession WHERE userPhone = user 
│          AND status NOT IN (COMPLETED, FAILED, CANCELLED)
├── Found active session: TRUE
     │
     ▼
[Reject New Upload]
├── WhatsApp:
│   "⏳ You already have a video being processed!\n\n
│    Please complete or cancel your current session first.\n
│    Reply 'STATUS' to check progress or 'CANCEL' to start over."
├── Do not create new session
```

---

## Backend Job Processing Summary

### Job Types and Handlers

| Job Type | Triggered By | Handler | Output |
|----------|-------------|---------|--------|
| VIDEO_UPLOADED | User sends video | Internal routing | Triggers CHUNK_VIDEO |
| CHUNK_VIDEO | VIDEO_UPLOADED | processChunkVideo | Multiple chunks + TRANSCRIBE_CHUNK jobs |
| TRANSCRIBE_CHUNK | CHUNK_VIDEO or rejection | processTranscribeChunk | Transcript JSON |
| GENERATE_PREVIEW | Style selected or re-transcription | processGeneratePreview | Preview video + thumbnail |
| RENDER_FINAL | All chunks approved | processRenderFinal | Final HD video |
| CLEANUP | Session end/cancel/timeout | (not implemented) | Deletes temp files |

### Redis Channel Flow

```
caption-api                          video-worker
    │                                     │
    │──── caption:video:jobs ────────────►│
    │     { jobType, sessionId, data }    │
    │                                     │
    │◄─── caption:video:results ──────────│
    │     { jobId, status, data }         │
    │                                     │
    │──── caption:job:status ────────────►│
    │     (progress updates)              │
```

### Database State Transitions

```
User sends video:
  Session: (created) PENDING
  Chunks: (not created yet)

Chunking complete:
  Session: PENDING → CHUNKING
  Chunks: (created) PENDING

Transcription complete (all):
  Session: CHUNKING → TRANSCRIBING → STYLE_SELECTION
  Chunks: PENDING → TRANSCRIBING → TRANSCRIBED

Style selected:
  Session: STYLE_SELECTION → PREVIEW_READY
  Chunks: TRANSCRIBED → GENERATING_PREVIEW → PREVIEW_READY

During review:
  Session: PREVIEW_READY → REVIEWING
  Chunk approved: PREVIEW_READY → APPROVED
  Chunk rejected: PREVIEW_READY → REJECTED → REPROCESSING

All approved:
  Session: REVIEWING → RENDERING → COMPLETED
  All Chunks: APPROVED
```

---

## Key Configuration Constants

```typescript
// Free Tier Limits
FREE_TIER = {
  MAX_FREE_VIDEOS: 2,
  MAX_VIDEO_DURATION: 60,      // 1 minute
  MAX_FILE_SIZE: 50 * 1024 * 1024  // 50MB
}

// Paid Tier Limits
PAID_TIER = {
  MAX_VIDEO_DURATION: 300,     // 5 minutes
  MAX_FILE_SIZE: 200 * 1024 * 1024  // 200MB
}

// Processing Config
VIDEO_PROCESSING = {
  CHUNK_DURATION: 20,          // 20 seconds per chunk
  MIN_CHUNK_DURATION: 5,
  MAX_CHUNK_DURATION: 30
}

// Session Timeouts
SESSION = {
  INACTIVITY_TIMEOUT: 30 * 60 * 1000,    // 30 minutes
  CHUNK_REVIEW_TIMEOUT: 10 * 60 * 1000,  // 10 minutes per chunk
}

// Job Queue
JOB_QUEUE = {
  MAX_RETRY_ATTEMPTS: 3,
  JOB_TIMEOUT: 5 * 60 * 1000,      // 5 minutes
  LONG_JOB_TIMEOUT: 15 * 60 * 1000 // 15 minutes for rendering
}
```

---

## Error Handling Summary

| Error Type | User Message | Backend Action |
|------------|-------------|----------------|
| Video too long | Duration limit message | No processing |
| File too large | Size limit message | No processing |
| Invalid format | Supported formats list | No processing |
| No speech detected | No speech message | Session failed |
| Transcription error | Processing failed message | Retry or fail |
| Render error | Processing failed message | Session failed |
| Timeout | Session expired message | Cleanup |
| Network error | Try again message | Retry job |

---

## WhatsApp Message Types Used

| Type | Use Case | Example |
|------|----------|---------|
| text | Status updates, errors | "Processing your video..." |
| video | Previews, final video | Preview clip |
| image | Thumbnails | Preview thumbnail |
| interactive/list | Style selection | 10 caption styles |
| interactive/buttons | Approve/Reject/Cancel | 3 action buttons |
| template | Subscription prompts | Upgrade message |

---

This documentation covers all major user flows and backend processes for the WhatsApp Video Captioning Bot.
