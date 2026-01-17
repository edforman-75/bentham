/**
 * Error handling utilities
 */

import type { BenthamError, ErrorCode } from '../errors.js';

/**
 * Error codes that indicate a retryable error
 */
const RETRYABLE_ERROR_CODES: ErrorCode[] = [
  'RATE_LIMITED',
  'TIMEOUT',
  'SESSION_INVALID',
  'PROXY_ERROR',
  'CAPTCHA_REQUIRED',
  'TEMPORARY_FAILURE',
  'SURFACE_UNAVAILABLE',
];

/**
 * Check if an error is retryable
 * @param error - The error to check
 * @returns Whether the error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof Error && 'code' in error) {
    const benthamError = error as BenthamError;
    return RETRYABLE_ERROR_CODES.includes(benthamError.code);
  }
  return false;
}

/**
 * Format an error for logging or display
 * @param error - The error to format
 * @returns A formatted error string
 */
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    if ('code' in error) {
      const benthamError = error as BenthamError;
      return `[${benthamError.code}] ${benthamError.message}`;
    }
    return `[${error.name}] ${error.message}`;
  }

  if (typeof error === 'string') {
    return error;
  }

  return String(error);
}

/**
 * Format an error with full details for debugging
 * @param error - The error to format
 * @returns A detailed error object
 */
export function formatErrorDetails(error: unknown): {
  message: string;
  code?: string;
  stack?: string;
  details?: Record<string, unknown>;
} {
  if (error instanceof Error) {
    const result: {
      message: string;
      code?: string;
      stack?: string;
      details?: Record<string, unknown>;
    } = {
      message: error.message,
      stack: error.stack,
    };

    if ('code' in error) {
      result.code = (error as BenthamError).code;
    }

    if ('details' in error) {
      result.details = (error as BenthamError).details;
    }

    return result;
  }

  return {
    message: String(error),
  };
}

/**
 * Extract a user-friendly message from an error
 * @param error - The error
 * @returns A user-friendly message
 */
export function getUserFriendlyMessage(error: unknown): string {
  if (error instanceof Error && 'code' in error) {
    const benthamError = error as BenthamError;
    return benthamError.userMessage || benthamError.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'An unexpected error occurred';
}

/**
 * Wrap an async function to catch and transform errors
 * @param fn - The async function to wrap
 * @param errorTransform - Optional transform for caught errors
 * @returns The wrapped function
 */
export function wrapAsync<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  errorTransform?: (error: unknown) => Error
): T {
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    try {
      return (await fn(...args)) as ReturnType<T>;
    } catch (error) {
      if (errorTransform) {
        throw errorTransform(error);
      }
      throw error;
    }
  }) as T;
}
