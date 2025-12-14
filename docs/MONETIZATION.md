# Monetization System - Implementation Complete ✅

## Overview
Implemented complete minute-based billing system with Polar.sh integration, referral program, and subscription management through WhatsApp bot.

## ✅ Completed Tasks (9/9)

### 1. Updated limits.ts with subscription tiers
- **File**: `packages/shared/src/constants/limits.ts`
- **Changes**: Added `SUBSCRIPTION_TIERS` constant with 4 plans
- **Plans**:
  - FREE: $0/mo, 3 min/mo
  - STARTER: $9/mo, 30 min/mo
  - PRO: $29/mo, 150 min/mo
  - UNLIMITED: $99/mo, 1000 min/mo

### 2. Created Plan model
- **File**: `apps/caption-api/src/models/Plan.ts`
- **Fields**: planId, name, tier, priceMonthly, minutesPerMonth, features, isActive, polarProductId, polarPriceId
- **Associations**: Plan.hasMany(User)

### 3. Created Referral model
- **File**: `apps/caption-api/src/models/Referral.ts`
- **Fields**: referralId, referrerPhone, referredPhone, referralCode, completedAt, bonusType
- **Features**: Tracks free vs paid referrals, completion timestamps

### 4. Updated User model
- **File**: `apps/caption-api/src/models/User.ts`
- **New Fields** (10):
  - `planId` - Current subscription plan
  - `subscriptionId` - Polar subscription ID
  - `minutesRemaining` - Balance from subscription
  - `bonusMinutes` - Balance from referrals
  - `referralCode` - Unique CAPTION-XXXXX code
  - `referredBy` - Who referred this user
  - `subscriptionStartDate` - Current cycle start
  - `subscriptionEndDate` - Current cycle end
  - `freeReferralCount` - Free referrals completed
  - `paidReferralCount` - Paid referrals completed

### 5. Created migration and seed files
- **Migration**: `apps/caption-api/src/config/database/migrations/20250102_add_subscriptions.ts`
  - Alters users table (10 new columns)
  - Creates plans table
  - Creates referrals table
  - Adds foreign keys and indexes
- **Seed**: `apps/caption-api/src/config/database/seeds/20250102_seed_plans.ts`
  - Populates 4 subscription plans

### 6. Created Polar webhook handler
- **File**: `apps/caption-api/src/services/polar/webhook.service.ts` (348 lines)
- **Features**:
  - Signature verification using `@polar-sh/sdk/webhooks`
  - 10 event handlers
  - Referral completion trigger on paid subscriptions
- **Events Handled**:
  - `subscription.created` → Save subscription details
  - `subscription.active` → Grant minutes, update dates
  - `subscription.updated` → Handle plan changes
  - `subscription.canceled` → Mark canceled
  - `subscription.revoked` → Downgrade to FREE
  - `order.created` → Log order
  - `order.paid` → Trigger referral completion check
  - `customer.created` → Link phone to Polar
  - `customer.updated` → Sync customer data

### 7. Created subscription tools for agent
- **File**: `apps/caption-api/src/agent/tools/subscription.tools.ts` (287 lines)
- **Tools** (5):
  1. **pricingTool** - Shows formatted tier comparison
  2. **subscribeTool** - Generates Polar checkout URL with plan selection
  3. **topupTool** - Placeholder for one-time purchases
  4. **statusTool** - Shows balance, plan, usage stats, reset date
  5. **referralTool** - Shows code, earnings, share message
- **Integration**: Added to `caption.agent.ts` with updated instructions

### 8. Integrated validation into video processing
- **Validation Service**: `apps/caption-api/src/services/subscription/validation.service.ts` (175 lines)
  - `validateVideoProcessing()` - Checks balance before processing
  - `deductMinutes()` - Removes minutes after completion
  - `getUserBalance()` - Returns comprehensive balance info
- **Integration Points**:
  - **Pre-validation**: `jobResultHandler/index.ts` → `handleVideoUploadedResult()`
    - Validates after video upload (when duration is known)
    - Blocks processing if insufficient balance
    - Shows deficit with upgrade suggestions
  - **Post-deduction**: `jobResultHandler/index.ts` → `handleRenderFinalResult()`
    - Deducts minutes after successful render
    - Uses bonus minutes first, then subscription minutes
    - Logs deduction for audit trail

