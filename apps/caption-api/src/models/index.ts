// Import model initializers
import {
    CaptionSession,
    initializeCaptionSessionModel
} from './CaptionSession';
import { initializeUserModel, User } from './User';
import {
    initializeVideoChunkModel,
    VideoChunk
} from './VideoChunk';

// Export models
export { CaptionSession } from './CaptionSession';
export { User } from './User';
export { VideoChunk } from './VideoChunk';

// Export types
export type { CaptionSessionModel } from './CaptionSession';
export type { UserModel } from './User';
export type { VideoChunkModel } from './VideoChunk';

// Model initialization and associations
export const initializeModels = (): void => {
  // Initialize all models
  const user = initializeUserModel();
  const captionSession = initializeCaptionSessionModel();
  const videoChunk = initializeVideoChunkModel();

  // Define associations between models

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
