/**
 * Base Surface Adapter
 *
 * Abstract base class for all surface adapters with common functionality:
 * - Rate limiting
 * - Health tracking
 * - Statistics collection
 * - Error classification
 */

import type {
  SurfaceAdapter,
  SurfaceMetadata,
  SurfaceQueryRequest,
  SurfaceQueryResponse,
  HealthCheckResult,
  RateLimitStatus,
  AdapterStats,
  SurfaceError,
  SurfaceErrorCode,
  ResponseTiming,
} from '../types.js';

/**
 * Base adapter configuration
 */
export interface BaseAdapterConfig {
  /** Request timeout in ms */
  timeoutMs: number;
  /** Maximum retries */
  maxRetries: number;
  /** Base retry delay in ms */
  retryDelayMs: number;
  /** Whether to collect detailed stats */
  collectStats: boolean;
  /** Health check interval in ms */
  healthCheckIntervalMs: number;
}

/**
 * Default base adapter configuration
 */
export const DEFAULT_BASE_CONFIG: BaseAdapterConfig = {
  timeoutMs: 30000,
  maxRetries: 3,
  retryDelayMs: 1000,
  collectStats: true,
  healthCheckIntervalMs: 60000,
};

/**
 * Error classification for retry decisions
 */
export interface ErrorClassification {
  /** Error code */
  code: SurfaceErrorCode;
  /** Whether to retry */
  retryable: boolean;
  /** Suggested delay before retry */
  retryDelayMs: number;
  /** Whether this indicates a surface-wide issue */
  surfaceWide: boolean;
  /** Suggested action */
  suggestedAction: 'retry' | 'refresh_session' | 'rotate_proxy' | 'alert_human' | 'disable_surface';
}

/**
 * Abstract base class for surface adapters
 */
export abstract class BaseSurfaceAdapter implements SurfaceAdapter {
  protected config: BaseAdapterConfig;
  protected stats: AdapterStats;
  protected healthState: HealthCheckResult;
  protected rateLimitState: RateLimitStatus;
  protected lastQueryTime?: Date;

  constructor(
    public readonly metadata: SurfaceMetadata,
    config: Partial<BaseAdapterConfig> = {}
  ) {
    this.config = { ...DEFAULT_BASE_CONFIG, ...config };
    this.stats = this.initializeStats();
    this.healthState = this.initializeHealthState();
    this.rateLimitState = this.initializeRateLimitState();
  }

  /**
   * Initialize statistics
   */
  private initializeStats(): AdapterStats {
    return {
      totalQueries: 0,
      successfulQueries: 0,
      failedQueries: 0,
      avgResponseTimeMs: 0,
      totalTokensUsed: 0,
      totalCostUsd: 0,
      errorsByCode: {} as Record<SurfaceErrorCode, number>,
    };
  }

  /**
   * Initialize health state
   */
  private initializeHealthState(): HealthCheckResult {
    return {
      healthy: true,
      failureCount: 0,
    };
  }

  /**
   * Initialize rate limit state
   */
  private initializeRateLimitState(): RateLimitStatus {
    return {
      currentCount: 0,
      maxCount: this.metadata.rateLimit ?? 60,
      isLimited: false,
    };
  }