### 9. Auto-generate referral codes on user creation
- **File**: `apps/caption-api/src/socket/handlers/MessagesUpsertHandler.ts`
- **Implementation**: 
  - Calls `ReferralService.generateReferralCode()` in `findOrCreateUser()`
  - Assigns unique CAPTION-XXXXX code to new users
  - Logs code generation for tracking

---

## 📁 File Structure

```
apps/caption-api/src/
├── agent/
│   ├── agents/
│   │   └── caption.agent.ts          [UPDATED] Added subscription tools
│   └── tools/
│       └── subscription.tools.ts     [NEW] 5 subscription management tools
├── config/
│   └── database/
│       ├── migrations/
│       │   └── 20250102_add_subscriptions.ts  [NEW]
│       └── seeds/
│           └── 20250102_seed_plans.ts         [NEW]
├── models/
│   ├── Plan.ts                       [NEW] Subscription plans
│   ├── Referral.ts                   [NEW] Referral tracking
│   └── User.ts                       [UPDATED] +10 subscription fields
├── routes/
│   └── webhooks.ts                   [NEW] POST /webhooks/polar
├── services/
│   ├── polar/
│   │   └── webhook.service.ts        [NEW] Polar event handlers
│   ├── subscription/
│   │   └── validation.service.ts     [NEW] Minute validation logic
│   ├── referral.service.ts           [NEW] Referral code generation
│   └── jobResultHandler/
│       └── index.ts                  [UPDATED] Added validation + deduction
├── socket/handlers/
│   └── MessagesUpsertHandler.ts      [UPDATED] Auto-generate referral codes
└── app.ts                            [UPDATED] Mounted webhook routes

packages/shared/src/constants/
└── limits.ts                         [UPDATED] Added SUBSCRIPTION_TIERS
```

---

## 🔄 Complete User Flow

### 1. User Signup
```
New user sends message → MessagesUpsertHandler.findOrCreateUser()
  → ReferralService.generateReferralCode() → User.create({ referralCode: 'CAPTION-XXXXX' })
  → User starts with FREE plan (3 min/mo)
```

### 2. Check Pricing
```
User: "pricing"
Agent: pricingTool → Shows 4 tiers with features
```

### 3. Subscribe to Plan
```
User: "subscribe to PRO"
Agent: subscribeTool → Generates Polar checkout URL
User clicks link → Completes payment on Polar
Polar sends webhook → webhook.service.ts handles subscription.active
  → Updates user: planId, subscriptionId, minutesRemaining, dates
  → Checks if referredBy exists → Triggers ReferralService.completeReferral()
```

### 4. Referral Flow
```
User A: "referral"
Agent: referralTool → Shows "Your code: CAPTION-A1B2C, Share: ..."
User A shares code with User B

User B signs up → Optional: User B provides code at onboarding
  → User.create({ referredBy: 'CAPTION-A1B2C' })

User B subscribes to STARTER
Polar webhook → webhook.service.ts → processReferralCompletion()
  → User A gets 3 bonus minutes
  → User B gets 3 bonus minutes
  → User A.paidReferralCount++
```

### 5. Video Processing with Validation
```
User sends 5-minute video → processVideoTool → VIDEO_UPLOADED job queued
Worker downloads video → Returns videoDuration: 300 seconds
jobResultHandler.handleVideoUploadedResult()
  → SubscriptionValidationService.validateVideoProcessing(phone, 300)
    → calculateMinutesRequired(300) → 5 minutes
    → User has 2 minutes remaining
    → validation.allowed = false
    → validation.message = "Insufficient minutes. Need 5, have 2. Deficit: 3 min..."
  → Session status = FAILED
  → WhatsApp message sent with deficit and upgrade options
  → Processing STOPS

--- If user had enough minutes ---
  → validation.allowed = true
  → Processing continues: CHUNKING → TRANSCRIBE → RENDER
  → jobResultHandler.handleRenderFinalResult()
    → SubscriptionValidationService.deductMinutes(phone, 300)
      → Deducts from bonusMinutes first, then minutesRemaining
    → Sends final video to user
```

### 6. Check Status
```
User: "status"
Agent: statusTool → Shows:
  - Current plan: PRO ($29/mo)
  - Minutes remaining: 145 min
  - Bonus minutes: 6 min
  - Usage this month: 5 min
  - Next reset: Jan 15, 2025
```

