import { calculateMinutesRequired, hasEnoughMinutes } from '@caption/shared';
import { Plan, User } from '../../models';
import { logger } from '../../plugins/logger';
import ReferralService from '../referral.service';

export interface ValidationResult {
  allowed: boolean;
  message: string;
  minutesRequired?: number;
  minutesAvailable?: number;
  userPlan?: string;
}

export default class SubscriptionValidationService {
  /**
   * Check if user can process a video based on minute balance
   */
  static async validateVideoProcessing(
    phoneNumber: string,
    videoDurationSeconds: number
  ): Promise<ValidationResult> {
    try {
      const user = await User.findOne({
        where: { phoneNumber },
        include: [{ model: Plan, as: 'subscriptionPlan' }],
      }) as any;

      if (!user) {
        return {
          allowed: false,
          message: 'User not found. Please send a message to register.',
        };
      }

      const plan = user.subscriptionPlan;
      if (!plan) {
        return {
          allowed: false,
          message: 'No active subscription plan. Please contact support.',
        };
      }

      // Check video length limit
      if (videoDurationSeconds > plan.maxVideoLength) {
        return {
          allowed: false,
          message: `❌ Video too long!\n\n📹 Your video: ${videoDurationSeconds}s\n⏱️ Plan limit: ${plan.maxVideoLength}s\n\n💡 Upgrade to ${this.suggestPlanForLength(videoDurationSeconds)} plan to process longer videos!\n\nReply PRICING to see plans.`,
        };
      }

      // Calculate minutes required (rounded)
      const minutesRequired = calculateMinutesRequired(videoDurationSeconds);
      const totalMinutes = user.minutesBalance + user.bonusMinutesBalance;

      // Check if user has enough minutes
      const hasMinutes = hasEnoughMinutes(totalMinutes, minutesRequired);

      if (!hasMinutes) {
        const deficit = minutesRequired - totalMinutes;
        const topupCost = Math.ceil(deficit);
        
        return {
          allowed: false,
          message: `⚠️ *Insufficient Minutes*\n\n⏱️ Required: ${minutesRequired.toFixed(1)} min\n📊 Available: ${totalMinutes.toFixed(1)} min\n❌ Short: ${deficit.toFixed(1)} min\n\n💡 *Options:*\n\n1️⃣ *Top-up:* Buy ${topupCost} minute${topupCost > 1 ? 's' : ''} for $${topupCost}\n   Reply: TOPUP ${topupCost}\n\n2️⃣ *Subscribe:* Get more value!\n   • PRO: 150 min/month for $15 ($0.10/min)\n   • STARTER: 30 min/month for $5 ($0.17/min)\n   Reply: PRICING\n\n3️⃣ *Refer Friends:* Earn free minutes!\n   Reply: REFERRAL`,
          minutesRequired,
          minutesAvailable: totalMinutes,
          userPlan: plan.planType,
        };
      }

      return {
        allowed: true,
        message: 'Video can be processed',
        minutesRequired,
        minutesAvailable: totalMinutes,
        userPlan: plan.planType,
      };
    } catch (error) {
      logger.error('Error validating video processing', error instanceof Error ? error : new Error(String(error)));
      return {
        allowed: false,
        message: 'Sorry, I could not validate your request. Please try again later.',
      };
    }
  }

  /**
   * Deduct minutes from user balance after successful video processing
   */
  static async deductMinutes(
    phoneNumber: string,
    videoDurationSeconds: number
  ): Promise<void> {
    try {
      const user = await User.findOne({
        where: { phoneNumber },
      });

      if (!user) {
        logger.error('User not found for minute deduction', new Error('User not found'));
        return;
      }

      const minutesRequired = calculateMinutesRequired(videoDurationSeconds);

      // Deduct from bonus balance first, then subscription balance
      if (user.bonusMinutesBalance >= minutesRequired) {
        await user.decrement('bonusMinutesBalance', { by: minutesRequired });
      } else {
        const bonusUsed = user.bonusMinutesBalance;
        const subscriptionUsed = minutesRequired - bonusUsed;

        await user.update({
          bonusMinutesBalance: 0,
          minutesBalance: user.minutesBalance - subscriptionUsed,
        });
      }

      // Increment legacy counter for backward compatibility
      await user.increment('freeVideosUsed');

      // Check if this is user's first video (for referral completion)
      if (user.freeVideosUsed === 0 && user.referredBy) {
        await ReferralService.completeReferral(phoneNumber, 'FREE');
      }

      logger.info('Minutes deducted from user', {
        phoneNumber,
        minutesDeducted: minutesRequired,
        remainingSubscription: user.minutesBalance - (minutesRequired > user.bonusMinutesBalance ? minutesRequired - user.bonusMinutesBalance : 0),
        remainingBonus: Math.max(0, user.bonusMinutesBalance - minutesRequired),
      });
    } catch (error) {
      logger.error('Error deducting minutes', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Suggest appropriate plan for video length
   */
  private static suggestPlanForLength(durationSeconds: number): string {
    if (durationSeconds <= 180) return 'STARTER';
    if (durationSeconds <= 300) return 'PRO';
    return 'UNLIMITED';
  }

  /**
   * Get user's current usage and balance info
   */
  static async getUserBalance(phoneNumber: string): Promise<{
    subscriptionMinutes: number;
    bonusMinutes: number;
    totalMinutes: number;
    planType: string;
    maxVideoLength: number;
    monthlyResetDate: Date | null;
    videosProcessed: number;
  } | null> {
    const user = await User.findOne({
      where: { phoneNumber },
      include: [{ model: Plan, as: 'subscriptionPlan' }],
    }) as any;

    if (!user) {
      return null;
    }

    const plan = user.subscriptionPlan;

    return {
      subscriptionMinutes: user.minutesBalance,
      bonusMinutes: user.bonusMinutesBalance,
      totalMinutes: user.minutesBalance + user.bonusMinutesBalance,
      planType: plan?.planType || 'FREE',
      maxVideoLength: plan?.maxVideoLength || 60,
      monthlyResetDate: user.monthlyResetDate,
      videosProcessed: user.freeVideosUsed,
    };
  }
}
