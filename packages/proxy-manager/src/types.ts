/**
 * Proxy Manager Types
 *
 * Types for proxy configuration and management.
 */

import type { LocationId } from '@bentham/core';

/**
 * Proxy types
 */
export type ProxyType = 'residential' | 'datacenter' | 'mobile' | 'isp';

/**
 * Proxy protocol types
 */
export type ProxyProtocol = 'http' | 'https' | 'socks4' | 'socks5';

/**
 * Proxy health status
 */
export type ProxyStatus = 'healthy' | 'degraded' | 'unhealthy' | 'unknown';

/**
 * Rotation strategy
 */
export type RotationStrategy = 'round-robin' | 'random' | 'least-used' | 'sticky';

/**
 * Proxy configuration
 */
export interface ProxyConfig {
  /** Unique ID */
  id: string;
  /** Display name */
  name: string;
  /** Proxy type */
  type: ProxyType;
  /** Protocol */
  protocol: ProxyProtocol;
  /** Host address */
  host: string;
  /** Port number */
  port: number;
  /** Username for authentication */
  username?: string;
  /** Password for authentication */
  password?: string;
  /** Supported locations */
  locations: LocationId[];
  /** Cost per GB in USD */
  costPerGb: number;
  /** Whether the proxy is enabled */
  enabled: boolean;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Proxy health information
 */
export interface ProxyHealth {
  /** Proxy ID */
  proxyId: string;
  /** Current status */
  status: ProxyStatus;
  /** Response latency in ms */
  latencyMs?: number;
  /** Success rate (0-1) */
  successRate: number;
  /** Total requests made */
  totalRequests: number;
  /** Failed requests */
  failedRequests: number;
  /** Last check timestamp */
  lastChecked: Date;
  /** Last successful request */
  lastSuccess?: Date;
  /** Last failure timestamp */
  lastFailure?: Date;
  /** Last error message */
  lastError?: string;
}

/**
 * Proxy session for sticky sessions
 */
export interface ProxySession {
  /** Session ID */
  id: string;
  /** Proxy ID */
  proxyId: string;
  /** Target domain or identifier */
  target: string;
  /** Created timestamp */
  createdAt: Date;
  /** Expires at */
  expiresAt: Date;
  /** Request count */
  requestCount: number;
}

/**
 * Pool configuration
 */
export interface ProxyPoolConfig {
  /** Pool ID */
  id: string;
  /** Pool name */
  name: string;
  /** Proxy IDs in this pool */
  proxyIds: string[];
  /** Rotation strategy */
  rotationStrategy: RotationStrategy;
  /** Locations this pool serves */
  locations: LocationId[];
  /** Maximum concurrent requests */
  maxConcurrent?: number;
  /** Sticky session duration in seconds */
  stickySessionDuration?: number;
  /** Minimum healthy proxies required */
  minHealthyProxies?: number;
}

/**
 * Proxy request options
 */
export interface ProxyRequestOptions {
  /** Preferred location */
  location?: LocationId;
  /** Preferred proxy type */
  type?: ProxyType;
  /** Session ID for sticky sessions */
  sessionId?: string;
  /** Target domain (for sticky routing) */
  target?: string;
  /** Pool ID to use */
  poolId?: string;
  /** Exclude these proxy IDs */
  exclude?: string[];
}

/**
 * Proxy usage record
 */
export interface ProxyUsageRecord {
  /** Proxy ID */
  proxyId: string;
  /** Request count */
  requestCount: number;
  /** Bytes transferred */
  bytesTransferred: number;
  /** Estimated cost */
  estimatedCost: number;
  /** Period start */
  periodStart: Date;
  /** Period end */
  periodEnd: Date;
}

/**
 * Proxy manager configuration
 */
export interface ProxyManagerConfig {
  /** Health check interval in ms */
  healthCheckInterval?: number;
  /** Health check timeout in ms */
  healthCheckTimeout?: number;
  /** Unhealthy threshold (consecutive failures) */
  unhealthyThreshold?: number;
  /** Recovery threshold (consecutive successes) */
  recoveryThreshold?: number;
  /** Default sticky session duration in seconds */
  defaultStickyDuration?: number;
  /** Enable automatic health checks */
  autoHealthCheck?: boolean;
}

/**
 * Proxy manager statistics
 */
export interface ProxyManagerStats {
  /** Total proxies */
  totalProxies: number;
  /** Enabled proxies */
  enabledProxies: number;
  /** Healthy proxies */
  healthyProxies: number;
  /** Total pools */
  totalPools: number;
  /** Active sessions */
  activeSessions: number;
  /** Total requests */
  totalRequests: number;
  /** Total bytes transferred */
  totalBytes: number;
  /** By proxy type */
  byType: Record<ProxyType, number>;
  /** By location */
  byLocation: Record<string, number>;
}

/**
 * Default manager configuration
 */
export const DEFAULT_MANAGER_CONFIG: Required<ProxyManagerConfig> = {
  healthCheckInterval: 60000,      // 1 minute
  healthCheckTimeout: 10000,       // 10 seconds
  unhealthyThreshold: 3,           // 3 consecutive failures
  recoveryThreshold: 2,            // 2 consecutive successes
  defaultStickyDuration: 300,      // 5 minutes
  autoHealthCheck: true,
};
