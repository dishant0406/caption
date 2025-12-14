import { SUBSCRIPTION_TIERS } from '@caption/shared';
import { QueryInterface } from 'sequelize';

export default {
  async up(queryInterface: QueryInterface): Promise<void> {
    const now = new Date();

    const plans = [
      {
        id: '00000000-0000-0000-0000-000000000001', // Static UUID for FREE tier
        plan_type: 'FREE',
        minutes_per_month: SUBSCRIPTION_TIERS.FREE.minutesPerMonth,
        max_video_length: SUBSCRIPTION_TIERS.FREE.maxVideoLength,
        max_file_size: SUBSCRIPTION_TIERS.FREE.maxFileSize,
        price: SUBSCRIPTION_TIERS.FREE.price,
        currency: 'USD',
        refill_monthly: true,
        features: JSON.stringify(SUBSCRIPTION_TIERS.FREE.features),
        is_active: true,
        polar_product_id: null, // Free tier doesn't need Polar product
        polar_price_id: null,
        created_at: now,
        updated_at: now,
      },
      {
        id: '00000000-0000-0000-0000-000000000002', // Static UUID for STARTER
        plan_type: 'STARTER',
        minutes_per_month: SUBSCRIPTION_TIERS.STARTER.minutesPerMonth,
        max_video_length: SUBSCRIPTION_TIERS.STARTER.maxVideoLength,
        max_file_size: SUBSCRIPTION_TIERS.STARTER.maxFileSize,
        price: SUBSCRIPTION_TIERS.STARTER.price,
        currency: 'USD',
        refill_monthly: true,
        features: JSON.stringify(SUBSCRIPTION_TIERS.STARTER.features),
        is_active: true,
        polar_product_id: process.env.POLAR_STARTER_PRODUCT_ID || null,
        polar_price_id: process.env.POLAR_STARTER_PRICE_ID || null,
        created_at: now,
        updated_at: now,
      },
      {
        id: '00000000-0000-0000-0000-000000000003', // Static UUID for PRO
        plan_type: 'PRO',
        minutes_per_month: SUBSCRIPTION_TIERS.PRO.minutesPerMonth,
        max_video_length: SUBSCRIPTION_TIERS.PRO.maxVideoLength,
        max_file_size: SUBSCRIPTION_TIERS.PRO.maxFileSize,
        price: SUBSCRIPTION_TIERS.PRO.price,
        currency: 'USD',
        refill_monthly: true,
        features: JSON.stringify(SUBSCRIPTION_TIERS.PRO.features),
        is_active: true,
        polar_product_id: process.env.POLAR_PRO_PRODUCT_ID || null,
        polar_price_id: process.env.POLAR_PRO_PRICE_ID || null,
        created_at: now,
        updated_at: now,
      },
      {
        id: '00000000-0000-0000-0000-000000000004', // Static UUID for UNLIMITED
        plan_type: 'UNLIMITED',
        minutes_per_month: SUBSCRIPTION_TIERS.UNLIMITED.minutesPerMonth,
        max_video_length: SUBSCRIPTION_TIERS.UNLIMITED.maxVideoLength,
        max_file_size: SUBSCRIPTION_TIERS.UNLIMITED.maxFileSize,
        price: SUBSCRIPTION_TIERS.UNLIMITED.price,
        currency: 'USD',
        refill_monthly: true,
        features: JSON.stringify(SUBSCRIPTION_TIERS.UNLIMITED.features),
        is_active: true,
        polar_product_id: process.env.POLAR_UNLIMITED_PRODUCT_ID || null,
        polar_price_id: process.env.POLAR_UNLIMITED_PRICE_ID || null,
        created_at: now,
        updated_at: now,
      },
    ];

    await queryInterface.bulkInsert('plans', plans);
  },

  async down(queryInterface: QueryInterface): Promise<void> {
    await queryInterface.bulkDelete('plans', {});
  },
};
