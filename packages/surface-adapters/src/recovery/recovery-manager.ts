/**
 * Recovery Manager
 *
 * Implements automatic recovery strategies for surface adapters:
 * 1. Failover Chain (API -> Playwright -> CDP)
 * 2. Session Health Monitoring
 * 3. Rate Limit Handling with Backoff
 * 4. Anti-Bot Detection & Recovery
 * 5. Circuit Breaker Pattern
 */

import type { SurfaceAdapter, SurfaceQueryRequest, SurfaceQueryResponse } from '../types.js';

/**
 * Recovery strategy configuration
 */
export interface RecoveryConfig {
  /** Maximum retry attempts per strategy */
  maxRetries: number;
  /** Base delay for exponential backoff (ms) */
  baseDelayMs: number;
  /** Maximum delay cap (ms) */
  maxDelayMs: number;
  /** Circuit breaker threshold (failures before opening) */
  circuitBreakerThreshold: number;
  /** Circuit breaker reset time (ms) */
  circuitBreakerResetMs: number;
  /** Enable CDP fallback */
  enableCdpFallback: boolean;
  /** CDP port */
  cdpPort: number;
}

export const DEFAULT_RECOVERY_CONFIG: RecoveryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  circuitBreakerThreshold: 5,
  circuitBreakerResetMs: 60000,
  enableCdpFallback: true,
  cdpPort: 9222,
};

/**
 * Failure types for categorization
 */
export type FailureType =
  | 'rate_limit'
  | 'anti_bot'
  | 'session_expired'
  | 'network_error'
  | 'timeout'
  | 'unknown';

/**
 * Circuit breaker state
 */
interface CircuitState {
  failures: number;
  lastFailure: Date | null;
  isOpen: boolean;
  openedAt: Date | null;
}

/**
 * Surface health status
 */
export interface SurfaceHealth {
  surfaceId: string;
  isHealthy: boolean;
  lastSuccess: Date | null;
  lastFailure: Date | null;
  failureCount: number;
  circuitState: 'closed' | 'open' | 'half-open';
  lastError?: string;
}

/**
 * Recovery result
 */
export interface RecoveryResult {
  success: boolean;
  response?: SurfaceQueryResponse;
  strategy: 'primary' | 'retry' | 'cdp_fallback' | 'alternative_surface';
  attempts: number;
  totalTimeMs: number;
  errors: string[];
}

/**
 * Adapter factory for creating adapters on demand
 */
export type AdapterFactory = (surfaceId: string) => SurfaceAdapter | null;

/**
 * CDP query function type
 */
export type CdpQueryFn = (surfaceId: string, query: string) => Promise<SurfaceQueryResponse>;

/**
 * Recovery Manager
 */
export class RecoveryManager {
  private config: RecoveryConfig;
  private circuits: Map<string, CircuitState> = new Map();
  private healthHistory: Map<string, SurfaceHealth> = new Map();
  private cdpQueryFn?: CdpQueryFn;

  constructor(config: Partial<RecoveryConfig> = {}) {
    this.config = { ...DEFAULT_RECOVERY_CONFIG, ...config };
  }

  /**
   * Set CDP query function for fallback
   */
  setCdpQueryFn(fn: CdpQueryFn): void {
    this.cdpQueryFn = fn;
  }

  /**
   * Execute query with automatic recovery
   */
  async executeWithRecovery(
    surfaceId: string,
    request: SurfaceQueryRequest,
    adapter: SurfaceAdapter,
    alternativeAdapters?: SurfaceAdapter[]
  ): Promise<RecoveryResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    let attempts = 0;

    // Check circuit breaker
    if (this.isCircuitOpen(surfaceId)) {
      // Try half-open if enough time has passed
      if (!this.shouldAttemptHalfOpen(surfaceId)) {
        return {
          success: false,
          strategy: 'primary',
          attempts: 0,
          totalTimeMs: Date.now() - startTime,
          errors: [`Circuit breaker open for ${surfaceId}`],
        };
      }
    }

    // Strategy 1: Try primary adapter with retries
    for (let i = 0; i < this.config.maxRetries; i++) {
      attempts++;
      try {
        const response = await adapter.query(request);

        if (response.success) {
          this.recordSuccess(surfaceId);
          return {
            success: true,
            response,
            strategy: i === 0 ? 'primary' : 'retry',
            attempts,
            totalTimeMs: Date.now() - startTime,
            errors,
          };
        }

        // Analyze failure
        const failureType = this.categorizeFailure(response);
        errors.push(`Attempt ${i + 1}: ${failureType} - ${response.error?.message}`);

        // Handle based on failure type
        if (failureType === 'rate_limit') {
          await this.handleRateLimit(i);
        } else if (failureType === 'anti_bot' || failureType === 'session_expired') {
          // Don't retry these with same adapter
          break;
        } else {
          // Brief delay before retry
          await this.delay(this.config.baseDelayMs);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        errors.push(`Attempt ${i + 1}: exception - ${msg}`);
        await this.delay(this.config.baseDelayMs);
      }
    }

    this.recordFailure(surfaceId, errors[errors.length - 1]);

    // Strategy 2: Try CDP fallback
    if (this.config.enableCdpFallback && this.cdpQueryFn) {
      attempts++;
      try {
        const cdpResponse = await this.cdpQueryFn(surfaceId, request.query);
        if (cdpResponse.success) {
          return {
            success: true,
            response: cdpResponse,
            strategy: 'cdp_fallback',
            attempts,
            totalTimeMs: Date.now() - startTime,
            errors,
          };
        }
        errors.push(`CDP fallback: ${cdpResponse.error?.message}`);
      } catch (error) {
        errors.push(`CDP fallback exception: ${error instanceof Error ? error.message : error}`);
      }
    }

    // Strategy 3: Try alternative adapters
    if (alternativeAdapters && alternativeAdapters.length > 0) {
      for (const altAdapter of alternativeAdapters) {
        attempts++;
        try {
          const altResponse = await altAdapter.query(request);
          if (altResponse.success) {
            return {
              success: true,
              response: altResponse,
              strategy: 'alternative_surface',
              attempts,
              totalTimeMs: Date.now() - startTime,
              errors,
            };
          }
          errors.push(`Alternative adapter: ${altResponse.error?.message}`);
        } catch (error) {
          errors.push(`Alternative adapter exception: ${error instanceof Error ? error.message : error}`);
        }
      }
    }

    return {
      success: false,
      strategy: 'primary',
      attempts,
      totalTimeMs: Date.now() - startTime,
      errors,
    };
  }

