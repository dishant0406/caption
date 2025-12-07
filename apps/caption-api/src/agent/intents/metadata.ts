import { IntentCategory, IntentMetadata, IntentType } from '../types';

/**
 * Intent Metadata for Video Captioning Bot
 * Provides descriptions and examples for each intent
 */
export const INTENT_METADATA: Record<IntentType, IntentMetadata> = {
  // VIDEO PROCESSING INTENTS
  [IntentType.START_CAPTIONING]: {
    type: IntentType.START_CAPTIONING,
    category: IntentCategory.VIDEO_PROCESSING,
    description: 'Start captioning a new video. User should send a video first.',
    examples: [
      'Add captions to this video',
      'Caption this',
      'I want to add subtitles',
      'Process this video',
    ],
  },
  [IntentType.PROCESS_VIDEO]: {
    type: IntentType.PROCESS_VIDEO,
    category: IntentCategory.VIDEO_PROCESSING,
    description: 'Process an uploaded video for captioning',
    examples: ['Process the video', 'Start processing'],
    requiredEntities: ['videoUrl'],
  },
  [IntentType.CHECK_VIDEO_STATUS]: {
    type: IntentType.CHECK_VIDEO_STATUS,
    category: IntentCategory.VIDEO_PROCESSING,
    description: 'Check the current status of video processing',
    examples: ['What is the status?', 'How is my video doing?', 'Is it done?'],
  },
  [IntentType.CANCEL_VIDEO_PROCESSING]: {
    type: IntentType.CANCEL_VIDEO_PROCESSING,
    category: IntentCategory.VIDEO_PROCESSING,
    description: 'Cancel the current video processing',
    examples: ['Cancel', 'Stop processing', 'Never mind', 'Abort'],
  },
  [IntentType.REPROCESS_VIDEO]: {
    type: IntentType.REPROCESS_VIDEO,
    category: IntentCategory.VIDEO_PROCESSING,
    description: 'Reprocess the video with different settings',
    examples: ['Try again', 'Reprocess', 'Start over'],
  },

  // STYLE SELECTION INTENTS
  [IntentType.VIEW_CAPTION_STYLES]: {
    type: IntentType.VIEW_CAPTION_STYLES,
    category: IntentCategory.STYLE_SELECTION,
    description: 'View all available caption styles',
    examples: [
      'Show me the styles',
      'What styles are available?',
      'Caption options',
      'List styles',
    ],
  },
  [IntentType.SELECT_CAPTION_STYLE]: {
    type: IntentType.SELECT_CAPTION_STYLE,
    category: IntentCategory.STYLE_SELECTION,
    description: 'Select a caption style for the video',
    examples: [
      'Use style 1',
      'I want the bold yellow style',
      'Select neon glow',
      'Choose minimalist',
    ],
    requiredEntities: ['styleId'],
  },
  [IntentType.PREVIEW_STYLE]: {
    type: IntentType.PREVIEW_STYLE,
    category: IntentCategory.STYLE_SELECTION,
    description: 'Preview how a style looks on the video',
    examples: [
      'Preview style 2',
      'Show me how it looks',
      'Can I see a preview?',
    ],
    optionalEntities: ['styleId'],
  },
  [IntentType.CHANGE_STYLE]: {
    type: IntentType.CHANGE_STYLE,
    category: IntentCategory.STYLE_SELECTION,
    description: 'Change the selected caption style',
    examples: [
      'Change style',
      'Use a different style',
      'Switch to another style',
    ],
  },
  [IntentType.CHANGE_CAPTION_MODE]: {
    type: IntentType.CHANGE_CAPTION_MODE,
    category: IntentCategory.STYLE_SELECTION,
    description: 'Change caption mode between word-by-word (TikTok style) and sentence chunks (YouTube style). User says things like "use sentence mode", "switch to word by word", "do sentence chunks instead".',
    examples: [
      'use sentence mode',
      'switch to word by word',
      'do sentence chunks',
      'change to sentence chunks',
      'word by word mode',
      'sentence by sentence',
      'use word mode',
      'instead of word by word do sentence',
      'change caption mode to sentence',
    ],
    requiredEntities: ['captionMode'],
  },

  // TRANSCRIPTION INTENTS
  [IntentType.VIEW_TRANSCRIPTION]: {
    type: IntentType.VIEW_TRANSCRIPTION,
    category: IntentCategory.TRANSCRIPTION,
    description: 'View the transcribed text',
    examples: [
      'Show transcription',
      'What did it hear?',
      'Show me the text',
    ],
  },
  [IntentType.EDIT_TRANSCRIPTION]: {
    type: IntentType.EDIT_TRANSCRIPTION,
    category: IntentCategory.TRANSCRIPTION,
    description: 'Edit the transcribed text',
    examples: [
      'Edit transcription',
      'Fix the text',
      'Change word X to Y',
    ],
    requiredEntities: ['editedText'],
  },
  [IntentType.CORRECT_TRANSCRIPTION]: {
    type: IntentType.CORRECT_TRANSCRIPTION,
    category: IntentCategory.TRANSCRIPTION,
    description: 'Correct the transcription for the current chunk with user-provided text. User provides corrected text after "fix:" prefix.',
    examples: [
      'fix: Hello world this is correct',
      'fix: The correct text goes here',
      'correct: This is what it should say',
      'Fix the caption to say...',
    ],
    requiredEntities: ['correctedText'],
  },
  [IntentType.CONVERT_TRANSCRIPT]: {
    type: IntentType.CONVERT_TRANSCRIPT,
    category: IntentCategory.TRANSCRIPTION,
    description: 'Convert or transform the transcript text using AI. This can include language conversion (e.g., Hindi to Hinglish, formal to casual), transliteration, or style changes. User says things like "convert to Hinglish", "make it casual", "translate to English".',
    examples: [
      'convert to Hinglish',
      'make it Hinglish',
      'change to English',
      'translate to Hindi',
      'make it casual',
      'convert the captions to Hinglish',
      'change the language to English',
      'romanize the text',
    ],
    requiredEntities: ['conversionType'],
  },
  [IntentType.REGENERATE_TRANSCRIPTION]: {
    type: IntentType.REGENERATE_TRANSCRIPTION,
    category: IntentCategory.TRANSCRIPTION,
    description: 'Regenerate the transcription',
    examples: [
      'Transcribe again',
      'Retry transcription',
      'The transcription is wrong',
    ],
  },

  // CHUNK APPROVAL INTENTS
  [IntentType.VIEW_CURRENT_CHUNK]: {
    type: IntentType.VIEW_CURRENT_CHUNK,
    category: IntentCategory.APPROVAL,
    description: 'View the current chunk for review',
    examples: [
      'Show current chunk',
      'Show me the clip',
      'What chunk is this?',
    ],
  },
  [IntentType.APPROVE_CHUNK]: {
    type: IntentType.APPROVE_CHUNK,
    category: IntentCategory.APPROVAL,
    description: 'Approve the current chunk and move to next',
    examples: [
      'Looks good',
      'Approve',
      'Next',
      'OK',
      '✅',
      'Yes',
      'Good',
    ],
  },
  [IntentType.REJECT_CHUNK]: {
    type: IntentType.REJECT_CHUNK,
    category: IntentCategory.APPROVAL,
    description: 'Reject the current chunk',
    examples: [
      'Not good',
      'Reject',
      'Wrong',
      '❌',
      'No',
      'Bad',
    ],
  },
  [IntentType.EDIT_CHUNK_CAPTION]: {
    type: IntentType.EDIT_CHUNK_CAPTION,
    category: IntentCategory.APPROVAL,
    description: 'Edit the caption for the current chunk',
    examples: [
      'Edit this caption',
      'Change the text to...',
      'Fix this part',
    ],
    requiredEntities: ['newCaption'],
  },
  [IntentType.SKIP_TO_CHUNK]: {
    type: IntentType.SKIP_TO_CHUNK,
    category: IntentCategory.APPROVAL,
    description: 'Skip to a specific chunk number',
    examples: [
      'Go to chunk 3',
      'Skip to part 5',
      'Jump to segment 2',
    ],
    requiredEntities: ['chunkNumber'],
  },
  [IntentType.APPROVE_ALL_CHUNKS]: {
    type: IntentType.APPROVE_ALL_CHUNKS,
    category: IntentCategory.APPROVAL,
    description: 'Approve all remaining chunks at once',
    examples: [
      'Approve all',
      'Accept everything',
      'All looks good',
      'Skip review',
    ],
  },

  // FINAL RENDER INTENTS
  [IntentType.START_FINAL_RENDER]: {
    type: IntentType.START_FINAL_RENDER,
    category: IntentCategory.VIDEO_PROCESSING,
    description: 'Start rendering the final video with captions',
    examples: [
      'Render now',
      'Create the final video',
      'Generate video',
      'Finish',
    ],
  },
  [IntentType.CHECK_RENDER_STATUS]: {
    type: IntentType.CHECK_RENDER_STATUS,
    category: IntentCategory.VIDEO_PROCESSING,
    description: 'Check the status of final rendering',
    examples: [
      'Is it ready?',
      'How long?',
      'Render status',
    ],
  },
  [IntentType.DOWNLOAD_VIDEO]: {
    type: IntentType.DOWNLOAD_VIDEO,
    category: IntentCategory.VIDEO_PROCESSING,
    description: 'Get the download link for the captioned video',
    examples: [
      'Send me the video',
      'Download',
      'Get the file',
    ],
  },

  // SESSION MANAGEMENT INTENTS
  [IntentType.VIEW_SESSION_STATUS]: {
    type: IntentType.VIEW_SESSION_STATUS,
    category: IntentCategory.SESSION,
    description: 'View current session status',
    examples: [
      'Where am I?',
      'What step?',
      'Session status',
    ],
  },
  [IntentType.LIST_MY_SESSIONS]: {
    type: IntentType.LIST_MY_SESSIONS,
    category: IntentCategory.SESSION,
    description: 'List all user sessions',
    examples: [
      'My videos',
      'My sessions',
      'History',
    ],
  },
  [IntentType.RESUME_SESSION]: {
    type: IntentType.RESUME_SESSION,
    category: IntentCategory.SESSION,
    description: 'Resume a previous session',
    examples: [
      'Resume',
      'Continue where I left off',
      'Go back to my video',
    ],
    optionalEntities: ['sessionId'],
  },
  [IntentType.END_SESSION]: {
    type: IntentType.END_SESSION,
    category: IntentCategory.SESSION,
    description: 'End the current session',
    examples: [
      'Done',
      'End session',
      'Finish',
      'Exit',
    ],
  },

  // HELP & SUPPORT INTENTS
  [IntentType.HELP]: {
    type: IntentType.HELP,
    category: IntentCategory.HELP,
    description: 'Get help with using the bot',
    examples: [
      'Help',
      'What can you do?',
      'Commands',
      'How to use',
    ],
  },
  [IntentType.HOW_IT_WORKS]: {
    type: IntentType.HOW_IT_WORKS,
    category: IntentCategory.HELP,
    description: 'Explain how the captioning process works',
    examples: [
      'How does it work?',
      'Explain the process',
      'What happens to my video?',
    ],
  },
  [IntentType.REPORT_ISSUE]: {
    type: IntentType.REPORT_ISSUE,
    category: IntentCategory.HELP,
    description: 'Report a problem or bug',
    examples: [
      'Something is wrong',
      'Report bug',
      'Problem',
      'Issue',
    ],
  },

  // SUBSCRIPTION INTENTS
  [IntentType.CHECK_USAGE]: {
    type: IntentType.CHECK_USAGE,
    category: IntentCategory.SUBSCRIPTION,
    description: 'Check remaining free videos or usage',
    examples: [
      'How many free videos left?',
      'My usage',
      'Credits',
    ],
  },
  [IntentType.VIEW_SUBSCRIPTION]: {
    type: IntentType.VIEW_SUBSCRIPTION,
    category: IntentCategory.SUBSCRIPTION,
    description: 'View subscription status',
    examples: [
      'My subscription',
      'Am I subscribed?',
      'Plan details',
    ],
  },
  [IntentType.UPGRADE_SUBSCRIPTION]: {
    type: IntentType.UPGRADE_SUBSCRIPTION,
    category: IntentCategory.SUBSCRIPTION,
    description: 'Upgrade to paid subscription',
    examples: [
      'Upgrade',
      'Get premium',
      'Buy subscription',
      'Pricing',
    ],
  },

  // CONFIRMATION INTENTS
  [IntentType.CONFIRM_ACTION]: {
    type: IntentType.CONFIRM_ACTION,
    category: IntentCategory.SESSION,
    description: 'Confirm a pending action',
    examples: [
      'Yes',
      'Confirm',
      'Sure',
      'Do it',
    ],
  },
  [IntentType.DENY_ACTION]: {
    type: IntentType.DENY_ACTION,
    category: IntentCategory.SESSION,
    description: 'Deny/cancel a pending action',
    examples: [
      'No',
      'Cancel',
      'Never mind',
      "Don't do it",
    ],
  },
};
