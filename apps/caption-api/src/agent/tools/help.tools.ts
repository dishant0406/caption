import { logger } from '@/plugins/logger';
import { FREE_TIER } from '@caption/shared';
import { createTool } from '@mastra/core';
import { z } from 'zod';
import { INTENT_METADATA } from '../intents/metadata';
import { IntentType } from '../types';

/**
 * Help & Support Tools
 */

export const helpTool = createTool({
  id: IntentType.HELP,
  description: INTENT_METADATA[IntentType.HELP].description,
  inputSchema: z.object({
    userPhone: z.string().describe('User phone number'),
  }),
  outputSchema: z.object({
    message: z.string(),
  }),
  execute: async ({ context }) => {
    const { userPhone } = context;

    logger.info('[TOOL CALLED] helpTool', {
      toolId: IntentType.HELP,
      input: { userPhone },
    });

    const helpMessage = `🎬 *WhatsApp Video Caption Bot*

Here's what I can do:

📹 *Add Captions to Videos*
Send me a video and I'll transcribe and add beautiful captions.

🎨 *Caption Styles*
Choose from 10+ professional caption styles.

✅ *Review & Edit*
Review each segment before final rendering.

📊 *Commands:*
• Send a video to start
• "styles" - View caption styles
• "status" - Check processing status
• "help" - Show this message

💡 *Free tier:* ${FREE_TIER.MAX_FREE_VIDEOS} videos free!

Send a video to get started! 🚀`;

    return {
      message: helpMessage,
    };
  },
});

export const howItWorksTool = createTool({
  id: IntentType.HOW_IT_WORKS,
  description: INTENT_METADATA[IntentType.HOW_IT_WORKS].description,
  inputSchema: z.object({
    userPhone: z.string().describe('User phone number'),
  }),
  outputSchema: z.object({
    message: z.string(),
  }),
  execute: async ({ context }) => {
    const { userPhone } = context;

    logger.info('[TOOL CALLED] howItWorksTool', {
      toolId: IntentType.HOW_IT_WORKS,
      input: { userPhone },
    });

    const message = `🔄 *How It Works*

*Step 1: Send Video* 📹
Send me any video (up to 10 mins)

*Step 2: AI Transcription* 🤖
I'll use advanced AI to transcribe your video's audio

*Step 3: Choose Style* 🎨
Pick from 10+ beautiful caption styles

*Step 4: Review Chunks* ✅
Your video is split into segments for easy review
Approve, edit, or regenerate each caption

*Step 5: Final Render* 🎬
I'll create your HD video with burned-in captions

*Step 6: Download* ⬇️
Get your captioned video delivered right here!

Ready? Send a video to start! 🚀`;

    return {
      message,
    };
  },
});

export const checkUsageTool = createTool({
  id: IntentType.CHECK_USAGE,
  description: INTENT_METADATA[IntentType.CHECK_USAGE].description,
  inputSchema: z.object({
    userPhone: z.string().describe('User phone number'),
  }),
  outputSchema: z.object({
    message: z.string(),
    freeVideosRemaining: z.number().optional(),
    totalProcessed: z.number().optional(),
  }),
  execute: async ({ context }) => {
    const { userPhone } = context;

    logger.info('[TOOL CALLED] checkUsageTool', {
      toolId: IntentType.CHECK_USAGE,
      input: { userPhone },
    });

    try {
      // TODO: Get user usage from database
      const freeVideosUsed = 0;
      const freeVideosRemaining = FREE_TIER.MAX_FREE_VIDEOS - freeVideosUsed;

      return {
        message: `📊 *Your Usage*

🎬 Videos processed: ${freeVideosUsed}
🆓 Free videos remaining: ${freeVideosRemaining}

${freeVideosRemaining <= 0 
  ? '⚠️ You\'ve used all free videos. Upgrade to continue!'
  : `You have ${freeVideosRemaining} free ${freeVideosRemaining === 1 ? 'video' : 'videos'} left.`}

Type "upgrade" to see premium plans.`,
        freeVideosRemaining,
        totalProcessed: freeVideosUsed,
      };
    } catch (error) {
      logger.error('[TOOL ERROR] checkUsageTool', error instanceof Error ? error : new Error(String(error)));
      return {
        message: '❌ Failed to check usage.',
      };
    }
  },
});

export const viewSubscriptionTool = createTool({
  id: IntentType.VIEW_SUBSCRIPTION,
  description: INTENT_METADATA[IntentType.VIEW_SUBSCRIPTION].description,
  inputSchema: z.object({
    userPhone: z.string().describe('User phone number'),
  }),
  outputSchema: z.object({
    message: z.string(),
    plan: z.string().optional(),
  }),
  execute: async ({ context }) => {
    const { userPhone } = context;

    logger.info('[TOOL CALLED] viewSubscriptionTool', {
      toolId: IntentType.VIEW_SUBSCRIPTION,
      input: { userPhone },
    });

    try {
      // TODO: Get subscription from database

      return {
        message: `💳 *Subscription Status*

Plan: Free Tier
Videos processed: 0/${FREE_TIER.MAX_FREE_VIDEOS}

*Premium Plans:*

🥈 *Basic* - ₹199/month
• 20 videos/month
• All caption styles
• Priority processing

🥇 *Pro* - ₹499/month
• Unlimited videos
• All styles + custom fonts
• Fastest processing
• No watermark

Reply "upgrade" to get started!`,
        plan: 'free',
      };
    } catch (error) {
      logger.error('[TOOL ERROR] viewSubscriptionTool', error instanceof Error ? error : new Error(String(error)));
      return {
        message: '❌ Failed to check subscription.',
      };
    }
  },
});

// Export all help tools
export const helpTools = [
  helpTool,
  howItWorksTool,
  checkUsageTool,
  viewSubscriptionTool,
];
