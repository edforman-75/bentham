import { describe, it, expect } from 'vitest';
import {
  BenthamError,
  Errors,
  isBenthamError,
  toBenthamError,
  ERROR_HTTP_STATUS,
} from '../../errors.js';

describe('BenthamError', () => {
  it('creates error with code and message', () => {
    const error = new BenthamError('INVALID_MANIFEST', 'Invalid manifest format');
    expect(error.code).toBe('INVALID_MANIFEST');
    expect(error.message).toBe('Invalid manifest format');
    expect(error.name).toBe('BenthamError');
  });

  it('sets HTTP status from error code', () => {
    const error = new BenthamError('STUDY_NOT_FOUND', 'Study not found');
    expect(error.httpStatus).toBe(404);
  });

  it('accepts optional properties', () => {
    const cause = new Error('Original error');
    const error = new BenthamError('INTERNAL_ERROR', 'Something went wrong', {
      retryable: true,
      userMessage: 'Please try again',
      details: { key: 'value' },
      cause,
    });

    expect(error.retryable).toBe(true);
    expect(error.userMessage).toBe('Please try again');
    expect(error.details).toEqual({ key: 'value' });
    expect(error.cause).toBe(cause);
  });

  it('defaults retryable to false', () => {
    const error = new BenthamError('INVALID_MANIFEST', 'Invalid');
    expect(error.retryable).toBe(false);
  });

  it('serializes to JSON correctly', () => {
    const error = new BenthamError('RATE_LIMITED', 'Too many requests', {
      retryable: true,
      userMessage: 'Please wait',
      details: { retryAfterMs: 1000 },
    });

    const json = error.toJSON();
    expect(json).toEqual({
      code: 'RATE_LIMITED',
      message: 'Too many requests',
      httpStatus: 429,
      retryable: true,
      userMessage: 'Please wait',
      details: { retryAfterMs: 1000 },
    });
  });

  it('has proper stack trace', () => {
    const error = new BenthamError('INTERNAL_ERROR', 'Test error');
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('BenthamError');
  });
});

describe('Errors factory', () => {
  it('creates invalidManifest error', () => {
    const error = Errors.invalidManifest('Missing queries', { field: 'queries' });
    expect(error.code).toBe('INVALID_MANIFEST');
    expect(error.message).toBe('Missing queries');
    expect(error.details).toEqual({ field: 'queries' });
  });

  it('creates unauthorized error', () => {
    const error = Errors.unauthorized();
    expect(error.code).toBe('UNAUTHORIZED');
    expect(error.userMessage).toBeDefined();
  });

  it('creates studyNotFound error', () => {
    const error = Errors.studyNotFound('study_123');
    expect(error.code).toBe('STUDY_NOT_FOUND');
    expect(error.details?.studyId).toBe('study_123');
    expect(error.userMessage).toBeDefined();
  });

  it('creates rateLimited error', () => {
    const error = Errors.rateLimited(5000);
    expect(error.code).toBe('RATE_LIMITED');
    expect(error.retryable).toBe(true);
    expect(error.details?.retryAfterMs).toBe(5000);
  });

  it('creates surfaceUnavailable error', () => {
    const error = Errors.surfaceUnavailable('chatgpt-web');
    expect(error.code).toBe('SURFACE_UNAVAILABLE');
    expect(error.retryable).toBe(true);
    expect(error.details?.surfaceId).toBe('chatgpt-web');
  });

  it('creates timeout error', () => {
    const error = Errors.timeout('query execution', 30000);
    expect(error.code).toBe('TIMEOUT');
    expect(error.retryable).toBe(true);
    expect(error.details).toEqual({ operation: 'query execution', timeoutMs: 30000 });
  });

  it('creates internalError with cause', () => {
    const cause = new Error('Database connection failed');
    const error = Errors.internalError('Failed to save study', cause);
    expect(error.code).toBe('INTERNAL_ERROR');
    expect(error.cause).toBe(cause);
    expect(error.userMessage).toBeDefined();
  });

  it('creates temporaryFailure error', () => {
    const error = Errors.temporaryFailure('Service temporarily unavailable');
    expect(error.code).toBe('TEMPORARY_FAILURE');
    expect(error.retryable).toBe(true);
  });
});

describe('isBenthamError', () => {
  it('returns true for BenthamError instances', () => {
    const error = new BenthamError('INTERNAL_ERROR', 'Test');
    expect(isBenthamError(error)).toBe(true);
  });

  it('returns false for regular Error instances', () => {
    const error = new Error('Test');
    expect(isBenthamError(error)).toBe(false);
  });

  it('returns false for non-error values', () => {
    expect(isBenthamError('error')).toBe(false);
    expect(isBenthamError(null)).toBe(false);
    expect(isBenthamError(undefined)).toBe(false);
    expect(isBenthamError({ code: 'ERROR' })).toBe(false);
  });
});

describe('toBenthamError', () => {
  it('returns BenthamError unchanged', () => {
    const original = new BenthamError('INTERNAL_ERROR', 'Test');
    const result = toBenthamError(original);
    expect(result).toBe(original);
  });

  it('wraps regular Error in BenthamError', () => {
    const original = new Error('Original message');
    const result = toBenthamError(original);
    expect(result).toBeInstanceOf(BenthamError);
    expect(result.code).toBe('INTERNAL_ERROR');
    expect(result.message).toBe('Original message');
    expect(result.cause).toBe(original);
  });

  it('wraps string in BenthamError', () => {
    const result = toBenthamError('Something went wrong');
    expect(result).toBeInstanceOf(BenthamError);
    expect(result.code).toBe('INTERNAL_ERROR');
    expect(result.message).toBe('Something went wrong');
  });

  it('wraps other values in BenthamError', () => {
    const result = toBenthamError({ unexpected: 'object' });
    expect(result).toBeInstanceOf(BenthamError);
    expect(result.code).toBe('INTERNAL_ERROR');
  });
});

describe('ERROR_HTTP_STATUS', () => {
  it('maps validation errors to 400', () => {
    expect(ERROR_HTTP_STATUS.INVALID_MANIFEST).toBe(400);
    expect(ERROR_HTTP_STATUS.VALIDATION_FAILED).toBe(400);
  });

  it('maps auth errors to 401/403', () => {
    expect(ERROR_HTTP_STATUS.UNAUTHORIZED).toBe(401);
    expect(ERROR_HTTP_STATUS.FORBIDDEN).toBe(403);
  });

  it('maps not found errors to 404', () => {
    expect(ERROR_HTTP_STATUS.STUDY_NOT_FOUND).toBe(404);
    expect(ERROR_HTTP_STATUS.JOB_NOT_FOUND).toBe(404);
  });

  it('maps rate limit errors to 429', () => {
    expect(ERROR_HTTP_STATUS.RATE_LIMITED).toBe(429);
    expect(ERROR_HTTP_STATUS.QUOTA_EXCEEDED).toBe(429);
  });

  it('maps system errors to 500', () => {
    expect(ERROR_HTTP_STATUS.INTERNAL_ERROR).toBe(500);
    expect(ERROR_HTTP_STATUS.DATABASE_ERROR).toBe(500);
  });
});
