/**
 * In-House Execution Provider
 *
 * Executes queries using Bentham's built-in surface adapters
 * and browser automation (Playwright/Puppeteer).
 *
 * This is the default provider. If it fails due to anti-bot detection
 * or other issues, the system can failover to outsourced providers.
 */

import type {
  ExecutionProvider,
  ExecutionRequest,
  ExecutionResult,
  ProviderHealthStatus,
} from './execution-provider';
import type { SurfaceAdapter } from '../types';

/**
 * In-House Provider Configuration
 */
export interface InHouseProviderConfig {
  /** Registry of surface adapters */
  adapterRegistry: AdapterRegistry;
  /** Default timeout for queries */
  defaultTimeoutMs?: number;
  /** Enable human behavior simulation */
  humanBehavior?: boolean;
}

/**
 * Adapter Registry interface (simplified)
 */
export interface AdapterRegistry {
  get(surfaceId: string): SurfaceAdapter | undefined;
  list(): string[];
  has(surfaceId: string): boolean;
}

/**
 * In-House Execution Provider
 *
 * Uses Bentham's local surface adapters to execute queries.
 */
export class InHouseExecutionProvider implements ExecutionProvider {
  readonly name = 'in-house';

  private adapterRegistry: AdapterRegistry;
  private defaultTimeoutMs: number;
  // Reserved for future human behavior simulation
  // private humanBehavior: boolean;

  // Health tracking
  private queryCount = 0;
  private successCount = 0;
  private totalLatencyMs = 0;
  private lastSuccessAt?: Date;
  private lastError?: string;

  constructor(config: InHouseProviderConfig) {
    this.adapterRegistry = config.adapterRegistry;
    this.defaultTimeoutMs = config.defaultTimeoutMs ?? 30000;
    // humanBehavior reserved for future use
    // this.humanBehavior = config.humanBehavior ?? true;
  }

  async initialize(): Promise<void> {
    // In-house provider initializes adapters on-demand
    // Nothing to do here
  }

  async shutdown(): Promise<void> {
    // Close all adapters
    const surfaces = this.adapterRegistry.list();
    for (const surfaceId of surfaces) {
      const adapter = this.adapterRegistry.get(surfaceId);
      if (adapter) {
        await adapter.close();
      }
    }
  }

  supportsSurface(surfaceId: string): boolean {
    return this.adapterRegistry.has(surfaceId);
  }

  async execute(request: ExecutionRequest): Promise<ExecutionResult> {
    const startTime = Date.now();
    this.queryCount++;

    const adapter = this.adapterRegistry.get(request.surfaceId);
    if (!adapter) {
      return {
        success: false,
        error: {
          code: 'UNSUPPORTED_SURFACE',
          message: `Surface ${request.surfaceId} not supported by in-house provider`,
          isRetryable: false,
        },
        metadata: {
          provider: this.name,
          executionTimeMs: Date.now() - startTime,
        },
      };
    }

    try {
      const response = await adapter.query({
        ...request.query,
        timeoutMs: request.timeoutMs ?? this.defaultTimeoutMs,
      });

      const executionTimeMs = Date.now() - startTime;
      this.successCount++;
      this.totalLatencyMs += executionTimeMs;
      this.lastSuccessAt = new Date();

      return {
        success: response.success,
        response,
        metadata: {
          provider: this.name,
          executionTimeMs,
          proxyUsed: request.proxy?.host,
          locationUsed: request.location?.city ?? request.location?.country,
          costUsd: this.estimateCost(request),
        },
      };
    } catch (error) {
      const executionTimeMs = Date.now() - startTime;
      this.lastError =
        error instanceof Error ? error.message : 'Unknown error';

      return {
        success: false,
        error: {
          code: 'EXECUTION_ERROR',
          message: this.lastError,
          isRetryable: this.isRetryableError(error),
          providerError: error,
        },
        metadata: {
          provider: this.name,
          executionTimeMs,
        },
      };
    }
  }

  async getHealth(): Promise<ProviderHealthStatus> {
    return {
      provider: this.name,
      healthy: this.getSuccessRate() >= 0.7,
      successRate: this.getSuccessRate(),
      avgLatencyMs: this.getAvgLatency(),
      queriesInWindow: this.queryCount,
      supportedSurfaces: this.adapterRegistry.list(),
      lastError: this.lastError,
      lastSuccessAt: this.lastSuccessAt,
    };
  }

  estimateCost(request: ExecutionRequest): number {
    // In-house costs are primarily infrastructure (proxy, compute)
    // Rough estimate: $0.01 per query for web surfaces, $0.001 for API
    const surfaceId = request.surfaceId;
    if (surfaceId.includes('api')) {
      return 0.001; // API surfaces are cheap
    }
    if (surfaceId.includes('web') || surfaceId.includes('search')) {
      return 0.01; // Web surfaces need browser + proxy
    }
    return 0.005; // Default
  }

  private getSuccessRate(): number {
    if (this.queryCount === 0) return 1;
    return this.successCount / this.queryCount;
  }

  private getAvgLatency(): number {
    if (this.successCount === 0) return 0;
    return this.totalLatencyMs / this.successCount;
  }

  private isRetryableError(error: unknown): boolean {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      return (
        msg.includes('timeout') ||
        msg.includes('rate limit') ||
        msg.includes('network') ||
        msg.includes('captcha')
      );
    }
    return true; // Assume retryable by default
  }
}

/**
 * Create an in-house execution provider
 */
export function createInHouseProvider(
  config: InHouseProviderConfig
): InHouseExecutionProvider {
  return new InHouseExecutionProvider(config);
}
