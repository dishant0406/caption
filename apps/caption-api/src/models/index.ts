// Import model initializers
import {
  CaptionSession,
  initializeCaptionSessionModel
} from './CaptionSession';
import { initializePlanModel } from './Plan';
import { initializeReferralModel } from './Referral';
import { initializeUserModel, User } from './User';
import {
  initializeVideoChunkModel,
  VideoChunk
} from './VideoChunk';

// Export models
export { CaptionSession } from './CaptionSession';
export { Plan } from './Plan';
export { Referral } from './Referral';
export { User } from './User';
export { VideoChunk } from './VideoChunk';

// Export types
export type { CaptionSessionModel } from './CaptionSession';
export type { PlanModel, PlanType } from './Plan';
export type { ReferralModel, ReferralStatus, ReferralType } from './Referral';
export type { UserModel } from './User';
export type { VideoChunkModel } from './VideoChunk';

// Model initialization and associations
export const initializeModels = (): void => {
  // Initialize all models
  const user = initializeUserModel();
  const plan = initializePlanModel();
  const referral = initializeReferralModel();
  const captionSession = initializeCaptionSessionModel();
  const videoChunk = initializeVideoChunkModel();

  // Define associations between models

  // Plan <-> User (One-to-Many)
  plan.hasMany(user, {
    foreignKey: 'subscriptionPlanId',
    as: 'users',
  });
  user.belongsTo(plan, {
    foreignKey: 'subscriptionPlanId',
    as: 'subscriptionPlan',
  });

  // User <-> Referral (One-to-Many) - as referrer
  user.hasMany(referral, {
    foreignKey: 'referrerPhone',
    as: 'referralsMade',
  });
  referral.belongsTo(user, {
    foreignKey: 'referrerPhone',
    as: 'referrer',
  });

  // User <-> Referral (One-to-Many) - as referred
  user.hasMany(referral, {
    foreignKey: 'referredPhone',
    as: 'referralsReceived',
  });
  referral.belongsTo(user, {
    foreignKey: 'referredPhone',
    as: 'referred',
  });

  // User <-> CaptionSession (One-to-Many)
  user.hasMany(captionSession, {
    foreignKey: 'userPhone',
    as: 'captionSessions',
  });
  captionSession.belongsTo(user, {
    foreignKey: 'userPhone',
    as: 'user',
  });

  // CaptionSession <-> VideoChunk (One-to-Many)
  captionSession.hasMany(videoChunk, {
    foreignKey: 'sessionId',
    as: 'chunks',
  });
  videoChunk.belongsTo(captionSession, {
    foreignKey: 'sessionId',
    as: 'session',
  });
};

// Helper to get all model references after initialization
export const getModels = (): {
  User: typeof User;
  CaptionSession: typeof CaptionSession;
  VideoChunk: typeof VideoChunk;
} => ({
  User,
  CaptionSession,
  VideoChunk,
});