---

## 🔐 Security Features

1. **Webhook Signature Verification**
   - Uses `@polar-sh/sdk/webhooks/validateEvent()`
   - WEBHOOK_SECRET from env
   - Prevents replay attacks

2. **Referral Limits**
   - Max 10 free referrals per user
   - Unlimited paid referrals
   - Enforced in `ReferralService.completeReferral()`

3. **Minute Balance Validation**
   - Pre-flight check before video processing
   - Prevents processing without payment
   - Deducts after successful completion only

---

## 📊 Database Schema

### Users Table
```sql
-- New columns added
ALTER TABLE users ADD COLUMN planId UUID REFERENCES plans(planId);
ALTER TABLE users ADD COLUMN subscriptionId VARCHAR(255);
ALTER TABLE users ADD COLUMN minutesRemaining INTEGER DEFAULT 3;
ALTER TABLE users ADD COLUMN bonusMinutes INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN referralCode VARCHAR(20) UNIQUE;
ALTER TABLE users ADD COLUMN referredBy VARCHAR(20);
ALTER TABLE users ADD COLUMN subscriptionStartDate TIMESTAMP;
ALTER TABLE users ADD COLUMN subscriptionEndDate TIMESTAMP;
ALTER TABLE users ADD COLUMN freeReferralCount INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN paidReferralCount INTEGER DEFAULT 0;
```

### Plans Table
```sql
CREATE TABLE plans (
  planId UUID PRIMARY KEY,
  name VARCHAR(100),
  tier VARCHAR(20),
  priceMonthly INTEGER,
  minutesPerMonth INTEGER,
  features TEXT[],
  isActive BOOLEAN DEFAULT true,
  polarProductId VARCHAR(255),
  polarPriceId VARCHAR(255)
);
```

### Referrals Table
```sql
CREATE TABLE referrals (
  referralId UUID PRIMARY KEY,
  referrerPhone VARCHAR(20) REFERENCES users(phoneNumber),
  referredPhone VARCHAR(20) REFERENCES users(phoneNumber),
  referralCode VARCHAR(20),
  completedAt TIMESTAMP,
  bonusType VARCHAR(10)
);
```

---

## 🛠️ Setup Instructions

### 1. Install Dependencies
```bash
cd apps/caption-api
pnpm install
# Installs: @polar-sh/sdk, umzug
```

### 2. Configure Environment
Add to `apps/caption-api/.env`:
```env
# Polar.sh Configuration
POLAR_ACCESS_TOKEN=polar_at_xxxxxxxxxxxxx
POLAR_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx
POLAR_ORGANIZATION_ID=org_xxxxxxxxxxxxx

# Frontend URL for checkout redirects
FRONTEND_URL=https://yourapp.com
```

### 3. Run Migrations
```bash
pnpm db:migrate:up
# Runs: 20250102_add_subscriptions.ts
```

### 4. Seed Database
```bash
pnpm db:seed
# Runs: 20250102_seed_plans.ts
# Populates plans table with 4 tiers
```

### 5. Configure Polar Dashboard
1. Create 4 products in Polar:
   - STARTER ($9/mo)
   - PRO ($29/mo)
   - UNLIMITED ($99/mo)
   - TOP_UP (one-time, coming soon)

2. Copy product IDs and price IDs

3. Update seed file with real Polar IDs:
```typescript
// apps/caption-api/src/config/database/seeds/20250102_seed_plans.ts
{ polarProductId: 'prod_xxxxx', polarPriceId: 'price_xxxxx' }
```

4. Set webhook endpoint in Polar:
   - URL: `https://yourapi.com/webhooks/polar`
   - Events: All subscription and order events
   - Copy webhook secret to `.env`

### 6. Test Webhook Integration
```bash
# Use Polar CLI or webhook.site to test
curl -X POST https://yourapi.com/webhooks/polar \
  -H "Content-Type: application/json" \
  -H "webhook-id: msg_xxxxx" \
  -H "webhook-timestamp: 1234567890" \
  -H "webhook-signature: v1,signature_here" \
  -d '{"type": "subscription.active", ...}'
```

---

## 🧪 Testing Checklist

### User Creation
- [ ] New user gets unique referral code (CAPTION-XXXXX)
- [ ] Code is stored in database
- [ ] Default plan is FREE (3 min/mo)

