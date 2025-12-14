import { env } from '@/config';
import { Plan, User } from '@/models';
import { logger } from '@/plugins/logger';
import ReferralService from '@/services/referral.service';
import { SUBSCRIPTION_TIERS } from '@caption/shared';
import { createTool } from '@mastra/core';
import { Polar } from '@polar-sh/sdk';
import { z } from 'zod';

// Initialize Polar SDK
const polar = new Polar({
  accessToken: env.POLAR_ACCESS_TOKEN || '',
  server: env.POLAR_SERVER === 'sandbox' ? 'sandbox' : 'production',
});

/**
 * Tool to show pricing information
 */
export const pricingTool = createTool({
  id: 'show_pricing',
  description:
    'Shows subscription pricing tiers and features. Use when user asks about pricing, plans, or subscription options.',
  inputSchema: z.object({
    phoneNumber: z.string().describe('User phone number'),
  }),
  execute: async ({ context }: { context: { phoneNumber: string } }) => {
    try {
      const { phoneNumber } = context;

      const user = await User.findOne({
        where: { phoneNumber },
        include: [{ model: Plan, as: 'subscriptionPlan' }],
      }) as any;

      const currentPlan = user?.subscriptionPlan?.planType || 'FREE';

      const pricingMessage = `
📊 *Caption Bot Pricing Plans*

${Object.entries(SUBSCRIPTION_TIERS)
  .map(([tier, details]: [string, any]) => {
    const isCurrent = tier === currentPlan;
    const badge = isCurrent ? '✅ *Your Current Plan*' : '';
    
    return `
*${tier} PLAN* ${badge}
💰 Price: $${details.price}/month
⏱️ Minutes: ${details.minutesPerMonth === Infinity ? 'Unlimited' : `${details.minutesPerMonth} min/month`}
📹 Max Video Length: ${details.maxVideoLength}s
📦 Max File Size: ${(details.maxFileSize / (1024 * 1024)).toFixed(0)}MB
✨ Features:
${details.features.map((f: string) => `  • ${f}`).join('\n')}
`;
  })
  .join('\n---\n')}

💡 *Pay-Per-Use Top-Up*
$1.00 per minute (no subscription needed)

🎁 *Referral Rewards*
• Refer friends: 0.5 min per free user (max 10)
• Paid referrals: 3 min per subscriber (unlimited)

📲 To subscribe or upgrade, use: SUBSCRIBE [PLAN_NAME]
Example: SUBSCRIBE PRO
`;

      return pricingMessage.trim();
    } catch (error) {
      logger.error('Error in pricingTool', error instanceof Error ? error : new Error(String(error)));
      return 'Sorry, I could not fetch pricing information. Please try again later.';
    }
  },
});

/**
 * Tool to generate subscription checkout link
 */
export const subscribeTool = createTool({
  id: 'create_subscription',
  description:
    'Creates a Polar.sh checkout link for subscription purchase. Use when user wants to subscribe or upgrade their plan.',
  inputSchema: z.object({
    phoneNumber: z.string().describe('User phone number'),
    planType: z
      .enum(['STARTER', 'PRO', 'UNLIMITED'])
      .describe('Subscription tier to purchase'),
  }),
  execute: async ({ context }: { context: { phoneNumber: string; planType: 'STARTER' | 'PRO' | 'UNLIMITED' } }) => {
    try {
      const { phoneNumber, planType } = context;

      const user = await User.findOne({
        where: { phoneNumber },
      });

      if (!user) {
        return 'User not found. Please register first.';
      }

      const plan = await Plan.findOne({
        where: { planType },
      });

      if (!plan || !plan.polarProductId || !plan.polarPriceId) {
        return `The ${planType} plan is not available at the moment. Please contact support.`;
      }

      // Create a checkout session using Polar SDK with new API
      try {
        const checkout = await polar.checkouts.create({
          products: [plan.polarProductId!],
          customerEmail: user.phoneNumber ? `${user.phoneNumber}@caption.bot` : undefined,
          externalCustomerId: user.phoneNumber, // Pass phone as external customer ID
          metadata: {
            internal_user_id: user.phoneNumber, // Phone number is our user ID
            internal_plan_id: plan.id,
            plan_type: plan.planType,
          },
          successUrl: `${env.APP_URL || 'https://caption.bot'}/success?checkout_id={CHECKOUT_ID}&phone=${encodeURIComponent(user.phoneNumber)}&plan=${plan.planType}`,
        })

        return `
✨ *Subscribe to ${planType} Plan*

💰 Price: $${plan.price}/month
⏱️ Minutes: ${plan.minutesPerMonth} min/month
📹 Max Length: ${plan.maxVideoLength}s

🔗 *Click here to subscribe:*
${checkout.url}

After payment, your subscription will be activated automatically and you'll receive ${plan.minutesPerMonth} minutes for the month!

Need help? Reply HELP
`;
      } catch (checkoutError) {
        logger.error('Error creating Polar checkout', checkoutError instanceof Error ? checkoutError : new Error(String(checkoutError)));
        return 'Sorry, there was an error creating your checkout link. Please try again later or contact support.';
      }
    } catch (error) {
      logger.error('Error in subscribeTool', error instanceof Error ? error : new Error(String(error)));
      return 'Sorry, I could not create a checkout link. Please try again later.';
    }
  },
});

