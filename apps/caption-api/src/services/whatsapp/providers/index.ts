/**
 * WhatsApp Providers Index
 * 
 * Factory and exports for WhatsApp API providers
 */

import { env } from '@/config/env';
import { logger } from '@/plugins/logger';
import { EvolutionProvider, type EvolutionProviderConfig } from './evolution.provider';
import type { IWhatsAppProvider, WhatsAppProviderType } from './types';
import { WaSenderProvider, type WaSenderProviderConfig } from './wasender.provider';

export { EvolutionProvider } from './evolution.provider';
export * from './types';
export { WaSenderProvider } from './wasender.provider';

/**
 * Create a WhatsApp provider based on configuration
 */
export function createWhatsAppProvider(
  providerType?: WhatsAppProviderType
): IWhatsAppProvider {
  const type = providerType || (env.WHATSAPP_PROVIDER as WhatsAppProviderType) || 'evolution';

  logger.info('🔌 Creating WhatsApp provider', { type });

  switch (type) {
    case 'wasender':
      return createWaSenderProvider();
    case 'evolution':
    default:
      return createEvolutionProvider();
  }
}

/**
 * Create Evolution API provider
 */
function createEvolutionProvider(): EvolutionProvider {
  const config: EvolutionProviderConfig = {
    serverUrl: env.WHATSAPP_SERVER_URL || '',
    apiKey: env.WHATSAPP_API_KEY || '',
    instance: env.WHATSAPP_INSTANCE || '',
    socketUrl: env.WHATSAPP_SOCKET_URL,
  };

  const provider = new EvolutionProvider(config);

  if (!provider.isConfigured()) {
    logger.warn('⚠️ Evolution API provider is not fully configured', {
      hasServerUrl: !!config.serverUrl,
      hasApiKey: !!config.apiKey,
      hasInstance: !!config.instance,
    });
  } else {
    logger.info('✅ Evolution API provider configured', {
      serverUrl: config.serverUrl,
      instance: config.instance,
      socketUrl: config.socketUrl,
    });
  }

  return provider;
}

/**
 * Create WaSender API provider
 */
function createWaSenderProvider(): WaSenderProvider {
  const config: WaSenderProviderConfig = {
    serverUrl: env.WASENDER_SERVER_URL || env.WHATSAPP_SERVER_URL || '',
    apiKey: env.WASENDER_API_KEY || env.WHATSAPP_API_KEY || '',
    socketUrl: env.WASENDER_SOCKET_URL || env.WHATSAPP_SOCKET_URL,
    sessionId: env.WASENDER_SESSION_ID,
  };

  const provider = new WaSenderProvider(config);

  if (!provider.isConfigured()) {
    logger.warn('⚠️ WaSender API provider is not fully configured', {
      hasServerUrl: !!config.serverUrl,
      hasApiKey: !!config.apiKey,
    });
  } else {
    logger.info('✅ WaSender API provider configured', {
      serverUrl: config.serverUrl,
      socketUrl: config.socketUrl,
      sessionId: config.sessionId,
    });
  }

  return provider;
}

/**
 * Singleton provider instances
 * - _provider: Main provider for receiving webhooks (WaSender)
 * - _senderProvider: Provider for sending messages (Evolution)
 */
let _provider: IWhatsAppProvider | null = null;
let _senderProvider: IWhatsAppProvider | null = null;

/**
 * Get the singleton provider instance (for receiving webhooks)
 */
export function getWhatsAppProvider(): IWhatsAppProvider {
  if (!_provider) {
    _provider = createWhatsAppProvider();
  }
  return _provider;
}

/**
 * Get the sender provider instance (controlled by WHATSAPP_SENDER_PROVIDER env)
 */
export function getSenderProvider(): IWhatsAppProvider {
  if (!_senderProvider) {
    const senderProviderType = (env.WHATSAPP_SENDER_PROVIDER as WhatsAppProviderType) || 'evolution';
    _senderProvider = createWhatsAppProvider(senderProviderType);
    logger.info('📤 Sender provider initialized', { type: senderProviderType });
  }
  return _senderProvider;
}

/**
 * Reset the provider instance (useful for testing or reconfiguration)
 */
export function resetWhatsAppProvider(): void {
  _provider = null;
  _senderProvider = null;
}

/**
 * Get provider type from environment
 */
export function getProviderType(): WhatsAppProviderType {
  return (env.WHATSAPP_PROVIDER as WhatsAppProviderType) || 'evolution';
}