### Subscription Flow
- [ ] User requests pricing → Sees 4 tiers
- [ ] User subscribes → Gets Polar checkout URL
- [ ] Payment completes → Webhook received
- [ ] Webhook handler updates user record
- [ ] Minutes granted correctly

### Referral System
- [ ] User A gets referral code
- [ ] User B signs up with code → `referredBy` set
- [ ] User B subscribes → Both get bonus minutes
- [ ] User A's paidReferralCount increments
- [ ] Free referral limit enforced (max 10)

### Video Processing
- [ ] User uploads 2-min video with 1 min balance → Rejected
- [ ] Error message shows deficit and upgrade options
- [ ] User uploads 1-min video with 2 min balance → Processed
- [ ] After completion, 1 minute deducted
- [ ] Bonus minutes used before subscription minutes

### Status Tool
- [ ] Shows correct plan name and price
- [ ] Shows correct minute balances
- [ ] Shows usage calculation
- [ ] Shows next reset date

---

## 🔧 Migration Commands

Add to `package.json` in `apps/caption-api`:
```json
{
  "scripts": {
    "db:migrate:up": "tsx src/config/database/migrate.ts up",
    "db:migrate:down": "tsx src/config/database/migrate.ts down",
    "db:seed": "tsx src/config/database/seed.ts"
  }
}
```

---

## 📈 Metrics to Track

1. **Subscription Metrics**
   - Active subscriptions by tier
   - Monthly recurring revenue (MRR)
   - Churn rate
   - Upgrade/downgrade frequency

2. **Referral Metrics**
   - Total referrals (free vs paid)
   - Conversion rate (referred → paid)
   - Average bonus minutes awarded
   - Top referrers

3. **Usage Metrics**
   - Minutes processed per plan
   - Average video length by tier
   - Rejection rate (insufficient balance)
   - Minute balance distribution

4. **Revenue Metrics**
   - Cost per minute (infrastructure)
   - Revenue per minute (subscriptions)
   - Gross margin by tier
   - Customer lifetime value (CLV)

---

## 🐛 Common Issues & Solutions

### Webhook Not Receiving Events
- Verify webhook URL is publicly accessible
- Check WEBHOOK_SECRET matches Polar dashboard
- Test signature verification with Polar CLI
- Check firewall/CORS settings

### Minutes Not Deducting
- Verify `handleRenderFinalResult()` is called
- Check session has `originalVideoDuration`
- Review logs for deduction errors
- Confirm user exists in database

### Referral Not Completing
- Verify `referredBy` is set correctly
- Check `processReferralCompletion()` logic
- Ensure webhook handler is triggered on `order.paid`
- Review referral limits enforcement

### Migration Fails
- Check PostgreSQL is running
- Verify database connection string
- Run `down` migration first if re-running
- Check for existing table/column conflicts

---

## 🚀 Next Steps

### Phase 2: Top-Up Purchases
- [ ] Implement one-time minute purchase
- [ ] Create TOP_UP product in Polar
- [ ] Update `topupTool` with real logic
- [ ] Add expiration for top-up minutes (30 days)

### Phase 3: Analytics Dashboard
- [ ] Create admin panel for metrics
- [ ] Revenue charts by tier
- [ ] Referral leaderboard
- [ ] Usage heatmaps

### Phase 4: Advanced Features
- [ ] Team/organization subscriptions
- [ ] Bulk video processing discounts
- [ ] Custom style creation (PRO+ feature)
- [ ] Priority processing queue for UNLIMITED

### Phase 5: Optimization
- [ ] Cache user balance in Redis
- [ ] Batch minute deductions
- [ ] Optimize webhook processing
- [ ] Add retry logic for failed webhooks

---

## 📝 Notes

- Minute calculation: `Math.ceil(videoDuration / 60)` rounds up to nearest minute
- Bonus minutes used before subscription minutes for better UX
- Referral bonuses: 0.5 min (free), 3 min (paid)
- Subscription minutes reset on cycle renewal
- Legacy `freeVideosUsed` maintained for backward compatibility

---

**Implementation Date**: January 2, 2025  
**Status**: ✅ Complete - Ready for Testing  
**Total Files Changed**: 14  
**Lines of Code Added**: ~1,500