  /**
   * Categorize failure type from response
   */
  private categorizeFailure(response: SurfaceQueryResponse): FailureType {
    const error = response.error;
    if (!error) return 'unknown';

    const message = error.message.toLowerCase();

    if (message.includes('rate limit') || message.includes('429') || message.includes('too many')) {
      return 'rate_limit';
    }
    if (message.includes('captcha') || message.includes('cloudflare') ||
        message.includes('just a moment') || message.includes('blocked')) {
      return 'anti_bot';
    }
    if (message.includes('login') || message.includes('session') ||
        message.includes('auth') || message.includes('expired')) {
      return 'session_expired';
    }
    if (message.includes('timeout')) {
      return 'timeout';
    }
    if (message.includes('network') || message.includes('connection') ||
        message.includes('ECONNREFUSED')) {
      return 'network_error';
    }

    return 'unknown';
  }

  /**
   * Handle rate limit with exponential backoff
   */
  private async handleRateLimit(attempt: number): Promise<void> {
    const delay = Math.min(
      this.config.baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000,
      this.config.maxDelayMs
    );
    console.log(`Rate limited, waiting ${Math.round(delay)}ms before retry...`);
    await this.delay(delay);
  }

  /**
   * Check if circuit breaker is open
   */
  private isCircuitOpen(surfaceId: string): boolean {
    const circuit = this.circuits.get(surfaceId);
    return circuit?.isOpen ?? false;
  }

  /**
   * Check if we should attempt half-open state
   */
  private shouldAttemptHalfOpen(surfaceId: string): boolean {
    const circuit = this.circuits.get(surfaceId);
    if (!circuit || !circuit.openedAt) return true;

    const elapsed = Date.now() - circuit.openedAt.getTime();
    return elapsed >= this.config.circuitBreakerResetMs;
  }

  /**
   * Record successful query
   */
  private recordSuccess(surfaceId: string): void {
    // Reset circuit breaker
    this.circuits.set(surfaceId, {
      failures: 0,
      lastFailure: null,
      isOpen: false,
      openedAt: null,
    });

    // Update health
    const health = this.healthHistory.get(surfaceId) || this.createHealthRecord(surfaceId);
    health.isHealthy = true;
    health.lastSuccess = new Date();
    health.failureCount = 0;
    health.circuitState = 'closed';
    health.lastError = undefined;
    this.healthHistory.set(surfaceId, health);
  }

  /**
   * Record failed query
   */
  private recordFailure(surfaceId: string, error?: string): void {
    const circuit = this.circuits.get(surfaceId) || {
      failures: 0,
      lastFailure: null,
      isOpen: false,
      openedAt: null,
    };

    circuit.failures++;
    circuit.lastFailure = new Date();

    // Open circuit if threshold exceeded
    if (circuit.failures >= this.config.circuitBreakerThreshold) {
      circuit.isOpen = true;
      circuit.openedAt = new Date();
      console.warn(`Circuit breaker opened for ${surfaceId} after ${circuit.failures} failures`);
    }

    this.circuits.set(surfaceId, circuit);

    // Update health
    const health = this.healthHistory.get(surfaceId) || this.createHealthRecord(surfaceId);
    health.isHealthy = false;
    health.lastFailure = new Date();
    health.failureCount++;
    health.circuitState = circuit.isOpen ? 'open' : 'closed';
    health.lastError = error;
    this.healthHistory.set(surfaceId, health);
  }

  /**
   * Create initial health record
   */
  private createHealthRecord(surfaceId: string): SurfaceHealth {
    return {
      surfaceId,
      isHealthy: true,
      lastSuccess: null,
      lastFailure: null,
      failureCount: 0,
      circuitState: 'closed',
    };
  }

  /**
   * Get health status for all surfaces
   */
  getHealthStatus(): SurfaceHealth[] {
    return Array.from(this.healthHistory.values());
  }

  /**
   * Get health status for a specific surface
   */
  getSurfaceHealth(surfaceId: string): SurfaceHealth | undefined {
    return this.healthHistory.get(surfaceId);
  }

  /**
   * Reset circuit breaker for a surface
   */
  resetCircuit(surfaceId: string): void {
    this.circuits.delete(surfaceId);
    const health = this.healthHistory.get(surfaceId);
    if (health) {
      health.circuitState = 'closed';
      health.failureCount = 0;
    }
  }

  /**
   * Reset all circuit breakers
   */
  resetAllCircuits(): void {
    this.circuits.clear();
    this.healthHistory.forEach(health => {
      health.circuitState = 'closed';
      health.failureCount = 0;
    });
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create a recovery manager
 */
export function createRecoveryManager(config?: Partial<RecoveryConfig>): RecoveryManager {
  return new RecoveryManager(config);
}
