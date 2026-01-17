/**
 * Surface Pool
 *
 * Manages multiple adapters for a single surface type with health-based failover.
 * Implements circuit breaker pattern and intelligent routing.
 */

import type {
  SurfaceAdapter,
  SurfaceQueryRequest,
  SurfaceQueryResponse,
  SurfaceError,
  ResponseTiming,
} from '../types.js';

/**
 * Circuit breaker state
 */
export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Health metrics for a pooled adapter
 */
export interface AdapterHealth {
  /** Health score 0-100 (100 = perfect health) */
  score: number;
  /** Last successful query timestamp */
  lastSuccess: Date | null;
  /** Last error timestamp */
  lastError: Date | null;
  /** Number of consecutive errors */
  consecutiveErrors: number;
  /** Error rate over sliding window (0-1) */
  errorRate: number;
  /** Response times in sliding window (ms) */
  responseTimes: number[];
  /** Average response time (ms) */
  avgResponseTime: number;
}

/**
 * Circuit breaker state for an adapter
 */
export interface CircuitBreaker {
  /** Current state */
  state: CircuitState;
  /** When the circuit will transition (for open -> half-open) */
  stateChangeAt: Date | null;
  /** Number of failures that triggered open state */
  failureCount: number;
  /** Number of successful probes in half-open state */
  halfOpenSuccesses: number;
}

/**
 * A pooled adapter with health tracking
 */
export interface PooledAdapter {
  /** Unique ID for this adapter instance */
  id: string;
  /** The underlying adapter */
  adapter: SurfaceAdapter;
  /** Health metrics */
  health: AdapterHealth;
  /** Circuit breaker state */
  circuitBreaker: CircuitBreaker;
  /** Priority (higher = preferred) */
  priority: number;
  /** Whether this adapter is enabled */
  enabled: boolean;
}

/**
 * Pool health status
 */
export interface PoolHealthStatus {
  /** Surface ID */
  surfaceId: string;
  /** Overall pool health score (0-100) */
  overallScore: number;
  /** Number of healthy adapters */
  healthyCount: number;
  /** Number of degraded adapters */
  degradedCount: number;
  /** Number of unhealthy adapters */
  unhealthyCount: number;
  /** Total adapters in pool */
  totalCount: number;
  /** Whether pool can serve requests */
  canServe: boolean;
  /** Individual adapter statuses */
  adapters: Array<{
    id: string;
    score: number;
    state: CircuitState;
    enabled: boolean;
  }>;
}

/**
 * Pool configuration
 */
export interface SurfacePoolConfig {
  /** Minimum health score to consider adapter healthy (0-100) */
  healthyThreshold: number;
  /** Minimum health score to consider adapter degraded (below = unhealthy) */
  degradedThreshold: number;
  /** Number of consecutive errors to open circuit */
  circuitBreakerThreshold: number;
  /** Time to wait before half-open probe (ms) */
  circuitBreakerTimeout: number;
  /** Number of successes needed to close circuit from half-open */
  halfOpenSuccessThreshold: number;
  /** Sliding window size for error rate calculation */
  slidingWindowSize: number;
  /** Response time sliding window size */
  responseTimeWindowSize: number;
  /** Enable round-robin among healthy adapters */
  enableRoundRobin: boolean;
}

/**
 * Default pool configuration
 */
export const DEFAULT_POOL_CONFIG: SurfacePoolConfig = {
  healthyThreshold: 80,
  degradedThreshold: 50,
  circuitBreakerThreshold: 5,
  circuitBreakerTimeout: 30000, // 30 seconds
  halfOpenSuccessThreshold: 3,
  slidingWindowSize: 20,
  responseTimeWindowSize: 10,
  enableRoundRobin: true,
};

/**
 * Surface Pool - manages multiple adapters for a single surface
 */
export class SurfacePool {
  private adapters: Map<string, PooledAdapter> = new Map();
  private config: SurfacePoolConfig;
  private roundRobinIndex: number = 0;
  private queryResults: Array<{ adapterId: string; success: boolean; timestamp: number }> = [];

  constructor(
    public readonly surfaceId: string,
    config: Partial<SurfacePoolConfig> = {}
  ) {
    this.config = { ...DEFAULT_POOL_CONFIG, ...config };
  }

  /**
   * Add an adapter to the pool
   */
  addAdapter(id: string, adapter: SurfaceAdapter, priority: number = 0): void {
    if (this.adapters.has(id)) {
      throw new Error(`Adapter with ID ${id} already exists in pool`);
    }

    this.adapters.set(id, {
      id,
      adapter,
      health: this.createInitialHealth(),
      circuitBreaker: this.createInitialCircuitBreaker(),
      priority,
      enabled: true,
    });
  }

  /**
   * Remove an adapter from the pool
   */
  async removeAdapter(id: string): Promise<void> {
    const pooled = this.adapters.get(id);
    if (pooled) {
      await pooled.adapter.close();
      this.adapters.delete(id);
    }
  }

