/**
 * Execution Provider Abstraction
 *
 * This abstraction allows Bentham to swap between in-house execution
 * (using our browser automation) and outsourced execution (Apify,
 * Browserless, Bright Data, etc.) without changing the rest of the system.
 *
 * Current implementation: InHouseExecutionProvider (uses local adapters)
 * Future implementations: ApifyExecutionProvider, BrowserlessExecutionProvider, etc.
 */

import type {
  SurfaceQueryRequest,
  SurfaceQueryResponse,
  ProxyConfig,
} from '../types';

/**
 * Execution request - what to execute
 */
export interface ExecutionRequest {
  /** Surface to query */
  surfaceId: string;
  /** Query details */
  query: SurfaceQueryRequest;
  /** Geographic location for the query */
  location?: {
    country: string;
    city?: string;
    coordinates?: { lat: number; lng: number };
  };
  /** Proxy configuration (provider may override) */
  proxy?: ProxyConfig;
  /** Session/account to use (provider may override) */
  sessionId?: string;
  /** Timeout in ms */
  timeoutMs?: number;
  /** Whether to capture evidence */
  captureEvidence?: boolean;
}

/**
 * Execution result - what came back
 */
export interface ExecutionResult {
  /** Whether execution succeeded */
  success: boolean;
  /** Surface response (if successful) */
  response?: SurfaceQueryResponse;
  /** Error information (if failed) */
  error?: {
    code: string;
    message: string;
    isRetryable: boolean;
    providerError?: unknown;
  };
  /** Execution metadata */
  metadata: {
    /** Provider that executed the query */
    provider: string;
    /** Actual execution time */
    executionTimeMs: number;
    /** Proxy used (if any) */
    proxyUsed?: string;
    /** Location used */
    locationUsed?: string;
    /** Cost of this execution (USD) */
    costUsd?: number;
    /** Provider-specific metadata */
    providerMetadata?: Record<string, unknown>;
  };
}

/**
 * Provider health status
 */
export interface ProviderHealthStatus {
  /** Provider name */
  provider: string;
  /** Whether provider is healthy */
  healthy: boolean;
  /** Current success rate (0-1) */
  successRate: number;
  /** Average latency in ms */
  avgLatencyMs: number;
  /** Number of queries in current window */
  queriesInWindow: number;
  /** Surfaces this provider supports */
  supportedSurfaces: string[];
  /** Last error (if unhealthy) */
  lastError?: string;
  /** Last successful execution */
  lastSuccessAt?: Date;
}

/**
 * Provider configuration
 */
export interface ExecutionProviderConfig {
  /** Provider name/id */
  name: string;
  /** Whether this provider is enabled */
  enabled: boolean;
  /** Surfaces this provider supports (empty = all) */
  supportedSurfaces?: string[];
  /** Priority (lower = higher priority) */
  priority?: number;
  /** Maximum concurrent executions */
  maxConcurrency?: number;
  /** Provider-specific configuration */
  config?: Record<string, unknown>;
}

/**
 * Execution Provider Interface
 *
 * Implement this interface to add a new execution provider
 * (e.g., ApifyExecutionProvider, BrowserlessExecutionProvider)
 */
export interface ExecutionProvider {
  /** Provider name */
  readonly name: string;

  /**
   * Execute a query against a surface
   */
  execute(request: ExecutionRequest): Promise<ExecutionResult>;

  /**
   * Check if this provider supports a given surface
   */
  supportsSurface(surfaceId: string): boolean;

  /**
   * Get provider health status
   */
  getHealth(): Promise<ProviderHealthStatus>;

  /**
   * Initialize the provider (called once on startup)
   */
  initialize(): Promise<void>;

  /**
   * Shutdown the provider (called on graceful shutdown)
   */
  shutdown(): Promise<void>;

  /**
   * Get estimated cost for an execution request
   */
  estimateCost(request: ExecutionRequest): number;
}

/**
 * Execution Provider Manager
 *
 * Routes execution requests to the appropriate provider
 * and handles failover between providers.
 */
export interface ExecutionProviderManager {
  /**
   * Execute using the best available provider
   */
  execute(request: ExecutionRequest): Promise<ExecutionResult>;

  /**
   * Execute using a specific provider
   */
  executeWith(
    provider: string,
    request: ExecutionRequest
  ): Promise<ExecutionResult>;

  /**
   * Register a provider
   */
  registerProvider(provider: ExecutionProvider): void;

  /**
   * Get all registered providers
   */
  getProviders(): ExecutionProvider[];

  /**
   * Get provider by name
   */
  getProvider(name: string): ExecutionProvider | undefined;

  /**
   * Get health of all providers
   */
  getHealth(): Promise<Record<string, ProviderHealthStatus>>;

  /**
   * Set provider priority for a surface
   */
  setProviderPriority(surfaceId: string, providerPriorities: string[]): void;

  /**
   * Enable/disable a provider
   */
  setProviderEnabled(provider: string, enabled: boolean): void;
}

/**
 * Failover configuration
 */
export interface FailoverConfig {
  /** Enable automatic failover */
  enabled: boolean;
  /** Success rate threshold to trigger failover (0-1) */
  successRateThreshold: number;
  /** Number of consecutive failures to trigger failover */
  consecutiveFailureThreshold: number;
  /** Time window for success rate calculation (ms) */
  windowMs: number;
  /** Cooldown before retrying failed provider (ms) */
  cooldownMs: number;
}

/**
 * Default failover configuration
 */
export const DEFAULT_FAILOVER_CONFIG: FailoverConfig = {
  enabled: true,
  successRateThreshold: 0.7, // Failover if success rate drops below 70%
  consecutiveFailureThreshold: 3, // Failover after 3 consecutive failures
  windowMs: 5 * 60 * 1000, // 5 minute window
  cooldownMs: 15 * 60 * 1000, // 15 minute cooldown
};
