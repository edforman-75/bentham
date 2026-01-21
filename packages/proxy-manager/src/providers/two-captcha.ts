/**
 * 2Captcha Proxy Provider
 *
 * Implementation of the ProxyProvider interface for 2Captcha's residential proxy service.
 *
 * @see https://2captcha.com/proxy
 */

import { randomUUID } from 'crypto';
import type { LocationId } from '@bentham/core';
import type { ProxyConfig, ProxyProtocol } from '../types.js';
import type { ProxyProvider, ProxyProviderOptions, BaseProviderConfig } from './types.js';
import {
  getTwoCaptchaGeoTarget,
  getTwoCaptchaSupportedLocations,
  isTwoCaptchaLocationSupported,
  buildTwoCaptchaUsername,
} from './two-captcha-locations.js';

/**
 * 2Captcha proxy endpoint configuration
 */
const TWOCAPTCHA_ENDPOINTS = {
  http: {
    host: 'proxy.2captcha.com',
    port: 8080,
  },
  https: {
    host: 'proxy.2captcha.com',
    port: 8081,
  },
  socks5: {
    host: 'proxy.2captcha.com',
    port: 1080,
  },
} as const;

/**
 * 2Captcha provider configuration
 */
export interface TwoCaptchaConfig extends BaseProviderConfig {
  /** 2Captcha API key */
  apiKey: string;
  /** Default session duration in minutes (0-120, 0 = rotating) */
  defaultSessionDuration?: number;
  /** Default protocol */
  defaultProtocol?: 'http' | 'https' | 'socks5';
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Required<Omit<TwoCaptchaConfig, 'apiKey'>> = {
  enabled: true,
  priority: 50,
  defaultSessionDuration: 5,
  defaultProtocol: 'http',
};

/**
 * 2Captcha Proxy Provider
 *
 * Provides residential proxies with geographic targeting through 2Captcha's proxy service.
 * Supports 220+ countries with city-level targeting at $5/GB.
 */
export class TwoCaptchaProxyProvider implements ProxyProvider {
  readonly name = '2captcha';

  private config: Required<TwoCaptchaConfig>;
  private supportedLocations: LocationId[];

  constructor(config: TwoCaptchaConfig) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    };
    this.supportedLocations = getTwoCaptchaSupportedLocations();
  }

  /**
   * Generate a proxy configuration for a specific location
   */
  getProxyConfig(location: LocationId, options?: ProxyProviderOptions): ProxyConfig {
    const geoTarget = getTwoCaptchaGeoTarget(location);

    if (!geoTarget) {
      throw new Error(`Location '${location}' is not supported by 2Captcha provider`);
    }

    const protocol = (options?.protocol ?? this.config.defaultProtocol) as 'http' | 'https' | 'socks5';
    const endpoint = TWOCAPTCHA_ENDPOINTS[protocol];
    const sessionDuration = options?.sessionDuration ?? this.config.defaultSessionDuration;

    // Build username with geo-targeting parameters
    const username = buildTwoCaptchaUsername(this.config.apiKey, geoTarget, {
      sessionDuration,
      sessionId: options?.sessionId,
    });

    // Generate unique ID for this proxy config
    const proxyId = `2captcha-${location}-${randomUUID().slice(0, 8)}`;

    return {
      id: proxyId,
      name: `2Captcha ${location}`,
      type: options?.proxyType ?? 'residential',
      protocol: protocol as ProxyProtocol,
      host: endpoint.host,
      port: endpoint.port,
      username,
      password: this.config.apiKey,
      locations: [location],
      costPerGb: this.getCostPerGb(),
      enabled: true,
      metadata: {
        provider: this.name,
        geoTarget,
        sessionDuration,
      },
    };
  }

  /**
   * Validate provider credentials by making a test request
   */
  async validateCredentials(): Promise<boolean> {
    if (!this.config.apiKey) {
      return false;
    }

    try {
      // 2Captcha API balance check endpoint
      const response = await fetch(
        `https://2captcha.com/res.php?key=${this.config.apiKey}&action=getbalance&json=1`
      );

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      // Successful response has status: 1
      return data.status === 1;
    } catch {
      return false;
    }
  }

  /**
   * Get list of locations supported by this provider
   */
  getAvailableLocations(): LocationId[] {
    return [...this.supportedLocations];
  }

  /**
   * Check if a specific location is supported
   */
  supportsLocation(location: LocationId): boolean {
    return isTwoCaptchaLocationSupported(location);
  }

  /**
   * Get cost per GB in USD
   *
   * 2Captcha pricing: $5/GB baseline, volume discounts available
   */
  getCostPerGb(): number {
    return 5.0;
  }

  /**
   * Check if the provider is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Get provider priority (lower = higher priority)
   */
  getPriority(): number {
    return this.config.priority;
  }

  /**
   * Build a proxy URL string for direct use
   */
  buildProxyUrl(location: LocationId, options?: ProxyProviderOptions): string {
    const config = this.getProxyConfig(location, options);
    const auth = config.username && config.password
      ? `${encodeURIComponent(config.username)}:${encodeURIComponent(config.password)}@`
      : '';
    return `${config.protocol}://${auth}${config.host}:${config.port}`;
  }
}

/**
 * Create a 2Captcha proxy provider instance
 */
export function createTwoCaptchaProvider(config: TwoCaptchaConfig): TwoCaptchaProxyProvider {
  return new TwoCaptchaProxyProvider(config);
}
