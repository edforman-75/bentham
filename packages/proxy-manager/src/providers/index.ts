/**
 * Proxy Providers
 *
 * Re-exports all proxy provider types and implementations.
 */

// Types
export type {
  ProxyProvider,
  ProxyProviderOptions,
  BaseProviderConfig,
} from './types.js';

// 2Captcha Provider
export type { TwoCaptchaConfig } from './two-captcha.js';
export { TwoCaptchaProxyProvider, createTwoCaptchaProvider } from './two-captcha.js';

// 2Captcha Location Utilities
export type { TwoCaptchaGeoTarget } from './two-captcha-locations.js';
export {
  TWOCAPTCHA_LOCATION_MAP,
  getTwoCaptchaGeoTarget,
  isTwoCaptchaLocationSupported,
  getTwoCaptchaSupportedLocations,
  buildTwoCaptchaUsername,
} from './two-captcha-locations.js';
