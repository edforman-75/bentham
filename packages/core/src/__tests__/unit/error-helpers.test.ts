import { describe, it, expect } from 'vitest';
import {
  isRetryableError,
  formatError,
  formatErrorDetails,
  getUserFriendlyMessage,
} from '../../utils/error-helpers.js';
import { BenthamError, Errors } from '../../errors.js';

describe('isRetryableError', () => {
  it('returns true for retryable error codes', () => {
    const rateLimited = Errors.rateLimited();
    const timeout = Errors.timeout('operation', 1000);
    const sessionInvalid = Errors.sessionInvalid('session_123');
    const proxyError = Errors.proxyError('Proxy connection failed');
    const captchaRequired = Errors.captchaRequired('chatgpt-web');
    const temporaryFailure = Errors.temporaryFailure('Service unavailable');
    const surfaceUnavailable = Errors.surfaceUnavailable('gemini');

    expect(isRetryableError(rateLimited)).toBe(true);
    expect(isRetryableError(timeout)).toBe(true);
    expect(isRetryableError(sessionInvalid)).toBe(true);
    expect(isRetryableError(proxyError)).toBe(true);
    expect(isRetryableError(captchaRequired)).toBe(true);
    expect(isRetryableError(temporaryFailure)).toBe(true);
    expect(isRetryableError(surfaceUnavailable)).toBe(true);
  });

  it('returns false for non-retryable error codes', () => {
    const invalidManifest = Errors.invalidManifest('Bad format');
    const unauthorized = Errors.unauthorized();
    const studyNotFound = Errors.studyNotFound('study_123');
    const internalError = Errors.internalError('Something broke');

    expect(isRetryableError(invalidManifest)).toBe(false);
    expect(isRetryableError(unauthorized)).toBe(false);
    expect(isRetryableError(studyNotFound)).toBe(false);
    expect(isRetryableError(internalError)).toBe(false);
  });

  it('returns false for regular errors', () => {
    const error = new Error('Regular error');
    expect(isRetryableError(error)).toBe(false);
  });

  it('returns false for non-error values', () => {
    expect(isRetryableError('error')).toBe(false);
    expect(isRetryableError(null)).toBe(false);
    expect(isRetryableError(undefined)).toBe(false);
  });
});

describe('formatError', () => {
  it('formats BenthamError with code', () => {
    const error = new BenthamError('INVALID_MANIFEST', 'Bad manifest format');
    const formatted = formatError(error);
    expect(formatted).toBe('[INVALID_MANIFEST] Bad manifest format');
  });

  it('formats regular Error with name', () => {
    const error = new TypeError('Not a function');
    const formatted = formatError(error);
    expect(formatted).toBe('[TypeError] Not a function');
  });

  it('returns string errors as-is', () => {
    const formatted = formatError('Something went wrong');
    expect(formatted).toBe('Something went wrong');
  });

  it('converts other values to string', () => {
    const formatted = formatError({ code: 'ERROR' });
    expect(formatted).toBe('[object Object]');
  });
});

describe('formatErrorDetails', () => {
  it('includes all BenthamError properties', () => {
    const error = new BenthamError('RATE_LIMITED', 'Too many requests', {
      details: { retryAfterMs: 5000 },
    });

    const details = formatErrorDetails(error);
    expect(details.message).toBe('Too many requests');
    expect(details.code).toBe('RATE_LIMITED');
    expect(details.details).toEqual({ retryAfterMs: 5000 });
    expect(details.stack).toBeDefined();
  });

  it('includes stack trace for regular errors', () => {
    const error = new Error('Test error');
    const details = formatErrorDetails(error);
    expect(details.message).toBe('Test error');
    expect(details.stack).toBeDefined();
  });

  it('handles non-error values', () => {
    const details = formatErrorDetails('string error');
    expect(details.message).toBe('string error');
    expect(details.stack).toBeUndefined();
  });
});

describe('getUserFriendlyMessage', () => {
  it('returns userMessage from BenthamError', () => {
    const error = new BenthamError('UNAUTHORIZED', 'Missing auth token', {
      userMessage: 'Please log in to continue',
    });
    const message = getUserFriendlyMessage(error);
    expect(message).toBe('Please log in to continue');
  });

  it('falls back to message when no userMessage', () => {
    const error = new BenthamError('INTERNAL_ERROR', 'Database connection failed');
    const message = getUserFriendlyMessage(error);
    expect(message).toBe('Database connection failed');
  });

  it('returns message from regular errors', () => {
    const error = new Error('Something went wrong');
    const message = getUserFriendlyMessage(error);
    expect(message).toBe('Something went wrong');
  });

  it('returns generic message for non-errors', () => {
    const message = getUserFriendlyMessage(null);
    expect(message).toBe('An unexpected error occurred');
  });
});