/**
 * Tool to generate one-time topup checkout link
 */
export const topupTool = createTool({
  id: 'create_topup',
  description:
    'Creates a checkout link for one-time minute top-up. Use when user wants to buy minutes without subscription.',
  inputSchema: z.object({
    phoneNumber: z.string().describe('User phone number'),
    minutes: z
      .number()
      .min(1)
      .max(100)
      .describe('Number of minutes to purchase (1-100)'),
  }),
  execute: async ({ context }: { context: { phoneNumber: string; minutes: number } }) => {
    try {
      const { phoneNumber, minutes } = context;

      const user = await User.findOne({
        where: { phoneNumber },
      });

      if (!user) {
        return 'User not found. Please register first.';
      }

      const cost = minutes * 1; // $1 per minute
      
      return `
💳 *One-Time Top-Up*

⏱️ Minutes: ${minutes} min
💰 Cost: $${cost.toFixed(2)}

🔄 This feature is coming soon!

For now, please use our subscription plans:
Reply PRICING to see plans

💡 Tip: PRO plan ($15) gives you 150 minutes - that's only $0.10/min!
`;
    } catch (error) {
      logger.error('Error in topupTool', error instanceof Error ? error : new Error(String(error)));
      return 'Sorry, I could not create a top-up link. Please try again later.';
    }
  },
});

/**
 * Tool to show user's account status
 */
export const statusTool = createTool({
  id: 'show_status',
  description:
    "Shows user's current subscription status, balance, and usage. Use when user asks about their account, balance, or subscription.",
  inputSchema: z.object({
    phoneNumber: z.string().describe('User phone number'),
  }),
  execute: async ({ context }: { context: { phoneNumber: string } }) => {
    try {
      const { phoneNumber } = context;

      const user = await User.findOne({
        where: { phoneNumber },
        include: [{ model: Plan, as: 'subscriptionPlan' }],
      }) as any;

      if (!user) {
        return 'User not found. Please send a message to register.';
      }

      const plan = user.subscriptionPlan;
      const totalMinutes = user.minutesBalance + user.bonusMinutesBalance;
      const resetDate = user.monthlyResetDate
        ? new Date(user.monthlyResetDate).toLocaleDateString()
        : 'N/A';

      const statusMessage = `
📊 *Your Account Status*

*Current Plan:* ${plan?.planType || 'FREE'}
💰 Price: $${plan?.price || 0}/month

*Minutes Balance:*
📦 Subscription: ${user.minutesBalance.toFixed(1)} min
🎁 Bonus: ${user.bonusMinutesBalance.toFixed(1)} min
📊 *Total Available: ${totalMinutes.toFixed(1)} min*

*Subscription Details:*
🔄 Monthly Reset: ${resetDate}
📹 Max Video Length: ${plan?.maxVideoLength || 60}s
📦 Max File Size: ${plan ? (plan.maxFileSize / (1024 * 1024)).toFixed(0) : 10}MB

*Usage Stats:*
🎬 Videos Processed: ${user.freeVideosUsed || 0}

Need more minutes? Reply PRICING
Want to upgrade? Reply SUBSCRIBE PRO
`;

      return statusMessage.trim();
    } catch (error) {
      logger.error('Error in statusTool', error instanceof Error ? error : new Error(String(error)));
      return 'Sorry, I could not fetch your account status. Please try again later.';
    }
  },
});

/**
 * Tool to show referral information
 */
export const referralTool = createTool({
  id: 'show_referral',
  description:
    "Shows user's referral code and stats. Use when user asks about referrals, inviting friends, or earning bonuses.",
  inputSchema: z.object({
    phoneNumber: z.string().describe('User phone number'),
  }),
  execute: async ({ context }: { context: { phoneNumber: string } }) => {
    try {
      const { phoneNumber } = context;

      const stats = await ReferralService.getReferralStats(phoneNumber);

      if (!stats) {
        return 'User not found. Please send a message to register.';
      }

      const referralMessage = `
🎁 *Referral Program*

*Your Referral Code:* ${stats.referralCode}

*How It Works:*
1️⃣ Share your code with friends
2️⃣ They enter it when signing up
3️⃣ Earn bonus minutes when they:
   • Process first video: +0.5 min (max 10 free users)
   • Subscribe to any plan: +3 min (unlimited!)

*Your Stats:*
📊 Total Referrals: ${stats.totalReferrals}
🆓 Free User Refs: ${stats.freeReferrals}/10
💎 Paid User Refs: ${stats.paidReferrals}
⏳ Pending: ${stats.pendingReferrals}
✨ Total Earned: ${stats.totalMinutesEarned.toFixed(1)} minutes

${stats.canEarnFromFreeReferrals ? `💡 You can earn from ${stats.freeReferralsRemaining} more free users!` : '⚠️ Free user limit reached. Earn unlimited from paid subscribers!'}

*Share Your Code:*
"Hey! Try Caption Bot for WhatsApp videos. Use code ${stats.referralCode} when signing up!"
`;

      return referralMessage.trim();
    } catch (error) {
      logger.error('Error in referralTool', error instanceof Error ? error : new Error(String(error)));
      return 'Sorry, I could not fetch your referral information. Please try again later.';
    }
  },
});

const subscriptionTools = [
  pricingTool,
  subscribeTool,
  topupTool,
  statusTool,
  referralTool,
];

export default subscriptionTools;
