/**
 * Proxy Provider Types
 *
 * Abstraction layer for proxy service providers.
 */

import type { LocationId } from '@bentham/core';
import type { ProxyConfig, ProxyProtocol, ProxyType } from '../types.js';

/**
 * Options for requesting a proxy from a provider
 */
export interface ProxyProviderOptions {
  /** Session duration in minutes (provider-specific limits apply) */
  sessionDuration?: number;
  /** Protocol to use */
  protocol?: ProxyProtocol;
  /** Type of proxy */
  proxyType?: ProxyType;
  /** Custom session ID for sticky sessions */
  sessionId?: string;
}

/**
 * Interface for proxy service providers
 */
export interface ProxyProvider {
  /** Provider name identifier */
  readonly name: string;

  /**
   * Generate a proxy configuration for a specific location
   */
  getProxyConfig(location: LocationId, options?: ProxyProviderOptions): ProxyConfig;

  /**
   * Validate provider credentials
   */
  validateCredentials(): Promise<boolean>;

  /**
   * Get list of locations supported by this provider
   */
  getAvailableLocations(): LocationId[];

  /**
   * Check if a specific location is supported
   */
  supportsLocation(location: LocationId): boolean;

  /**
   * Get cost per GB in USD
   */
  getCostPerGb(): number;
}

/**
 * Base configuration for all providers
 */
export interface BaseProviderConfig {
  /** Whether the provider is enabled */
  enabled?: boolean;
  /** Priority order (lower = higher priority) */
  priority?: number;
}
