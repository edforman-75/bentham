/**
 * Tests for Retry Logic
 */

import { describe, it, expect, vi } from 'vitest';
import {
  shouldRetry,
  calculateRetryDelay,
  createRetryState,
  updateRetryState,
  withRetry,
  createRetryStats,
  updateRetryStats,
  DEFAULT_RETRY_CONFIG,
  type RetryConfig,
} from '../../study/retry.js';

describe('Retry Logic', () => {
  describe('shouldRetry', () => {
    it('should return true for retryable errors within limit', () => {
      expect(shouldRetry('RATE_LIMITED', 0)).toBe(true);
      expect(shouldRetry('NETWORK_ERROR', 1)).toBe(true);
      expect(shouldRetry('TIMEOUT', 2)).toBe(true);
    });

    it('should return false when max retries exceeded', () => {
      expect(shouldRetry('RATE_LIMITED', 3)).toBe(false); // Default max is 3
      expect(shouldRetry('NETWORK_ERROR', 5)).toBe(false);
    });

    it('should return false for non-retryable errors', () => {
      expect(shouldRetry('AUTH_FAILED', 0)).toBe(false);
      expect(shouldRetry('QUOTA_EXCEEDED', 0)).toBe(false);
      expect(shouldRetry('INVALID_REQUEST', 0)).toBe(false);
      expect(shouldRetry('CONTENT_BLOCKED', 0)).toBe(false);
    });

    it('should respect retry conditions config', () => {
      const config: RetryConfig = {
        ...DEFAULT_RETRY_CONFIG,
        retryConditions: {
          ...DEFAULT_RETRY_CONFIG.retryConditions,
          onRateLimited: false,
        },
      };

      expect(shouldRetry('RATE_LIMITED', 0, config)).toBe(false);
      expect(shouldRetry('NETWORK_ERROR', 0, config)).toBe(true);
    });

    it('should not retry CAPTCHA by default', () => {
      expect(shouldRetry('CAPTCHA_REQUIRED', 0)).toBe(false);
    });

    it('should retry CAPTCHA if configured', () => {
      const config: RetryConfig = {
        ...DEFAULT_RETRY_CONFIG,
        retryConditions: {
          ...DEFAULT_RETRY_CONFIG.retryConditions,
          onCaptchaRequired: true,
        },
      };

      expect(shouldRetry('CAPTCHA_REQUIRED', 0, config)).toBe(true);
    });
  });

  describe('calculateRetryDelay', () => {
    it('should return fixed delay for fixed strategy', () => {
      const config: RetryConfig = {
        ...DEFAULT_RETRY_CONFIG,
        backoffStrategy: 'fixed',
        initialDelayMs: 1000,
        jitter: false,
      };

      expect(calculateRetryDelay(0, config)).toBe(1000);
      expect(calculateRetryDelay(1, config)).toBe(1000);
      expect(calculateRetryDelay(2, config)).toBe(1000);
    });

    it('should return linear delay for linear strategy', () => {
      const config: RetryConfig = {
        ...DEFAULT_RETRY_CONFIG,
        backoffStrategy: 'linear',
        initialDelayMs: 1000,
        jitter: false,
      };

      expect(calculateRetryDelay(0, config)).toBe(1000);
      expect(calculateRetryDelay(1, config)).toBe(2000);
      expect(calculateRetryDelay(2, config)).toBe(3000);
    });

    it('should return exponential delay for exponential strategy', () => {
      const config: RetryConfig = {
        ...DEFAULT_RETRY_CONFIG,
        backoffStrategy: 'exponential',
        initialDelayMs: 1000,
        backoffMultiplier: 2,
        jitter: false,
      };

      expect(calculateRetryDelay(0, config)).toBe(1000);
      expect(calculateRetryDelay(1, config)).toBe(2000);
      expect(calculateRetryDelay(2, config)).toBe(4000);
    });

    it('should cap delay at maxDelayMs', () => {
      const config: RetryConfig = {
        ...DEFAULT_RETRY_CONFIG,
        backoffStrategy: 'exponential',
        initialDelayMs: 1000,
        maxDelayMs: 5000,
        backoffMultiplier: 2,
        jitter: false,
      };

      expect(calculateRetryDelay(5, config)).toBe(5000); // Would be 32000 without cap
    });

    it('should add jitter when enabled', () => {
      const config: RetryConfig = {
        ...DEFAULT_RETRY_CONFIG,
        backoffStrategy: 'fixed',
        initialDelayMs: 1000,
        jitter: true,
      };

      const delays = Array.from({ length: 10 }, () => calculateRetryDelay(0, config));
      const uniqueDelays = new Set(delays);

      // With jitter, we should get varying delays
      expect(uniqueDelays.size).toBeGreaterThan(1);

      // All delays should be within ±20% of base
      delays.forEach(delay => {
        expect(delay).toBeGreaterThanOrEqual(800);
        expect(delay).toBeLessThanOrEqual(1200);
      });
    });
  });

  describe('RetryState', () => {
    it('should create initial state', () => {
      const state = createRetryState();

      expect(state.attempt).toBe(0);
      expect(state.exhausted).toBe(false);
      expect(state.lastError).toBeUndefined();
    });

    it('should update state after failure', () => {
      const state = createRetryState();
      const updated = updateRetryState(state, 'RATE_LIMITED', 'Too many requests');

      expect(updated.attempt).toBe(1);
      expect(updated.lastError).toBe('Too many requests');
      expect(updated.lastErrorCode).toBe('RATE_LIMITED');
      expect(updated.exhausted).toBe(false);
      expect(updated.nextRetryTime).toBeDefined();
    });

    it('should mark as exhausted when retries depleted', () => {
      let state = createRetryState();

      // Exhaust all retries
      for (let i = 0; i < DEFAULT_RETRY_CONFIG.maxRetries + 1; i++) {
        state = updateRetryState(state, 'RATE_LIMITED', 'Error');
      }

      expect(state.exhausted).toBe(true);
      expect(state.nextRetryTime).toBeUndefined();
    });

    it('should mark as exhausted for non-retryable errors', () => {
      const state = createRetryState();
      const updated = updateRetryState(state, 'AUTH_FAILED', 'Invalid credentials');

      expect(updated.exhausted).toBe(true);
      expect(updated.nextRetryTime).toBeUndefined();
    });
  });

  describe('withRetry', () => {
    it('should return result on first success', async () => {
      const fn = vi.fn().mockResolvedValue('success');

      const result = await withRetry(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and succeed', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('NETWORK_ERROR: Connection failed'))
        .mockResolvedValueOnce('success');

      const result = await withRetry(fn, { initialDelayMs: 10 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should exhaust retries and throw', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('NETWORK_ERROR: Always fails'));

      await expect(withRetry(fn, { maxRetries: 2, initialDelayMs: 10 }))
        .rejects.toThrow('NETWORK_ERROR: Always fails');

      expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should not retry non-retryable errors', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('AUTH_FAILED: Bad credentials'));

      await expect(withRetry(fn, { initialDelayMs: 10 }))
        .rejects.toThrow('AUTH_FAILED: Bad credentials');

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should call onRetry callback', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('TIMEOUT: Timed out'))
        .mockResolvedValueOnce('success');

      const onRetry = vi.fn();

      await withRetry(fn, { initialDelayMs: 10 }, onRetry);

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(
        1,
        expect.any(Number),
        expect.any(Error)
      );
    });
  });

  describe('RetryStats', () => {
    it('should create empty stats', () => {
      const stats = createRetryStats();

      expect(stats.totalAttempts).toBe(0);
      expect(stats.successfulAttempts).toBe(0);
      expect(stats.failedAttempts).toBe(0);
      expect(stats.retriedQueries).toBe(0);
      expect(stats.averageRetriesPerSuccess).toBe(0);
    });

    it('should update stats on success', () => {
      let stats = createRetryStats();
      stats = updateRetryStats(stats, true);

      expect(stats.totalAttempts).toBe(1);
      expect(stats.successfulAttempts).toBe(1);
      expect(stats.failedAttempts).toBe(0);
    });

    it('should update stats on failure', () => {
      let stats = createRetryStats();
      stats = updateRetryStats(stats, false, 'RATE_LIMITED');

      expect(stats.totalAttempts).toBe(1);
      expect(stats.successfulAttempts).toBe(0);
      expect(stats.failedAttempts).toBe(1);
      expect(stats.errorsByCode['RATE_LIMITED']).toBe(1);
    });

    it('should track retried queries', () => {
      let stats = createRetryStats();

      // First attempt fails
      stats = updateRetryStats(stats, false, 'TIMEOUT');
      // Retry succeeds
      stats = updateRetryStats(stats, true, undefined, true);

      expect(stats.retriedQueries).toBe(1);
      expect(stats.averageRetriesPerSuccess).toBe(1);
    });

    it('should track exhausted retries', () => {
      let stats = createRetryStats();

      // Multiple failures without success
      stats = updateRetryStats(stats, false, 'TIMEOUT', true);
      stats = updateRetryStats(stats, false, 'TIMEOUT', true);

      expect(stats.exhaustedRetries).toBe(2);
    });
  });
});
