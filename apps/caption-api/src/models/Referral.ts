import { getSequelize } from '@/config/database';
import {
    CreationOptional,
    DataTypes,
    ForeignKey,
    InferAttributes,
    InferCreationAttributes,
    Model,
    ModelStatic,
} from 'sequelize';
import type { UserModel } from './User';

export type ReferralStatus = 'PENDING' | 'COMPLETED' | 'REWARDED';
export type ReferralType = 'FREE' | 'PAID';

// Referral model interface
export interface ReferralModel
  extends Model<InferAttributes<ReferralModel>, InferCreationAttributes<ReferralModel>> {
  id: CreationOptional<string>;
  referralCode: string;
  referrerPhone: ForeignKey<UserModel['phoneNumber']>;
  referredPhone: CreationOptional<ForeignKey<UserModel['phoneNumber']> | null>;
  status: CreationOptional<ReferralStatus>;
  referralType: CreationOptional<ReferralType | null>;
  minutesAwarded: CreationOptional<number>;
  completedAt: CreationOptional<Date | null>;
  rewardedAt: CreationOptional<Date | null>;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
}

// Referral model - will be initialized later
export let Referral: ModelStatic<ReferralModel>;

// Initialize Referral model function
export const initializeReferralModel = (): ModelStatic<ReferralModel> => {
  Referral = getSequelize().define<ReferralModel>(
    'Referral',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      referralCode: {
        type: DataTypes.STRING(20),
        allowNull: false,
        comment: 'Unique referral code',
      },
      referrerPhone: {
        type: DataTypes.STRING(15),
        allowNull: false,
        comment: 'Phone number of user who referred',
        references: {
          model: 'users',
          key: 'phone_number',
        },
      },
      referredPhone: {
        type: DataTypes.STRING(15),
        allowNull: true,
        comment: 'Phone number of referred user',
        references: {
          model: 'users',
          key: 'phone_number',
        },
      },
      status: {
        type: DataTypes.ENUM('PENDING', 'COMPLETED', 'REWARDED'),
        allowNull: false,
        defaultValue: 'PENDING',
      },
      referralType: {
        type: DataTypes.ENUM('FREE', 'PAID'),
        allowNull: true,
      },
      minutesAwarded: {
        type: DataTypes.FLOAT,
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: 0,
        },
        comment: 'Minutes awarded to referrer (0.5 for free, 3 for paid)',
      },
      completedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'When referred user completed qualifying action',
      },
      rewardedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        comment: 'When bonus was awarded to referrer',
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    },
    {
      tableName: 'referrals',
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ['referral_code'],
        },
        {
          fields: ['referrer_phone'],
        },
        {
          fields: ['referred_phone'],
        },
        {
          fields: ['status'],
        },
        {
          fields: ['referral_type'],
        },
      ],
    }
  );

  return Referral;
};
