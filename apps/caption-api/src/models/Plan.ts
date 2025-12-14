import { getSequelize } from '@/config/database';
import {
    CreationOptional,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    Model,
    ModelStatic,
} from 'sequelize';

export type PlanType = 'FREE' | 'STARTER' | 'PRO' | 'UNLIMITED';

// Plan model interface
export interface PlanModel
  extends Model<InferAttributes<PlanModel>, InferCreationAttributes<PlanModel>> {
  id: CreationOptional<string>;
  planType: PlanType;
  minutesPerMonth: number;
  maxVideoLength: number; // seconds
  maxFileSize: number; // bytes
  price: number; // USD
  currency: CreationOptional<string>;
  refillMonthly: CreationOptional<boolean>;
  features: CreationOptional<string[]>;
  isActive: CreationOptional<boolean>;
  polarProductId: CreationOptional<string | null>; // Polar.sh product ID
  polarPriceId: CreationOptional<string | null>; // Polar.sh price ID
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
}

// Plan model - will be initialized later
export let Plan: ModelStatic<PlanModel>;

// Initialize Plan model function
export const initializePlanModel = (): ModelStatic<PlanModel> => {
  Plan = getSequelize().define<PlanModel>(
    'Plan',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      planType: {
        type: DataTypes.ENUM('FREE', 'STARTER', 'PRO', 'UNLIMITED'),
        allowNull: false,
      },
      minutesPerMonth: {
        type: DataTypes.FLOAT,
        allowNull: false,
        validate: {
          min: 0,
        },
      },
      maxVideoLength: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'Maximum video length in seconds',
        validate: {
          min: 1,
        },
      },
      maxFileSize: {
        type: DataTypes.BIGINT,
        allowNull: false,
        comment: 'Maximum file size in bytes',
        validate: {
          min: 1,
        },
      },
      price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        validate: {
          min: 0,
        },
      },
      currency: {
        type: DataTypes.STRING(3),
        allowNull: false,
        defaultValue: 'USD',
      },
      refillMonthly: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      features: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: [],
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      polarProductId: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'Polar.sh product ID for this plan',
      },
      polarPriceId: {
        type: DataTypes.STRING(100),
        allowNull: true,
        comment: 'Polar.sh price ID for this plan',
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
      tableName: 'plans',
      timestamps: true,
      indexes: [
        {
          unique: true,
          fields: ['plan_type'],
        },
        {
          fields: ['is_active'],
        },
      ],
    }
  );

  return Plan;
};