  /**
   * Execute a query with retry logic and stats collection
   */
  async query(request: SurfaceQueryRequest): Promise<SurfaceQueryResponse> {
    const startTime = Date.now();

    // Check rate limit
    if (this.rateLimitState.isLimited) {
      return this.createErrorResponse(
        'RATE_LIMITED',
        'Rate limit exceeded',
        true,
        this.rateLimitState.resetInMs,
        startTime
      );
    }

    // Check health
    if (!this.healthState.healthy && this.healthState.failureCount > 5) {
      return this.createErrorResponse(
        'SERVICE_UNAVAILABLE',
        `Surface unhealthy: ${this.healthState.error}`,
        true,
        undefined,
        startTime
      );
    }

    let lastError: SurfaceError | undefined;
    const effectiveTimeout = request.timeoutMs ?? this.config.timeoutMs;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        // Apply timeout
        const response = await this.withTimeout(
          this.executeQuery(request),
          effectiveTimeout
        );

        // Update stats
        this.recordSuccess(Date.now() - startTime, response);
        return response;
      } catch (error) {
        const classification = this.classifyError(error);
        lastError = {
          code: classification.code,
          message: error instanceof Error ? error.message : String(error),
          retryable: classification.retryable,
          retryDelayMs: classification.retryDelayMs,
          originalError: error,
        };

        // Record error
        this.recordError(classification.code);

        // Handle based on classification
        if (classification.surfaceWide) {
          this.healthState.healthy = false;
          this.healthState.error = lastError.message;
          this.healthState.failureCount++;
        }

        // Check if we should retry
        if (!classification.retryable || attempt >= this.config.maxRetries) {
          break;
        }

        // Wait before retry
        await this.sleep(classification.retryDelayMs * Math.pow(2, attempt));
      }
    }

    // All retries exhausted - preserve original error's retryable flag
    return this.createErrorResponse(
      lastError?.code ?? 'UNKNOWN_ERROR',
      lastError?.message ?? 'Unknown error',
      lastError?.retryable ?? false,
      lastError?.retryDelayMs,
      startTime,
      lastError
    );
  }

  /**
   * Execute the actual query - implemented by subclasses
   */
  protected abstract executeQuery(request: SurfaceQueryRequest): Promise<SurfaceQueryResponse>;

  /**
   * Perform a health check
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();

    try {
      // Simple test query
      const response = await this.withTimeout(
        this.executeHealthCheck(),
        10000
      );

      if (response.success) {
        this.healthState = {
          healthy: true,
          latencyMs: Date.now() - startTime,
          lastSuccessAt: new Date(),
          failureCount: 0,
        };
      } else {
        this.healthState.failureCount++;
        this.healthState.healthy = this.healthState.failureCount < 3;
        this.healthState.error = response.error?.message;
      }
    } catch (error) {
      this.healthState.failureCount++;
      this.healthState.healthy = this.healthState.failureCount < 3;
      this.healthState.error = error instanceof Error ? error.message : String(error);
    }

    return this.healthState;
  }

  /**
   * Execute health check - can be overridden by subclasses
   */
  protected async executeHealthCheck(): Promise<SurfaceQueryResponse> {
    // Default: send a simple test query
    return this.executeQuery({
      query: 'test',
      timeoutMs: 10000,
    });
  }

  /**
   * Get current rate limit status
   */
  getRateLimitStatus(): RateLimitStatus {
    // Update rate limit state
    if (this.rateLimitState.resetAt && new Date() >= this.rateLimitState.resetAt) {
      this.rateLimitState.currentCount = 0;
      this.rateLimitState.isLimited = false;
      this.rateLimitState.resetAt = undefined;
      this.rateLimitState.resetInMs = undefined;
    }

    return { ...this.rateLimitState };
  }

  /**
   * Get adapter statistics
   */
  getStats(): AdapterStats {
    return { ...this.stats };
  }

  /**
   * Close/cleanup the adapter
   */
  abstract close(): Promise<void>;

  /**
   * Classify an error for retry/handling decisions
   */
  protected classifyError(error: unknown): ErrorClassification {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

    // Rate limiting
    if (message.includes('rate limit') || message.includes('429') || message.includes('too many requests')) {
      return {
        code: 'RATE_LIMITED',
        retryable: true,
        retryDelayMs: 60000, // Wait 1 minute
        surfaceWide: true,
        suggestedAction: 'retry',
      };
    }

    // Authentication
    if (message.includes('unauthorized') || message.includes('401') || message.includes('auth') || message.includes('forbidden') || message.includes('403')) {
      return {
        code: 'AUTH_FAILED',
        retryable: false,
        retryDelayMs: 0,
        surfaceWide: true,
        suggestedAction: 'refresh_session',
      };
    }

    // Timeout
    if (message.includes('timeout') || message.includes('timed out') || message.includes('etimedout')) {
      return {
        code: 'TIMEOUT',
        retryable: true,
        retryDelayMs: this.config.retryDelayMs,
        surfaceWide: false,
        suggestedAction: 'retry',
      };
    }

    // Network errors
    if (message.includes('network') || message.includes('econnrefused') || message.includes('econnreset') || message.includes('enotfound')) {
      return {
        code: 'NETWORK_ERROR',
        retryable: true,
        retryDelayMs: this.config.retryDelayMs * 2,
        surfaceWide: false,
        suggestedAction: 'rotate_proxy',
      };
    }

    // Service unavailable
    if (message.includes('503') || message.includes('502') || message.includes('service unavailable') || message.includes('bad gateway')) {
      return {
        code: 'SERVICE_UNAVAILABLE',
        retryable: true,
        retryDelayMs: this.config.retryDelayMs * 3,
        surfaceWide: true,
        suggestedAction: 'retry',
      };
    }

    // Content blocked
    if (message.includes('blocked') || message.includes('content policy') || message.includes('violation')) {
      return {
        code: 'CONTENT_BLOCKED',
        retryable: false,
        retryDelayMs: 0,
        surfaceWide: false,
        suggestedAction: 'alert_human',
      };
    }

    // Quota exceeded
    if (message.includes('quota') || message.includes('limit exceeded') || message.includes('billing')) {
      return {
        code: 'QUOTA_EXCEEDED',
        retryable: false,
        retryDelayMs: 0,
        surfaceWide: true,
        suggestedAction: 'alert_human',
      };
    }

    // Session expired (for web surfaces)
    if (message.includes('session') || message.includes('expired') || message.includes('login required')) {
      return {
        code: 'SESSION_EXPIRED',
        retryable: false,
        retryDelayMs: 0,
        surfaceWide: true,
        suggestedAction: 'refresh_session',
      };
    }

    // Captcha required
    if (message.includes('captcha') || message.includes('verification') || message.includes('robot')) {
      return {
        code: 'CAPTCHA_REQUIRED',
        retryable: false,
        retryDelayMs: 0,
        surfaceWide: true,
        suggestedAction: 'alert_human',
      };
    }

    // Invalid response
    if (message.includes('invalid') || message.includes('parse') || message.includes('json')) {
      return {
        code: 'INVALID_RESPONSE',
        retryable: true,
        retryDelayMs: this.config.retryDelayMs,
        surfaceWide: false,
        suggestedAction: 'retry',
      };
    }

    // Unknown error
    return {
      code: 'UNKNOWN_ERROR',
      retryable: true,
      retryDelayMs: this.config.retryDelayMs,
      surfaceWide: false,
      suggestedAction: 'retry',
    };
  }

  /**
   * Record a successful query
   */
  protected recordSuccess(durationMs: number, response: SurfaceQueryResponse): void {
    this.stats.totalQueries++;
    this.stats.successfulQueries++;
    this.stats.lastQueryAt = new Date();

    // Update average response time
    this.stats.avgResponseTimeMs =
      (this.stats.avgResponseTimeMs * (this.stats.successfulQueries - 1) + durationMs) /
      this.stats.successfulQueries;

    // Update token usage and cost
    if (response.tokenUsage) {
      this.stats.totalTokensUsed += response.tokenUsage.totalTokens;
      if (response.tokenUsage.estimatedCostUsd) {
        this.stats.totalCostUsd += response.tokenUsage.estimatedCostUsd;
      }
    }

    // Update rate limit state
    this.rateLimitState.currentCount++;
    if (this.rateLimitState.currentCount >= this.rateLimitState.maxCount) {
      this.rateLimitState.isLimited = true;
      this.rateLimitState.resetAt = new Date(Date.now() + 60000);
      this.rateLimitState.resetInMs = 60000;
    }

    // Update health state
    this.healthState.healthy = true;
    this.healthState.lastSuccessAt = new Date();
    this.healthState.failureCount = 0;

    this.lastQueryTime = new Date();
  }

  /**
   * Record an error
   */
  protected recordError(code: SurfaceErrorCode): void {
    this.stats.totalQueries++;
    this.stats.failedQueries++;
    this.stats.errorsByCode[code] = (this.stats.errorsByCode[code] ?? 0) + 1;
    this.stats.lastQueryAt = new Date();
  }

  /**
   * Create an error response
   */
  protected createErrorResponse(
    code: SurfaceErrorCode,
    message: string,
    retryable: boolean,
    retryDelayMs: number | undefined,
    startTime: number,
    originalError?: SurfaceError
  ): SurfaceQueryResponse {
    return {
      success: false,
      timing: this.createTiming(startTime),
      error: {
        code,
        message,
        retryable,
        retryDelayMs,
        originalError: originalError?.originalError,
      },
    };
  }

  /**
   * Create timing information
   */
  protected createTiming(startTime: number): ResponseTiming {
    const totalMs = Date.now() - startTime;
    return {
      totalMs,
      responseMs: totalMs,
    };
  }

  /**
   * Apply timeout to a promise
   */
  protected async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout>;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Request timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutId!);
    }
  }

  /**
   * Sleep for a duration
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
