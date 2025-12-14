import { PRICING } from '@caption/shared';
import { Op } from 'sequelize';
import { Referral, User } from '../models';
import { logger } from '../plugins/logger';

export default class ReferralService {
  /**
   * Generate a unique referral code
   */
  static async generateReferralCode(): Promise<string> {
    const prefix = 'CAPTION';
    let code: string;
    let exists = true;

    // Keep trying until we get a unique code
    while (exists) {
      // Generate 5 random alphanumeric characters
      const randomPart = Math.random()
        .toString(36)
        .substring(2, 7)
        .toUpperCase();
      code = `${prefix}-${randomPart}`;

      // Check if code already exists
      const existing = await Referral.findOne({
        where: { referralCode: code },
      });

      exists = !!existing;
    }

    return code!;
  }

  /**
   * Create a referral relationship
   */
  static async createReferral(
    referrerPhone: string,
    referredPhone: string,
    referralCode: string
  ): Promise<void> {
    try {
      // Verify referrer exists and has the code
      const referrer = await User.findOne({
        where: { phoneNumber: referrerPhone, referralCode },
      });

      if (!referrer) {
        throw new Error('Invalid referral code');
      }

      // Check if referred user already exists
      const existingReferred = await User.findOne({
        where: { phoneNumber: referredPhone },
      });

      if (existingReferred?.referredBy) {
        throw new Error('User already referred by someone else');
      }

      // Check referrer's free referral limit
      // Check referrer's free referral limit
      const freeReferralCount = await Referral.count({
        where: {
          referrerPhone,
          referralType: 'FREE',
          status: { [Op.in]: ['COMPLETED', 'REWARDED'] },
        },
      });
      if (freeReferralCount >= PRICING.MAX_FREE_REFERRALS) {
        logger.warn('Referrer reached max free referrals', {
          referrerPhone,
          count: freeReferralCount,
        });
      }

      // Create referral record
      await Referral.create({
        referralCode,
        referrerPhone,
        referredPhone,
        status: 'PENDING',
        referralType: undefined, // Will be set when completed
        minutesAwarded: undefined,
      });

      // Update referred user
      if (existingReferred) {
        await existingReferred.update({ referredBy: referralCode });
      }

      logger.info('Referral created', {
        referrerPhone,
        referredPhone,
        referralCode,
      });
    } catch (error) {
      logger.error('Failed to create referral', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  /**
   * Complete a referral when referred user processes first video or subscribes
   */
  static async completeReferral(
    referredPhone: string,
    type: 'FREE' | 'PAID'
  ): Promise<void> {
    try {
      // Find pending referral
      const referral = await Referral.findOne({
        where: {
          referredPhone,
          status: 'PENDING',
        },
      });

      if (!referral) {
        logger.warn('No pending referral found', { referredPhone });
        return;
      }

      // Find referrer
      const referrer = await User.findOne({
        where: { phoneNumber: referral.referrerPhone },
      });

      if (!referrer) {
        logger.error('Referrer not found for referral completion', new Error('Referrer not found'));
        return;
      }

      // Determine bonus amount
      let minutesBonus: number;
      let shouldAward = true;

      if (type === 'FREE') {
        // Check if referrer has reached free referral limit
        if (referrer.freeReferralCount >= PRICING.MAX_FREE_REFERRALS) {
          logger.info('Referrer at max free referrals, no bonus awarded', {
            referrerPhone: referrer.phoneNumber,
          });
          shouldAward = false;
          minutesBonus = 0;
        } else {
          minutesBonus = PRICING.FREE_REFERRAL_BONUS;
        }
      } else {
        minutesBonus = PRICING.PAID_REFERRAL_BONUS;
      }

      // Update referral status
      await referral.update({
        status: shouldAward ? 'COMPLETED' : 'REWARDED', // Skip rewarding if limit reached
        referralType: type,
        minutesAwarded: minutesBonus,
        completedAt: new Date(),
        rewardedAt: shouldAward ? new Date() : null,
      });

      if (!shouldAward) {
        return;
      }

      // Award bonus minutes to referrer
      await referrer.increment('bonusMinutesBalance', {
        by: minutesBonus,
      });

      // Update referral counts
      if (type === 'FREE') {
        await referrer.increment('freeReferralCount');
      } else {
        await referrer.increment('paidReferralCount');
      }

      logger.info('Referral completed and rewarded', {
        referrerPhone: referrer.phoneNumber,
        referredPhone,
        type,
        minutesAwarded: minutesBonus,
      });
    } catch (error) {
      logger.error('Failed to complete referral', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Reward referrer (called after completion)
   */
  static async rewardReferrer(referralId: string): Promise<void> {
    try {
      const referral = await Referral.findByPk(referralId);

      if (!referral || referral.status !== 'COMPLETED') {
        logger.warn('Referral not found or not completed', { referralId });
        return;
      }

      const referrer = await User.findOne({
        where: { phoneNumber: referral.referrerPhone },
      });

      if (!referrer) {
        logger.error('Referrer not found for reward', new Error('Referrer not found'), {
          referrerPhone: referral.referrerPhone,
        });
        return;
      }

      // Award bonus minutes
      if (referral.minutesAwarded) {
        await referrer.increment('bonusMinutesBalance', {
          by: referral.minutesAwarded,
        });

        await referral.update({
          status: 'REWARDED',
          rewardedAt: new Date(),
        });

        logger.info('Referrer rewarded', {
          referrerPhone: referrer.phoneNumber,
          minutesAwarded: referral.minutesAwarded,
        });
      }
    } catch (error) {
      logger.error('Failed to reward referrer', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Get referral stats for a user
   */
  static async getReferralStats(phoneNumber: string): Promise<{
    referralCode: string | null;
    totalReferrals: number;
    freeReferrals: number;
    paidReferrals: number;
    pendingReferrals: number;
    totalMinutesEarned: number;
    canEarnFromFreeReferrals: boolean;
    freeReferralsRemaining: number;
  } | null> {
    const user = await User.findOne({
      where: { phoneNumber },
    });

    if (!user) {
      return null;
    }

    const referrals = await Referral.findAll({
      where: { referrerPhone: phoneNumber },
    });

    const stats = {
      referralCode: user.referralCode,
      totalReferrals: referrals.length,
      freeReferrals: user.freeReferralCount,
      paidReferrals: user.paidReferralCount,
      pendingReferrals: referrals.filter((r: any) => r.status === 'PENDING').length,
      totalMinutesEarned: referrals.reduce(
        (sum: number, r: any) => sum + (r.minutesAwarded || 0),
        0
      ),
      canEarnFromFreeReferrals:
        user.freeReferralCount < PRICING.MAX_FREE_REFERRALS,
      freeReferralsRemaining: Math.max(
        0,
        PRICING.MAX_FREE_REFERRALS - user.freeReferralCount
      ),
    };

    return stats;
  }
}
