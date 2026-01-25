/**
 * Retry Logic for Bentham Studies
 *
 * Provides configurable retry behavior with backoff strategies.
 */

/**
 * Surface error codes that affect retry behavior
 * These map to the SurfaceErrorCode type in surface-adapters
 */
export type SurfaceErrorCode =
  | 'RATE_LIMITED'
  | 'AUTH_FAILED'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'INVALID_RESPONSE'
  | 'CONTENT_BLOCKED'
  | 'SERVICE_UNAVAILABLE'
  | 'QUOTA_EXCEEDED'
  | 'INVALID_REQUEST'
  | 'SESSION_EXPIRED'
  | 'CAPTCHA_REQUIRED'
  | 'NO_CONTENT'
  | 'SERPAPI_ERROR'
  | 'UNKNOWN_ERROR';

/**
 * Retry backoff strategy
 */
export type BackoffStrategy = 'fixed' | 'linear' | 'exponential';

/**
 * Retry conditions configuration
 */
export interface RetryConditions {
  onRateLimited: boolean;
  onNetworkError: boolean;
  onServiceUnavailable: boolean;
  onTimeout: boolean;
  onInvalidResponse: boolean;
  onCaptchaRequired: boolean;
  onSessionExpired: boolean;
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxRetries: number;
  backoffStrategy: BackoffStrategy;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  jitter: boolean;
  retryConditions: RetryConditions;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  backoffStrategy: 'exponential',
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  backoffMultiplier: 2,
  jitter: true,
  retryConditions: {
    onRateLimited: true,
    onNetworkError: true,
    onServiceUnavailable: true,
    onTimeout: true,
    onInvalidResponse: true,
    onCaptchaRequired: false,
    onSessionExpired: true,
  },
};

/**
 * Map error codes to retry condition keys
 */
const ERROR_TO_CONDITION: Record<string, keyof RetryConditions> = {
  'RATE_LIMITED': 'onRateLimited',
  'NETWORK_ERROR': 'onNetworkError',
  'SERVICE_UNAVAILABLE': 'onServiceUnavailable',
  'TIMEOUT': 'onTimeout',
  'INVALID_RESPONSE': 'onInvalidResponse',
  'CAPTCHA_REQUIRED': 'onCaptchaRequired',
  'SESSION_EXPIRED': 'onSessionExpired',
};

/**
 * Check if an error should be retried based on configuration
 */
export function shouldRetry(
  errorCode: SurfaceErrorCode | string,
  attempt: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): boolean {
  // Check if we have retries remaining
  if (attempt >= config.maxRetries) {
    return false;
  }

  // Check if this error type should be retried
  const conditionKey = ERROR_TO_CONDITION[errorCode];
  if (conditionKey && !config.retryConditions[conditionKey]) {
    return false;
  }

  // Non-retryable errors (regardless of config)
  const neverRetry: SurfaceErrorCode[] = [
    'AUTH_FAILED',
    'QUOTA_EXCEEDED',
    'INVALID_REQUEST',
    'CONTENT_BLOCKED',
  ];

  if (neverRetry.includes(errorCode as SurfaceErrorCode)) {
    return false;
  }

  return true;
}

/**
 * Calculate retry delay using configured backoff strategy
 */
export function calculateRetryDelay(
  attempt: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): number {
  let delay: number;

  switch (config.backoffStrategy) {
    case 'fixed':
      delay = config.initialDelayMs;
      break;

    case 'linear':
      delay = config.initialDelayMs * (attempt + 1);
      break;

    case 'exponential':
    default:
      delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
      break;
  }

  // Cap at max delay
  delay = Math.min(delay, config.maxDelayMs);

  // Add jitter (±20%)
  if (config.jitter) {
    const jitterRange = delay * 0.2;
    delay = delay + (Math.random() * 2 * jitterRange) - jitterRange;
  }

  return Math.round(delay);
}

/**
 * Retry state for tracking retry progress
 */
export interface RetryState {
  attempt: number;
  lastError?: string;
  lastErrorCode?: SurfaceErrorCode | string;
  lastAttemptTime?: Date;
  nextRetryTime?: Date;
  exhausted: boolean;
}

/**
 * Create initial retry state
 */
export function createRetryState(): RetryState {
  return {
    attempt: 0,
    exhausted: false,
  };
}

/**
 * Update retry state after a failure
 */
export function updateRetryState(
  state: RetryState,
  errorCode: SurfaceErrorCode | string,
  errorMessage: string,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): RetryState {
  const newAttempt = state.attempt + 1;
  const canRetry = shouldRetry(errorCode, state.attempt, config);

  return {
    attempt: newAttempt,
    lastError: errorMessage,
    lastErrorCode: errorCode,
    lastAttemptTime: new Date(),
    nextRetryTime: canRetry
      ? new Date(Date.now() + calculateRetryDelay(state.attempt, config))
      : undefined,
    exhausted: !canRetry,
  };
}

/**
 * Retry wrapper function - executes a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {},
  onRetry?: (attempt: number, delay: number, error: Error) => void
): Promise<T> {
  const fullConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= fullConfig.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Extract error code from message (format: "CODE: message")
      const errorCodeMatch = lastError.message.match(/^([A-Z_]+):/);
      const errorCode = errorCodeMatch?.[1] || 'UNKNOWN_ERROR';

      if (!shouldRetry(errorCode, attempt, fullConfig)) {
        throw lastError;
      }

      if (attempt < fullConfig.maxRetries) {
        const delay = calculateRetryDelay(attempt, fullConfig);
        onRetry?.(attempt + 1, delay, lastError);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/**
 * Retry statistics for reporting
 */
export interface RetryStats {
  totalAttempts: number;
  successfulAttempts: number;
  failedAttempts: number;
  retriedQueries: number;
  exhaustedRetries: number;
  errorsByCode: Record<string, number>;
  averageRetriesPerSuccess: number;
}

/**
 * Create empty retry stats
 */
export function createRetryStats(): RetryStats {
  return {
    totalAttempts: 0,
    successfulAttempts: 0,
    failedAttempts: 0,
    retriedQueries: 0,
    exhaustedRetries: 0,
    errorsByCode: {},
    averageRetriesPerSuccess: 0,
  };
}

/**
 * Update retry stats after an attempt
 */
export function updateRetryStats(
  stats: RetryStats,
  success: boolean,
  errorCode?: string,
  wasRetry: boolean = false
): RetryStats {
  const newStats = { ...stats };

  newStats.totalAttempts++;

  if (success) {
    newStats.successfulAttempts++;
  } else {
    newStats.failedAttempts++;
    if (errorCode) {
      newStats.errorsByCode[errorCode] = (newStats.errorsByCode[errorCode] || 0) + 1;
    }
  }

  if (wasRetry) {
    newStats.retriedQueries++;
    if (!success) {
      newStats.exhaustedRetries++;
    }
  }

  // Update average
  if (newStats.successfulAttempts > 0) {
    newStats.averageRetriesPerSuccess =
      newStats.retriedQueries / newStats.successfulAttempts;
  }

  return newStats;
}