  /**
   * Enable/disable an adapter
   */
  setAdapterEnabled(id: string, enabled: boolean): void {
    const pooled = this.adapters.get(id);
    if (pooled) {
      pooled.enabled = enabled;
    }
  }

  /**
   * Select the best adapter based on health and circuit breaker state
   */
  selectAdapter(): PooledAdapter | null {
    // Get all available adapters
    const available = this.getAvailableAdapters();

    if (available.length === 0) {
      return null;
    }

    // Sort by score (descending), then by priority
    available.sort((a, b) => {
      if (b.health.score !== a.health.score) {
        return b.health.score - a.health.score;
      }
      return b.priority - a.priority;
    });

    // If round-robin is enabled and we have multiple healthy adapters
    if (this.config.enableRoundRobin) {
      const healthy = available.filter(a => a.health.score >= this.config.healthyThreshold);
      if (healthy.length > 1) {
        this.roundRobinIndex = (this.roundRobinIndex + 1) % healthy.length;
        return healthy[this.roundRobinIndex];
      }
    }

    // Return best adapter
    return available[0];
  }

  /**
   * Execute a query using the best available adapter
   */
  async query(request: SurfaceQueryRequest): Promise<SurfaceQueryResponse & { adapterId: string }> {
    const pooled = this.selectAdapter();

    if (!pooled) {
      return {
        success: false,
        timing: { totalMs: 0, responseMs: 0 },
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: `No healthy adapters available for surface ${this.surfaceId}`,
          retryable: true,
        },
        adapterId: '',
      };
    }

