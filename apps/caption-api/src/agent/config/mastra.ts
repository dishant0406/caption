import { Mastra } from '@mastra/core';
import { captionAgent } from '../agents/caption.agent';

/**
 * Mastra Instance Configuration
 * 
 * This is the main Mastra instance that registers the caption agent
 * and makes it available for use throughout the application.
 */
export const mastra = new Mastra({
  agents: {
    captionAgent,
  },
});
