
// Use require for CommonJS module - package exports map /webhooks to dist/commonjs/webhooks.js
const { validateEvent } = require('@polar-sh/sdk/webhooks');
import { Request, Response } from 'express';
import { env } from '../../config';
import { Plan, User } from '../../models';
import { logger } from '../../plugins/logger';
import { whatsappService } from '../whatsapp';

// Type alias for the webhook payload (return type of validateEvent)
type WebhookPayload = ReturnType<typeof validateEvent>;

// Type guards and helpers for webhook data
type Checkout = any;
type Customer = any;
type Order = any;
type Subscription = any;

export class PolarWebhookService {
  /**
   * Verify webhook signature using Polar SDK's validateEvent
   * Polar follows Standard Webhooks: https://www.standardwebhooks.com/
   */
  private static verifyWebhookSignature(
    payload: string,
    headers: Record<string, string | string[] | undefined>,
    secret: string
  ): WebhookPayload {
    try {
      // Convert headers to match Standard Webhooks format
      const webhookHeaders: Record<string, string> = {};
      
      for (const [key, value] of Object.entries(headers)) {
        if (typeof value === 'string') {
          webhookHeaders[key] = value;
        } else if (Array.isArray(value)) {
          webhookHeaders[key] = value[0] || '';
        }
      }

      // Use Polar SDK's validateEvent function
      const event = validateEvent(payload, webhookHeaders, secret);
      
      logger.info('Webhook signature verified successfully');
      
      return event;
    } catch (error: any) {
      if (error?.constructor?.name === 'WebhookVerificationError' || error?.name === 'WebhookVerificationError') {
        logger.error('Webhook signature verification failed', new Error(error?.message || String(error)));
        throw new Error('Invalid webhook signature');
      }
      
      logger.error('Error verifying webhook', error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }
  /**
   * Handle incoming Polar.sh webhooks
   */
  static async handleWebhook(req: Request, res: Response): Promise<void> {
    try {
      // Convert Buffer to string for webhook validation
      const payload = Buffer.isBuffer(req.body) 
        ? req.body.toString('utf-8') 
        : typeof req.body === 'string' 
          ? req.body 
          : JSON.stringify(req.body);

      // Verify webhook signature and get validated event
      const event = this.verifyWebhookSignature(
        payload,
        req.headers as Record<string, string | string[] | undefined>,
        env.POLAR_WEBHOOK_SECRET || ''
      );

      logger.info('Received Polar webhook', {
        type: event.type,
        timestamp: new Date().toISOString(),
      });

      // Route to appropriate handler
      switch (event.type) {
        case 'subscription.created':
          await this.handleSubscriptionCreated(event.data);
          break;
        case 'subscription.active':
          await this.handleSubscriptionActive(event.data);
          break;
        case 'subscription.updated':
          await this.handleSubscriptionUpdated(event.data);
          break;
        case 'subscription.canceled':
          await this.handleSubscriptionCanceled(event.data);
          break;
        case 'subscription.revoked':
          await this.handleSubscriptionRevoked(event.data);
          break;
        case 'order.created':
          await this.handleOrderCreated(event.data);
          break;
        case 'order.paid':
          await this.handleOrderPaid(event.data);
          break;
        case 'customer.created':
          await this.handleCustomerCreated(event.data);
          break;
        case 'customer.updated':
          await this.handleCustomerUpdated(event.data);
          break;
        case 'checkout.created':
          await this.handleCheckoutCreated(event.data);
          break;
        case 'checkout.updated':
          await this.handleCheckoutUpdated(event.data);
          break;
        case 'customer.state_changed':
          await this.handleCustomerStateChanged(event.data);
          break;
        default:
          logger.warn('Unhandled webhook event type', { type: event.type });
      }

      res.status(200).send({ received: true });
    } catch (error) {
      // Return 200 for signature verification errors to avoid retries
      if (error instanceof Error && error.message === 'Invalid webhook signature') {
        logger.warn('Invalid webhook signature', { error: error.message });
        res.status(200).send({ error: 'Invalid signature' });
        return;
      }
      
      logger.error('Webhook processing error', error instanceof Error ? error : new Error(String(error)));
      // Still return 200 to avoid retries for unrecoverable errors
      res.status(200).send({ error: 'Internal server error' });
    }
  }

  /**
   * Handle subscription.created event
   * Called when a new subscription is created (may not be active yet)
   */
  private static async handleSubscriptionCreated(data: Subscription): Promise<void> {
    // Extract customer_id - Polar may send it as user_id in some webhook versions
    const customerId = data.customer_id || data.user_id;
    
    // Try to get user info from metadata first (internal_user_id = phoneNumber in our system)
    const metadata = data.metadata || data.customer_metadata || {};
    const internalUserId = metadata.internal_user_id || metadata.internal_plan_id;
    const customerEmail = data.customer_email || data.email;
    
    logger.info('Processing subscription.created', {
      subscriptionId: data.id,
      customerId: customerId,
      productId: data.product_id,
      internalUserId,
      customerEmail,
      hasMetadata: !!internalUserId,
    });

    // Find user: 1) internal_user_id from metadata (phoneNumber), 2) email pattern, 3) polarCustomerId
    let user = null;
    
    if (internalUserId) {
      user = await User.findOne({ where: { phoneNumber: internalUserId } });
      logger.info('Found user by internal_user_id from metadata', { phoneNumber: internalUserId });
    } else if (customerEmail && customerEmail.includes('@caption.bot')) {
      // Extract phone number from email format: {phoneNumber}@caption.bot
      const extractedPhone = customerEmail.split('@')[0];
      user = await User.findOne({ where: { phoneNumber: extractedPhone } });
      logger.info('Found user by email pattern', { customerEmail, extractedPhone });
    } else if (customerId) {
      user = await User.findOne({ where: { polarCustomerId: customerId } });
      logger.info('Found user by polarCustomerId', { customerId });
    }

    if (!user) {
      logger.warn('User not found for subscription', {
        customerId,
        internalUserId,
        metadata,
      });
      return;
    }

    // Find the plan by Polar product ID or internal_plan_id from metadata
    let plan = null;
    if (metadata.internal_plan_id) {
      plan = await Plan.findByPk(metadata.internal_plan_id);
      logger.info('Found plan by internal_plan_id from metadata', { planId: metadata.internal_plan_id });
    }
    
    if (!plan && data.product_id) {
      plan = await Plan.findOne({
        where: { polarProductId: data.product_id },
      });
      logger.info('Found plan by polarProductId', { productId: data.product_id });
    }

    if (!plan) {
      logger.warn('Plan not found for product', { productId: data.product_id, metadata });
      return;
    }

    // Calculate next reset date if current_period_end is available
    let nextReset = null;
    if (data.current_period_end) {
      nextReset = new Date(data.current_period_end);
    } else {
      // Default to 30 days from now if period end not provided
      nextReset = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    }

    // Update user with subscription info and grant minutes immediately
    await user.update({
      polarCustomerId: customerId || user.polarCustomerId,
      polarSubscriptionId: data.id,
      subscriptionPlanId: plan.id,
      minutesBalance: plan.minutesPerMonth,
      monthlyResetDate: nextReset,
    });

    logger.info('Subscription created and linked to user', {
      phoneNumber: user.phoneNumber,
      planType: plan.planType,
      minutesGranted: plan.minutesPerMonth,
    });

    // Send WhatsApp message to notify user
    try {
      const message = `� *Subscription Activated!*

Your ${plan.planType} subscription is now active!

✅ *Plan:* ${plan.planType}
⏱️ *Minutes:* ${plan.minutesPerMonth} minutes/month
📅 *Next Reset:* ${nextReset.toLocaleDateString()}

You can now start creating amazing captions for your videos! 🚀

Just send me a video and I'll add captions to it.`;
      
      await whatsappService.sendTextMessage(user.phoneNumber, message);
      logger.info('Subscription creation message sent', { phoneNumber: user.phoneNumber });
    } catch (error) {
      logger.error('Failed to send subscription creation message', 
        error instanceof Error ? error : new Error(String(error)),
        { phoneNumber: user.phoneNumber }
      );
    }
  }

  /**
   * Handle subscription.active event
   * Called when subscription becomes active (payment successful)
   */
  private static async handleSubscriptionActive(data: Subscription): Promise<void> {
    const customerId = data.customer_id || data.user_id;
    
    // Try to get user info from metadata first (internal_user_id = phoneNumber in our system)
    const metadata = data.metadata || data.customer_metadata || {};
    const internalUserId = metadata.internal_user_id;
    const customerEmail = data.customer_email || data.email;
    
    logger.info('Processing subscription.active', {
      subscriptionId: data.id,
      customerId,
      internalUserId,
      customerEmail,
    });

    // Find user: 1) internal_user_id from metadata (phoneNumber), 2) email pattern, 3) polarCustomerId, 4) polarSubscriptionId
    let user = null;
    
    if (internalUserId) {
      user = await User.findOne({ where: { phoneNumber: internalUserId } });
      logger.info('Found user by internal_user_id from metadata', { phoneNumber: internalUserId });
    } else if (customerEmail && customerEmail.includes('@caption.bot')) {
      const extractedPhone = customerEmail.split('@')[0];
      user = await User.findOne({ where: { phoneNumber: extractedPhone } });
      logger.info('Found user by email pattern', { customerEmail, extractedPhone });
    } else if (customerId) {
      user = await User.findOne({ where: { polarCustomerId: customerId } });
      logger.info('Found user by polarCustomerId', { customerId });
    } else if (data.id) {
      user = await User.findOne({ where: { polarSubscriptionId: data.id } });
      logger.info('Found user by polarSubscriptionId', { subscriptionId: data.id });
    }

    if (!user) {
      logger.warn('User not found for active subscription', {
        customerId,
        internalUserId,
      });
      return;
    }

    // Find plan by product_id if available, otherwise use user's existing plan
    let plan = null;
    if (data.product_id) {
      plan = await Plan.findOne({
        where: { polarProductId: data.product_id },
      });
    }
    
    // Fallback to user's existing plan if product_id lookup failed
    if (!plan && user.subscriptionPlanId) {
      plan = await Plan.findByPk(user.subscriptionPlanId);
      logger.info('Using existing plan from user record', { planId: user.subscriptionPlanId });
    }

    if (!plan) {
      logger.warn('Plan not found for active subscription', {
        productId: data.product_id,
        userPlanId: user.subscriptionPlanId,
      });
      return;
    }

    // Calculate next reset date
    let nextReset: Date;
    if (data.current_period_end) {
      nextReset = new Date(data.current_period_end);
      // Validate the date
      if (isNaN(nextReset.getTime())) {
        logger.warn('Invalid current_period_end date, using default', { 
          current_period_end: data.current_period_end 
        });
        nextReset = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      }
    } else {
      // Default to 30 days from now if period end not provided
      nextReset = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      logger.info('No current_period_end provided, using default 30 days');
    }

    await user.update({
      polarCustomerId: customerId || user.polarCustomerId,
      minutesBalance: plan.minutesPerMonth,
      monthlyResetDate: nextReset,
      polarSubscriptionId: data.id,
      subscriptionPlanId: plan.id,
    });

    logger.info('Subscription activated and minutes granted', {
      phoneNumber: user.phoneNumber,
      minutesGranted: plan.minutesPerMonth,
      resetDate: nextReset,
    });

    // Send WhatsApp message to notify user
    try {
      const message = `🎉 *Congratulations!* Your subscription is now active!

✅ *Plan:* ${plan.planType}
⏱️ *Minutes:* ${plan.minutesPerMonth} minutes/month
📅 *Next Reset:* ${nextReset.toLocaleDateString()}

You can now start creating amazing captions for your videos! 🚀

Just send me a video and I'll add captions to it.`;
      
      await whatsappService.sendTextMessage(user.phoneNumber, message);
      logger.info('Subscription activation message sent', { phoneNumber: user.phoneNumber });
    } catch (error) {
      logger.error('Failed to send subscription activation message', 
        error instanceof Error ? error : new Error(String(error)),
        { phoneNumber: user.phoneNumber }
      );
      // Don't throw - message failure shouldn't prevent subscription activation
    }
  }

  /**
   * Handle subscription.updated event
   * Called when subscription is modified (plan change, etc.)
   */
  private static async handleSubscriptionUpdated(data: Subscription): Promise<void> {
    const customerId = data.customer_id || data.user_id;
    
    // Try to get user info from metadata first (internal_user_id = phoneNumber in our system)
    const metadata = data.metadata || data.customer_metadata || {};
    const internalUserId = metadata.internal_user_id;
    const customerEmail = data.customer_email || data.email;
    
    logger.info('Processing subscription.updated', {
      subscriptionId: data.id,
      customerId,
      internalUserId,
      customerEmail,
    });

    // Find user: 1) internal_user_id from metadata (phoneNumber), 2) email pattern, 3) polarCustomerId, 4) polarSubscriptionId
    let user = null;
    
    if (internalUserId) {
      user = await User.findOne({ where: { phoneNumber: internalUserId } });
      logger.info('Found user by internal_user_id from metadata', { phoneNumber: internalUserId });
    } else if (customerEmail && customerEmail.includes('@caption.bot')) {
      const extractedPhone = customerEmail.split('@')[0];
      user = await User.findOne({ where: { phoneNumber: extractedPhone } });
      logger.info('Found user by email pattern', { customerEmail, extractedPhone });
    } else if (customerId) {
      user = await User.findOne({ where: { polarCustomerId: customerId } });
      logger.info('Found user by polarCustomerId', { customerId });
    } else if (data.id) {
      user = await User.findOne({ where: { polarSubscriptionId: data.id } });
      logger.info('Found user by polarSubscriptionId', { subscriptionId: data.id });
    }

    if (!user) {
      logger.warn('User not found for subscription.updated', {
        customerId,
        internalUserId,
      });
      return;
    }

    // Find plan by product_id if available, otherwise use user's existing plan
    let plan = null;
    if (data.product_id) {
      plan = await Plan.findOne({
        where: { polarProductId: data.product_id },
      });
    }
    
    // Fallback to user's existing plan if product_id lookup failed
    if (!plan && user.subscriptionPlanId) {
      plan = await Plan.findByPk(user.subscriptionPlanId);
      logger.info('Using existing plan from user record', { planId: user.subscriptionPlanId });
    }

    if (!plan) {
      logger.warn('Plan not found for subscription update', {
        productId: data.product_id,
        userPlanId: user.subscriptionPlanId,
      });
      return;
    }

    // Update plan assignment and grant minutes
    await user.update({
      subscriptionPlanId: plan.id,
      minutesBalance: plan.minutesPerMonth,
    });

    logger.info('Subscription updated', {
      phoneNumber: user.phoneNumber,
      newPlanType: plan.planType,
      minutesGranted: plan.minutesPerMonth,
    });

    // Send WhatsApp message to notify user
    try {
      const message = `🔄 *Subscription Updated!*

Your subscription has been updated to:

✅ *Plan:* ${plan.planType}
⏱️ *Minutes:* ${plan.minutesPerMonth} minutes/month

Your new plan benefits are now available! 🚀`;
      
      await whatsappService.sendTextMessage(user.phoneNumber, message);
      logger.info('Subscription update message sent', { phoneNumber: user.phoneNumber });
    } catch (error) {
      logger.error('Failed to send subscription update message', 
        error instanceof Error ? error : new Error(String(error)),
        { phoneNumber: user.phoneNumber }
      );
    }
  }

  /**
   * Handle subscription.canceled event
   * Called when subscription is canceled (still active until period end)
   */
  private static async handleSubscriptionCanceled(data: Subscription): Promise<void> {
    logger.info('Processing subscription.canceled', {
      subscriptionId: data.id,
      customerId: data.customer_id,
      cancelAt: data.cancel_at_period_end ? data.current_period_end : 'immediate',
    });

    const user = await User.findOne({
      where: { polarSubscriptionId: data.id },
    });

    if (!user) {
      logger.warn('User not found for subscription cancellation', {
        subscriptionId: data.id,
      });
      return;
    }

    // Send WhatsApp message to notify user
    try {
      let message = '';
      if (data.cancel_at_period_end && data.current_period_end) {
        const endDate = new Date(data.current_period_end).toLocaleDateString();
        message = `😔 *Subscription Canceled*

Your subscription has been canceled.

⚠️ You will continue to have access until *${endDate}*.

After that, you'll be moved to the FREE plan.

Changed your mind? You can reactivate your subscription anytime! 💙`;
      } else {
        message = `😔 *Subscription Canceled*

Your subscription has been canceled and you've been moved to the FREE plan.

You can reactivate your subscription anytime to get more minutes! 💙`;
      }
      
      await whatsappService.sendTextMessage(user.phoneNumber, message);
      logger.info('Subscription cancellation message sent', { phoneNumber: user.phoneNumber });
    } catch (error) {
      logger.error('Failed to send subscription cancellation message', 
        error instanceof Error ? error : new Error(String(error)),
        { phoneNumber: user.phoneNumber }
      );
    }

    // User keeps access until period end (cancel_at_period_end: true)
    // No immediate action needed - will be handled by subscription.revoked
  }

  /**
   * Handle subscription.revoked event
   * Called when subscription is actually terminated (no longer active)
   */
  private static async handleSubscriptionRevoked(data: Subscription): Promise<void> {
    logger.info('Processing subscription.revoked', {
      subscriptionId: data.id,
      customerId: data.customer_id,
    });

    const user = await User.findOne({
      where: { polarSubscriptionId: data.id },
    });

    if (!user) {
      logger.warn('User not found for subscription revocation', {
        subscriptionId: data.id,
      });
      return;
    }

    // Find the FREE plan
    const freePlan = await Plan.findOne({
      where: { planType: 'FREE' },
    });

    if (!freePlan) {
      logger.error('FREE plan not found in database');
      return;
    }

    // Downgrade to FREE tier
    await user.update({
      subscriptionPlanId: freePlan.id,
      minutesBalance: freePlan.minutesPerMonth,
      polarSubscriptionId: null,
      monthlyResetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    });

    logger.info('Subscription revoked, user downgraded to FREE', {
      phoneNumber: user.phoneNumber,
    });

    // Send WhatsApp message to notify user
    try {
      const message = `📋 *Subscription Ended*

Your subscription has ended and you've been moved to the FREE plan.

✅ *Current Plan:* FREE
⏱️ *Minutes:* ${freePlan.minutesPerMonth} minutes/month

Want more minutes? You can upgrade anytime to continue creating amazing captions! 🎬✨`;
      
      await whatsappService.sendTextMessage(user.phoneNumber, message);
      logger.info('Subscription revocation message sent', { phoneNumber: user.phoneNumber });
    } catch (error) {
      logger.error('Failed to send subscription revocation message', 
        error instanceof Error ? error : new Error(String(error)),
        { phoneNumber: user.phoneNumber }
      );
    }
  }

  /**
   * Handle order.created event
   * Called when a new order is created (one-time purchase or subscription renewal)
   */
  private static async handleOrderCreated(data: Order): Promise<void> {
    logger.info('Processing order.created', {
      orderId: data.id,
      customerId: data.customer_id,
      billingReason: data.billing_reason,
    });

    // billing_reason can be: 'purchase', 'subscription_create', 'subscription_cycle', 'subscription_update'
    // Handle one-time topup purchases here if implemented
  }

  /**
   * Handle order.paid event
   * Called when an order is successfully paid
   */
  private static async handleOrderPaid(data: Order): Promise<void> {
    // Extract customer ID - try multiple possible field names
    const customerId = data.customer_id || data.user_id || data.customer?.id;
    
    // Extract metadata - can be in data.metadata or nested in other fields
    const metadata = data.metadata || {};
    const internalUserId = metadata.internal_user_id;
    
    logger.info('Processing order.paid', {
      orderId: data.id,
      customerId: customerId,
      billingReason: data.billing_reason,
      amount: data.amount,
      subscription_id: data.subscription_id,
      product_id: data.product_id,
      internalUserId,
      rawData: JSON.stringify(data), // Log full data to see structure
    });

    // Check if customer_id is available
    if (!customerId) {
      logger.warn('No customer_id in order.paid webhook', { 
        orderId: data.id,
        availableFields: Object.keys(data),
      });
      return;
    }

    // Try to find user by multiple methods:
    // 1. internal_user_id from metadata (our phoneNumber)
    // 2. polarCustomerId
    // 3. subscription_id
    let user = null;
    
    if (internalUserId) {
      user = await User.findOne({
        where: { phoneNumber: internalUserId },
      });
      if (user) {
        logger.info('Found user by internal_user_id from metadata', { phoneNumber: internalUserId });
      }
    }
    
    // If not found by internal_user_id, try by customerId
    if (!user) {
      user = await User.findOne({
        where: { polarCustomerId: customerId },
      });
      if (user) {
        logger.info('Found user by polarCustomerId', { customerId });
      }
    }

    // If not found by customerId, try by subscription_id
    if (!user && data.subscription_id) {
      user = await User.findOne({
        where: { polarSubscriptionId: data.subscription_id },
      });
      if (user) {
        logger.info('Found user by subscription_id', { subscriptionId: data.subscription_id });
      }
    }

    if (!user) {
      logger.warn('User not found for paid order', {
        customerId: customerId,
        subscriptionId: data.subscription_id,
        internalUserId,
      });
      return;
    }

    // Check if this is a referral completion trigger
    if (user.referredBy && data.billing_reason === 'subscription_create') {
      await this.processReferralCompletion(user.phoneNumber, 'PAID');
    }

    // For subscription renewals, minutes are granted in subscription.active
    // For one-time purchases, handle topup here (if implemented)
    if (data.billing_reason === 'purchase') {
      // TODO: Implement one-time topup logic
      logger.info('One-time purchase detected (topup feature not yet implemented)', {
        orderId: data.id,
      });
    }
  }

  /**
   * Handle customer.created event
   */
  private static async handleCustomerCreated(data: Customer): Promise<void> {
    logger.info('Processing customer.created', {
      customerId: data.id,
      email: data.email,
    });

    // Customer creation is typically handled on our side before checkout
    // This is mainly for logging/verification
  }

  /**
   * Handle customer.updated event
   */
  private static async handleCustomerUpdated(data: Customer): Promise<void> {
    logger.info('Processing customer.updated', {
      customerId: data.id,
      email: data.email,
    });

    // Update customer info if needed
    const user = await User.findOne({
      where: { polarCustomerId: data.id },
    });

    if (user && data.email) {
      // Update user email if provided in Polar
      logger.info('Customer info updated', { phoneNumber: user.phoneNumber });
    }
  }

  /**
   * Handle checkout.created event
   * Called when a checkout session is created
   */
  private static async handleCheckoutCreated(data: Checkout): Promise<void> {
    logger.info('Processing checkout.created', {
      checkoutId: data.id,
      customerId: data.customer_id,
      productId: data.product_id,
    });

    // Checkout is in progress - no action needed yet
    // Will be handled by subscription.created or order.created when completed
  }

  /**
   * Handle checkout.updated event
   * Called when a checkout session is updated
   */
  private static async handleCheckoutUpdated(data: Checkout): Promise<void> {
    logger.info('Processing checkout.updated', {
      checkoutId: data.id,
      customerId: data.customer_id,
      status: data.status,
    });

    // Track checkout progress if needed
    // Completed checkouts will trigger subscription.created or order.created
  }

  /**
   * Handle customer.state_changed event
   * Called when a customer's state changes
   */
  private static async handleCustomerStateChanged(data: Customer): Promise<void> {
    logger.info('Processing customer.state_changed', {
      customerId: data.id,
      email: data.email,
    });

    // Handle customer state changes if needed
    // This is mainly informational - subscription events handle actual state
  }

  /**
   * Process referral completion when referred user subscribes
   */
  private static async processReferralCompletion(
    referredPhone: string,
    type: 'FREE' | 'PAID'
  ): Promise<void> {
    const { default: ReferralService } = await import('../referral.service');
    await ReferralService.completeReferral(referredPhone, type);
  }
}
