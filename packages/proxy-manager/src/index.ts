/**
 * @bentham/proxy-manager
 *
 * Proxy management and rotation for Bentham.
 */

// Types
export type {
  ProxyType,
  ProxyProtocol,
  ProxyStatus,
  RotationStrategy,
  ProxyConfig,
  ProxyHealth,
  ProxySession,
  ProxyPoolConfig,
  ProxyRequestOptions,
  ProxyUsageRecord,
  ProxyManagerConfig,
  ProxyManagerStats,
  RegisteredProvider,
} from './types.js';

export { DEFAULT_MANAGER_CONFIG } from './types.js';

// Manager
export { ProxyManager, createProxyManager } from './manager.js';

// Providers
export type {
  ProxyProvider,
  ProxyProviderOptions,
  BaseProviderConfig,
  TwoCaptchaConfig,
  TwoCaptchaGeoTarget,
} from './providers/index.js';

export {
  TwoCaptchaProxyProvider,
  createTwoCaptchaProvider,
  TWOCAPTCHA_LOCATION_MAP,
  getTwoCaptchaGeoTarget,
  isTwoCaptchaLocationSupported,
  getTwoCaptchaSupportedLocations,
  buildTwoCaptchaUsername,
} from './providers/index.js';