    try {
      const result = await pooled.adapter.query(request);

      if (result.success) {
        this.reportSuccess(pooled.id, result.timing);
      } else if (result.error) {
        this.reportError(pooled.id, result.error);
      }

      return { ...result, adapterId: pooled.id };
    } catch (error) {
      const surfaceError: SurfaceError = {
        code: 'UNKNOWN_ERROR',
        message: error instanceof Error ? error.message : String(error),
        retryable: true,
        originalError: error,
      };
      this.reportError(pooled.id, surfaceError);

      return {
        success: false,
        timing: { totalMs: 0, responseMs: 0 },
        error: surfaceError,
        adapterId: pooled.id,
      };
    }
  }

  /**
   * Report a successful query
   */
  reportSuccess(adapterId: string, timing: ResponseTiming): void {
    const pooled = this.adapters.get(adapterId);
    if (!pooled) return;

    const now = new Date();

    // Update health metrics
    pooled.health.lastSuccess = now;
    pooled.health.consecutiveErrors = 0;

    // Update response times
    pooled.health.responseTimes.push(timing.totalMs);
    if (pooled.health.responseTimes.length > this.config.responseTimeWindowSize) {
      pooled.health.responseTimes.shift();
    }
    pooled.health.avgResponseTime = this.calculateAverage(pooled.health.responseTimes);

    // Update circuit breaker
    if (pooled.circuitBreaker.state === 'half-open') {
      pooled.circuitBreaker.halfOpenSuccesses++;
      if (pooled.circuitBreaker.halfOpenSuccesses >= this.config.halfOpenSuccessThreshold) {
        pooled.circuitBreaker.state = 'closed';
        pooled.circuitBreaker.failureCount = 0;
        pooled.circuitBreaker.halfOpenSuccesses = 0;
      }
    }

    // Record result for error rate calculation
    this.recordQueryResult(adapterId, true);

    // Update health score
    this.updateHealthScore(pooled);
  }

  /**
   * Report an error
   */
  reportError(adapterId: string, _error: SurfaceError): void {
    const pooled = this.adapters.get(adapterId);
    if (!pooled) return;

    const now = new Date();

    // Update health metrics
    pooled.health.lastError = now;
    pooled.health.consecutiveErrors++;

    // Update circuit breaker
    if (pooled.circuitBreaker.state === 'closed') {
      pooled.circuitBreaker.failureCount++;
      if (pooled.circuitBreaker.failureCount >= this.config.circuitBreakerThreshold) {
        pooled.circuitBreaker.state = 'open';
        pooled.circuitBreaker.stateChangeAt = new Date(
          Date.now() + this.config.circuitBreakerTimeout
        );
      }
    } else if (pooled.circuitBreaker.state === 'half-open') {
      // Failed probe - go back to open
      pooled.circuitBreaker.state = 'open';
      pooled.circuitBreaker.stateChangeAt = new Date(
        Date.now() + this.config.circuitBreakerTimeout
      );
      pooled.circuitBreaker.halfOpenSuccesses = 0;
    }

    // Record result for error rate calculation
    this.recordQueryResult(adapterId, false);

    // Update health score
    this.updateHealthScore(pooled);
  }

  /**
   * Get pool health status
   */
  getHealthStatus(): PoolHealthStatus {
    const adapters = Array.from(this.adapters.values());
    const statuses = adapters.map(a => ({
      id: a.id,
      score: a.health.score,
      state: a.circuitBreaker.state,
      enabled: a.enabled,
    }));

    const healthy = adapters.filter(
      a => a.enabled && a.health.score >= this.config.healthyThreshold
    ).length;
    const degraded = adapters.filter(
      a =>
        a.enabled &&
        a.health.score >= this.config.degradedThreshold &&
        a.health.score < this.config.healthyThreshold
    ).length;
    const unhealthy = adapters.filter(
      a => a.enabled && a.health.score < this.config.degradedThreshold
    ).length;

    const enabledScores = adapters
      .filter(a => a.enabled)
      .map(a => a.health.score);
    const overallScore =
      enabledScores.length > 0 ? this.calculateAverage(enabledScores) : 0;

    return {
      surfaceId: this.surfaceId,
      overallScore: Math.round(overallScore),
      healthyCount: healthy,
      degradedCount: degraded,
      unhealthyCount: unhealthy,
      totalCount: adapters.length,
      canServe: healthy > 0 || degraded > 0,
      adapters: statuses,
    };
  }

  /**
   * Get adapter health details
   */
  getAdapterHealth(adapterId: string): AdapterHealth | null {
    const pooled = this.adapters.get(adapterId);
    return pooled ? { ...pooled.health } : null;
  }

  /**
   * Close all adapters in the pool
   */
  async close(): Promise<void> {
    const closePromises = Array.from(this.adapters.values()).map(p =>
      p.adapter.close()
    );
    await Promise.all(closePromises);
    this.adapters.clear();
  }

  /**
   * Get available adapters (enabled, circuit not open)
   */
  private getAvailableAdapters(): PooledAdapter[] {
    const now = Date.now();

    return Array.from(this.adapters.values()).filter(pooled => {
      if (!pooled.enabled) return false;

      // Check circuit breaker state
      if (pooled.circuitBreaker.state === 'open') {
        // Check if we should transition to half-open
        if (
          pooled.circuitBreaker.stateChangeAt &&
          now >= pooled.circuitBreaker.stateChangeAt.getTime()
        ) {
          pooled.circuitBreaker.state = 'half-open';
          pooled.circuitBreaker.halfOpenSuccesses = 0;
          return true;
        }
        return false;
      }

      return true;
    });
  }

  /**
   * Create initial health state
   */
  private createInitialHealth(): AdapterHealth {
    return {
      score: 100,
      lastSuccess: null,
      lastError: null,
      consecutiveErrors: 0,
      errorRate: 0,
      responseTimes: [],
      avgResponseTime: 0,
    };
  }

  /**
   * Create initial circuit breaker state
   */
  private createInitialCircuitBreaker(): CircuitBreaker {
    return {
      state: 'closed',
      stateChangeAt: null,
      failureCount: 0,
      halfOpenSuccesses: 0,
    };
  }

  /**
   * Record a query result for error rate calculation
   */
  private recordQueryResult(adapterId: string, success: boolean): void {
    const now = Date.now();

    this.queryResults.push({ adapterId, success, timestamp: now });

    // Trim to sliding window
    const windowStart = now - 60000; // 1 minute window
    this.queryResults = this.queryResults.filter(r => r.timestamp >= windowStart);
  }

  /**
   * Update health score for an adapter
   */
  private updateHealthScore(pooled: PooledAdapter): void {
    let score = 100;

    // Factor 1: Error rate (0-40 points deduction)
    const adapterResults = this.queryResults.filter(r => r.adapterId === pooled.id);
    if (adapterResults.length > 0) {
      const failures = adapterResults.filter(r => !r.success).length;
      pooled.health.errorRate = failures / adapterResults.length;
      score -= pooled.health.errorRate * 40;
    }

    // Factor 2: Consecutive errors (0-30 points deduction)
    const consecutiveDeduction = Math.min(pooled.health.consecutiveErrors * 10, 30);
    score -= consecutiveDeduction;

    // Factor 3: Circuit breaker state (0-30 points deduction)
    switch (pooled.circuitBreaker.state) {
      case 'open':
        score -= 30;
        break;
      case 'half-open':
        score -= 15;
        break;
    }

    // Factor 4: Response time degradation (0-10 points deduction)
    // Compare to baseline (first 5 responses average)
    if (pooled.health.responseTimes.length >= 5) {
      const baseline = this.calculateAverage(pooled.health.responseTimes.slice(0, 5));
      const recent = this.calculateAverage(pooled.health.responseTimes.slice(-5));
      if (baseline > 0 && recent > baseline * 2) {
        // Response time doubled
        score -= 10;
      } else if (baseline > 0 && recent > baseline * 1.5) {
        // Response time increased 50%
        score -= 5;
      }
    }

    pooled.health.score = Math.max(0, Math.min(100, Math.round(score)));
  }

  /**
   * Calculate average of numbers
   */
  private calculateAverage(numbers: number[]): number {
    if (numbers.length === 0) return 0;
    return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
  }
}

/**
 * Create a surface pool
 */
export function createSurfacePool(
  surfaceId: string,
  config?: Partial<SurfacePoolConfig>
): SurfacePool {
  return new SurfacePool(surfaceId, config);
}
