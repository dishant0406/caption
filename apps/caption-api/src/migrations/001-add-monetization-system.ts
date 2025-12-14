import { DataTypes, QueryInterface, Transaction } from 'sequelize';

// Helper function to check if column exists
async function columnExists(
  queryInterface: QueryInterface,
  tableName: string,
  columnName: string
): Promise<boolean> {
  try {
    const table = await queryInterface.describeTable(tableName);
    return columnName in table;
  } catch (error) {
    return false;
  }
}

export default {
  async up(queryInterface: QueryInterface): Promise<void> {
    await queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      // 1. Create Plans table
      await queryInterface.createTable(
        'plans',
        {
          id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
          },
          planType: {
            type: DataTypes.ENUM('FREE', 'STARTER', 'PRO', 'UNLIMITED'),
            allowNull: false,
            unique: true,
            field: 'plan_type',
          },
          minutesPerMonth: {
            type: DataTypes.FLOAT,
            allowNull: false,
            field: 'minutes_per_month',
          },
          maxVideoLength: {
            type: DataTypes.INTEGER,
            allowNull: false,
            field: 'max_video_length',
          },
          maxFileSize: {
            type: DataTypes.INTEGER,
            allowNull: false,
            field: 'max_file_size',
          },
          price: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0,
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
            field: 'refill_monthly',
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
            field: 'is_active',
          },
          polarProductId: {
            type: DataTypes.STRING,
            allowNull: true,
            field: 'polar_product_id',
          },
          polarPriceId: {
            type: DataTypes.STRING,
            allowNull: true,
            field: 'polar_price_id',
          },
          createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
            field: 'created_at',
          },
          updatedAt: {
            type: DataTypes.DATE,
            allowNull: false,
            field: 'updated_at',
          },
        },
        { transaction }
      );

      // 2. Create Referrals table
      await queryInterface.createTable(
        'referrals',
        {
          id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
          },
          referralCode: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
            field: 'referral_code',
          },
          referrerPhone: {
            type: DataTypes.STRING,
            allowNull: false,
            field: 'referrer_phone',
          },
          referredPhone: {
            type: DataTypes.STRING,
            allowNull: false,
            field: 'referred_phone',
          },
          status: {
            type: DataTypes.ENUM('PENDING', 'COMPLETED', 'REWARDED'),
            allowNull: false,
            defaultValue: 'PENDING',
          },
          referralType: {
            type: DataTypes.ENUM('FREE', 'PAID'),
            allowNull: true,
            field: 'referral_type',
          },
          minutesAwarded: {
            type: DataTypes.FLOAT,
            allowNull: true,
            field: 'minutes_awarded',
          },
          completedAt: {
            type: DataTypes.DATE,
            allowNull: true,
            field: 'completed_at',
          },
          rewardedAt: {
            type: DataTypes.DATE,
            allowNull: true,
            field: 'rewarded_at',
          },
          createdAt: {
            type: DataTypes.DATE,
            allowNull: false,
            field: 'created_at',
          },
          updatedAt: {
            type: DataTypes.DATE,
            allowNull: false,
            field: 'updated_at',
          },
        },
        { transaction }
      );

      // 3. Add new columns to Users table
      const subscriptionPlanIdExists = await columnExists(
        queryInterface,
        'users',
        'subscription_plan_id'
      );
      if (!subscriptionPlanIdExists) {
        await queryInterface.addColumn(
          'users',
          'subscription_plan_id',
          {
            type: DataTypes.UUID,
            allowNull: true,
            references: {
              model: 'plans',
              key: 'id',
            },
            onUpdate: 'CASCADE',
            onDelete: 'SET NULL',
          },
          { transaction }
        );
      }

      const minutesBalanceExists = await columnExists(
        queryInterface,
        'users',
        'minutes_balance'
      );
      if (!minutesBalanceExists) {
        await queryInterface.addColumn(
          'users',
          'minutes_balance',
          {
            type: DataTypes.FLOAT,
            allowNull: false,
            defaultValue: 0,
          },
          { transaction }
        );
      }

      const bonusMinutesBalanceExists = await columnExists(
        queryInterface,
        'users',
        'bonus_minutes_balance'
      );
      if (!bonusMinutesBalanceExists) {
        await queryInterface.addColumn(
          'users',
          'bonus_minutes_balance',
          {
            type: DataTypes.FLOAT,
            allowNull: false,
            defaultValue: 0,
          },
          { transaction }
        );
      }

      const monthlyResetDateExists = await columnExists(
        queryInterface,
        'users',
        'monthly_reset_date'
      );
      if (!monthlyResetDateExists) {
        await queryInterface.addColumn(
          'users',
          'monthly_reset_date',
          {
            type: DataTypes.DATE,
            allowNull: true,
          },
          { transaction }
        );
      }

      const polarCustomerIdExists = await columnExists(
        queryInterface,
        'users',
        'polar_customer_id'
      );
      if (!polarCustomerIdExists) {
        await queryInterface.addColumn(
          'users',
          'polar_customer_id',
          {
            type: DataTypes.STRING,
            allowNull: true,
            unique: true,
          },
          { transaction }
        );
      }

      const polarSubscriptionIdExists = await columnExists(
        queryInterface,
        'users',
        'polar_subscription_id'
      );
      if (!polarSubscriptionIdExists) {
        await queryInterface.addColumn(
          'users',
          'polar_subscription_id',
          {
            type: DataTypes.STRING,
            allowNull: true,
          },
          { transaction }
        );
      }

      const referralCodeExists = await columnExists(
        queryInterface,
        'users',
        'referral_code'
      );
      if (!referralCodeExists) {
        await queryInterface.addColumn(
          'users',
          'referral_code',
          {
            type: DataTypes.STRING,
            allowNull: true,
            unique: true,
          },
          { transaction }
        );
      }

      const referredByExists = await columnExists(
        queryInterface,
        'users',
        'referred_by'
      );
      if (!referredByExists) {
        await queryInterface.addColumn(
          'users',
          'referred_by',
          {
            type: DataTypes.STRING,
            allowNull: true,
          },
          { transaction }
        );
      }

      const freeReferralCountExists = await columnExists(
        queryInterface,
        'users',
        'free_referral_count'
      );
      if (!freeReferralCountExists) {
        await queryInterface.addColumn(
          'users',
          'free_referral_count',
          {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
          },
          { transaction }
        );
      }

      const paidReferralCountExists = await columnExists(
        queryInterface,
        'users',
        'paid_referral_count'
      );
      if (!paidReferralCountExists) {
        await queryInterface.addColumn(
          'users',
          'paid_referral_count',
          {
            type: DataTypes.INTEGER,
            allowNull: false,
            defaultValue: 0,
          },
          { transaction }
        );
      }

      // 4. Create indexes
      await queryInterface.addIndex('referrals', ['referrer_phone'], {
        name: 'idx_referrals_referrer',
        transaction,
      });

      await queryInterface.addIndex('referrals', ['referred_phone'], {
        name: 'idx_referrals_referred',
        transaction,
      });

      await queryInterface.addIndex('referrals', ['status'], {
        name: 'idx_referrals_status',
        transaction,
      });

      await queryInterface.addIndex('users', ['polar_customer_id'], {
        name: 'idx_users_polar_customer',
        transaction,
      });

      await queryInterface.addIndex('users', ['referral_code'], {
        name: 'idx_users_referral_code',
        transaction,
      });
    });
  },

  async down(queryInterface: QueryInterface): Promise<void> {
    await queryInterface.sequelize.transaction(async (transaction: Transaction) => {
      // Remove indexes
      await queryInterface.removeIndex('users', 'idx_users_referral_code', {
        transaction,
      });
      await queryInterface.removeIndex('users', 'idx_users_polar_customer', {
        transaction,
      });
      await queryInterface.removeIndex('referrals', 'idx_referrals_status', {
        transaction,
      });
      await queryInterface.removeIndex('referrals', 'idx_referrals_referred', {
        transaction,
      });
      await queryInterface.removeIndex('referrals', 'idx_referrals_referrer', {
        transaction,
      });

      // Remove columns from Users
      await queryInterface.removeColumn('users', 'paid_referral_count', {
        transaction,
      });
      await queryInterface.removeColumn('users', 'free_referral_count', {
        transaction,
      });
      await queryInterface.removeColumn('users', 'referred_by', {
        transaction,
      });
      await queryInterface.removeColumn('users', 'referral_code', {
        transaction,
      });
      await queryInterface.removeColumn('users', 'polar_subscription_id', {
        transaction,
      });
      await queryInterface.removeColumn('users', 'polar_customer_id', {
        transaction,
      });
      await queryInterface.removeColumn('users', 'monthly_reset_date', {
        transaction,
      });
      await queryInterface.removeColumn('users', 'bonus_minutes_balance', {
        transaction,
      });
      await queryInterface.removeColumn('users', 'minutes_balance', {
        transaction,
      });
      await queryInterface.removeColumn('users', 'subscription_plan_id', {
        transaction,
      });

      // Drop tables
      await queryInterface.dropTable('referrals', { transaction });
      await queryInterface.dropTable('plans', { transaction });
    });
  },
};
