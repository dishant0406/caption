import { Plan, type PlanType } from '@/models';
import { SUBSCRIPTION_TIERS } from '@caption/shared';
import { Router, type Request, type Response } from 'express';

const router: Router = Router();

/**
 * POST /api/seed/plans
 * Seed the database with subscription plans
 */
router.post('/plans', async (_req: Request, res: Response) => {
  try {
    const now = new Date();

    const plans = [
      {
        id: '00000000-0000-0000-0000-000000000001',
        planType: 'FREE' as PlanType,
        minutesPerMonth: SUBSCRIPTION_TIERS.FREE.minutesPerMonth,
        maxVideoLength: SUBSCRIPTION_TIERS.FREE.maxVideoLength,
        maxFileSize: SUBSCRIPTION_TIERS.FREE.maxFileSize,
        price: SUBSCRIPTION_TIERS.FREE.price,
        currency: 'USD',
        refillMonthly: true,
        features: [...SUBSCRIPTION_TIERS.FREE.features],
        isActive: true,
        polarProductId: null,
        polarPriceId: null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: '00000000-0000-0000-0000-000000000002',
        planType: 'STARTER' as PlanType,
        minutesPerMonth: SUBSCRIPTION_TIERS.STARTER.minutesPerMonth,
        maxVideoLength: SUBSCRIPTION_TIERS.STARTER.maxVideoLength,
        maxFileSize: SUBSCRIPTION_TIERS.STARTER.maxFileSize,
        price: SUBSCRIPTION_TIERS.STARTER.price,
        currency: 'USD',
        refillMonthly: true,
        features: [...SUBSCRIPTION_TIERS.STARTER.features],
        isActive: true,
        polarProductId: process.env.POLAR_STARTER_PRODUCT_ID || null,
        polarPriceId: process.env.POLAR_STARTER_PRICE_ID || null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: '00000000-0000-0000-0000-000000000003',
        planType: 'PRO' as PlanType,
        minutesPerMonth: SUBSCRIPTION_TIERS.PRO.minutesPerMonth,
        maxVideoLength: SUBSCRIPTION_TIERS.PRO.maxVideoLength,
        maxFileSize: SUBSCRIPTION_TIERS.PRO.maxFileSize,
        price: SUBSCRIPTION_TIERS.PRO.price,
        currency: 'USD',
        refillMonthly: true,
        features: [...SUBSCRIPTION_TIERS.PRO.features],
        isActive: true,
        polarProductId: process.env.POLAR_PRO_PRODUCT_ID || null,
        polarPriceId: process.env.POLAR_PRO_PRICE_ID || null,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: '00000000-0000-0000-0000-000000000004',
        planType: 'UNLIMITED' as PlanType,
        minutesPerMonth: SUBSCRIPTION_TIERS.UNLIMITED.minutesPerMonth,
        maxVideoLength: SUBSCRIPTION_TIERS.UNLIMITED.maxVideoLength,
        maxFileSize: SUBSCRIPTION_TIERS.UNLIMITED.maxFileSize,
        price: SUBSCRIPTION_TIERS.UNLIMITED.price,
        currency: 'USD',
        refillMonthly: true,
        features: [...SUBSCRIPTION_TIERS.UNLIMITED.features],
        isActive: true,
        polarProductId: process.env.POLAR_UNLIMITED_PRODUCT_ID || null,
        polarPriceId: process.env.POLAR_UNLIMITED_PRICE_ID || null,
        createdAt: now,
        updatedAt: now,
      },
    ];

    // Use upsert to insert or update plans
    const createdPlans = await Promise.all(
      plans.map((plan) =>
        Plan.upsert(plan, {
          conflictFields: ['id'],
        })
      )
    );

    res.json({
      success: true,
      message: 'Plans seeded successfully',
      data: {
        plansCreated: createdPlans.length,
        plans: plans.map((p) => ({
          id: p.id,
          planType: p.planType,
          minutesPerMonth: p.minutesPerMonth,
          price: p.price,
        })),
      },
    });
  } catch (error) {
    console.error('Error seeding plans:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to seed plans',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/seed/plans
 * Get all plans from the database
 */
router.get('/plans', async (_req: Request, res: Response) => {
  try {
    const plans = await Plan.findAll({
      order: [['price', 'ASC']],
    });

    res.json({
      success: true,
      data: {
        count: plans.length,
        plans: plans.map((plan: any) => ({
          id: plan.id,
          planType: plan.planType,
          minutesPerMonth: plan.minutesPerMonth,
          maxVideoLength: plan.maxVideoLength,
          maxFileSize: plan.maxFileSize,
          price: plan.price,
          currency: plan.currency,
          features: plan.features,
          isActive: plan.isActive,
          polarProductId: plan.polarProductId,
          polarPriceId: plan.polarPriceId,
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching plans:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch plans',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
