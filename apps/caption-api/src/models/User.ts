import { getSequelize } from '@/config/database';
import type { SubscriptionStatus } from '@caption/shared';
import {
  CreationOptional,
  DataTypes,
  ForeignKey,
  InferAttributes,
  InferCreationAttributes,
  Model,
  ModelStatic,
} from 'sequelize';
import type { PlanModel } from './Plan';

// User model interface
export interface UserModel
  extends Model<InferAttributes<UserModel>, InferCreationAttributes<UserModel>> {
  phoneNumber: string; // Primary key - E.164 format
  whatsappId: string;
  name: string;
  
  // Legacy fields (will be deprecated)
  freeVideosUsed: CreationOptional<number>;
  
  // New minutes-based system
  subscriptionPlanId: CreationOptional<ForeignKey<PlanModel['id']> | null>;
  minutesBalance: CreationOptional<number>;
  bonusMinutesBalance: CreationOptional<number>;
  monthlyResetDate: CreationOptional<Date | null>;
  
  // Subscription management
  subscriptionStatus: CreationOptional<SubscriptionStatus>;
  subscriptionExpiresAt: CreationOptional<Date | null>;
  
  // Polar.sh integration
  polarCustomerId: CreationOptional<string | null>;
  polarSubscriptionId: CreationOptional<string | null>;
  
  // Referral system
  referralCode: CreationOptional<string | null>;
  referredBy: CreationOptional<string | null>;
  freeReferralCount: CreationOptional<number>;
  paidReferralCount: CreationOptional<number>;
  
  // Metadata
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
  lastActiveAt: CreationOptional<Date | null>;
}

// User model - will be initialized later
export let User: ModelStatic<UserModel>;

// Initialize User model function
export const initializeUserModel = (): ModelStatic<UserModel> => {
  User = getSequelize().define<UserModel>(
    'User',
    {
      phoneNumber: {
        type: DataTypes.STRING(15),
        primaryKey: true,
        allowNull: false,
        validate: {
          is: /^\+[1-9]\d{1,14}$/, // E.164 format validation
        },
      },
      whatsappId: {
        type: DataTypes.STRING(50),
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
        validate: {
          len: [1, 100],
        },
      },
      freeVideosUsed: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        validate: {
          min: 0,
        },
        comment: 'Legacy field - will be deprecated',
      },
      subscriptionPlanId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'plans',
          key: 'id',
        },
        comment: 'Foreign key to Plan model',
      },
      minutesBalance: {
        type: DataTypes.FLOAT,
        defaultValue: 2, // Free tier starts with 2 minutes
        validate: {
          min: 0,
        },
        comment: 'Available minutes from subscription',
      },
      bonusMinutesBalance: {
        type: DataTypes.FLOAT,
        defaultValue: 0,
        validate: {
          min: 0,
        },
        comment: 'Bonus minutes from referrals and top-ups',
      },
      monthlyResetDate: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'Date when monthly minutes refill',
      },
      subscriptionStatus: {
        type: DataTypes.ENUM('FREE', 'ACTIVE', 'EXPIRED', 'CANCELLED'),
        defaultValue: 'FREE',
      },
      subscriptionExpiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      polarCustomerId: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'Polar.sh customer ID',
      },
      polarSubscriptionId: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'Polar.sh subscription ID',
      },
      referralCode: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: 'Unique referral code for this user',
      },
      referredBy: {
        type: DataTypes.STRING(20),
        allowNull: true,
        comment: 'Referral code of user who referred them',
      },
      freeReferralCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        validate: {
          min: 0,
          max: 10, // Max 10 free referrals
        },
        comment: 'Number of free tier referrals (max 10)',
      },
      paidReferralCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        validate: {
          min: 0,
        },
        comment: 'Number of paid tier referrals (unlimited)',
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      lastActiveAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      tableName: 'users',
      indexes: [
        {
          fields: ['whatsapp_id'],
          unique: true,
        },
        {
          fields: ['referral_code'],
          unique: true,
        },
        {
          fields: ['subscription_status'],
        },
        {
          fields: ['last_active_at'],
        },
      ],
    }
  );

  return User;
};
