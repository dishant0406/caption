import { getSequelize } from '@/config/database';
import type { SubscriptionStatus } from '@caption/shared';
import {
    CreationOptional,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    Model,
    ModelStatic,
} from 'sequelize';

// User model interface
export interface UserModel
  extends Model<InferAttributes<UserModel>, InferCreationAttributes<UserModel>> {
  phoneNumber: string; // Primary key - E.164 format
  whatsappId: string;
  name: string;
  freeVideosUsed: CreationOptional<number>;
  subscriptionStatus: CreationOptional<SubscriptionStatus>;
  subscriptionExpiresAt: CreationOptional<Date | null>;
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
        unique: true,
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
      },
      subscriptionStatus: {
        type: DataTypes.ENUM('FREE', 'ACTIVE', 'EXPIRED', 'CANCELLED'),
        defaultValue: 'FREE',
      },
      subscriptionExpiresAt: {
        type: DataTypes.DATE,
        allowNull: true,
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
