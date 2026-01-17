/**
 * Error codes and custom error classes for Bentham
 */

/**
 * All error codes used in the Bentham system
 */
export type ErrorCode =
  // Validation errors (400)
  | 'INVALID_MANIFEST'
  | 'INVALID_QUERY'
  | 'INVALID_SURFACE'
  | 'INVALID_LOCATION'
  | 'INVALID_CREDENTIALS'
  | 'VALIDATION_FAILED'
  | 'SCHEMA_ERROR'

  // Authentication/Authorization errors (401/403)
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INVALID_API_KEY'
  | 'EXPIRED_API_KEY'
  | 'INSUFFICIENT_PERMISSIONS'

  // Resource errors (404)
  | 'STUDY_NOT_FOUND'
  | 'JOB_NOT_FOUND'
  | 'TENANT_NOT_FOUND'
  | 'ACCOUNT_NOT_FOUND'
  | 'SESSION_NOT_FOUND'
  | 'RESOURCE_NOT_FOUND'

  // Conflict errors (409)
  | 'STUDY_ALREADY_EXISTS'
  | 'STUDY_ALREADY_COMPLETE'
  | 'STUDY_CANCELLED'
  | 'DUPLICATE_REQUEST'

  // Rate limiting errors (429)
  | 'RATE_LIMITED'
  | 'QUOTA_EXCEEDED'
  | 'BUDGET_EXCEEDED'
  | 'CONCURRENT_LIMIT_EXCEEDED'

  // Surface execution errors
  | 'SURFACE_UNAVAILABLE'
  | 'SURFACE_ERROR'
  | 'SURFACE_TIMEOUT'
  | 'CAPTCHA_REQUIRED'
  | 'CAPTCHA_FAILED'
  | 'LOGIN_REQUIRED'
  | 'ACCOUNT_BLOCKED'
  | 'CONTENT_BLOCKED'
  | 'GEO_RESTRICTED'

  // Session/Proxy errors
  | 'SESSION_INVALID'
  | 'SESSION_EXPIRED'
  | 'PROXY_ERROR'
  | 'PROXY_UNAVAILABLE'
  | 'PROXY_BLOCKED'
  | 'LOCATION_UNAVAILABLE'

  // Execution errors
  | 'EXECUTION_FAILED'
  | 'TIMEOUT'
  | 'MAX_RETRIES_EXCEEDED'
  | 'CHECKPOINT_FAILED'
  | 'EVIDENCE_CAPTURE_FAILED'

  // System errors (500)
  | 'INTERNAL_ERROR'
  | 'DATABASE_ERROR'
  | 'QUEUE_ERROR'
  | 'STORAGE_ERROR'
  | 'EXTERNAL_SERVICE_ERROR'
  | 'TEMPORARY_FAILURE'
  | 'CONFIGURATION_ERROR';

/**
 * Error code to HTTP status code mapping
 */
export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  // 400 Bad Request
  INVALID_MANIFEST: 400,
  INVALID_QUERY: 400,
  INVALID_SURFACE: 400,
  INVALID_LOCATION: 400,
  INVALID_CREDENTIALS: 400,
  VALIDATION_FAILED: 400,
  SCHEMA_ERROR: 400,

  // 401 Unauthorized
  UNAUTHORIZED: 401,
  INVALID_API_KEY: 401,
  EXPIRED_API_KEY: 401,

  // 403 Forbidden
  FORBIDDEN: 403,
  INSUFFICIENT_PERMISSIONS: 403,

  // 404 Not Found
  STUDY_NOT_FOUND: 404,
  JOB_NOT_FOUND: 404,
  TENANT_NOT_FOUND: 404,
  ACCOUNT_NOT_FOUND: 404,
  SESSION_NOT_FOUND: 404,
  RESOURCE_NOT_FOUND: 404,

  // 409 Conflict
  STUDY_ALREADY_EXISTS: 409,
  STUDY_ALREADY_COMPLETE: 409,
  STUDY_CANCELLED: 409,
  DUPLICATE_REQUEST: 409,

  // 429 Too Many Requests
  RATE_LIMITED: 429,
  QUOTA_EXCEEDED: 429,
  BUDGET_EXCEEDED: 429,
  CONCURRENT_LIMIT_EXCEEDED: 429,

  // 502 Bad Gateway (external service issues)
  SURFACE_UNAVAILABLE: 502,
  SURFACE_ERROR: 502,
  SURFACE_TIMEOUT: 504,
  CAPTCHA_REQUIRED: 502,
  CAPTCHA_FAILED: 502,
  LOGIN_REQUIRED: 502,
  ACCOUNT_BLOCKED: 502,
  CONTENT_BLOCKED: 502,
  GEO_RESTRICTED: 502,

  // 503 Service Unavailable
  SESSION_INVALID: 503,
  SESSION_EXPIRED: 503,
  PROXY_ERROR: 503,
  PROXY_UNAVAILABLE: 503,
  PROXY_BLOCKED: 503,
  LOCATION_UNAVAILABLE: 503,

  // 500 Internal Server Error
  EXECUTION_FAILED: 500,
  TIMEOUT: 504,
  MAX_RETRIES_EXCEEDED: 500,
  CHECKPOINT_FAILED: 500,
  EVIDENCE_CAPTURE_FAILED: 500,
  INTERNAL_ERROR: 500,
  DATABASE_ERROR: 500,
  QUEUE_ERROR: 500,
  STORAGE_ERROR: 500,
  EXTERNAL_SERVICE_ERROR: 500,
  TEMPORARY_FAILURE: 503,
  CONFIGURATION_ERROR: 500,
};

/**
 * Custom error class for Bentham errors
 */
export class BenthamError extends Error {
  /** Error code */
  readonly code: ErrorCode;

  /** HTTP status code */
  readonly httpStatus: number;

  /** Whether this error is retryable */
  readonly retryable: boolean;

  /** User-friendly message (safe to show to end users) */
  readonly userMessage?: string;

  /** Additional error details */
  readonly details?: Record<string, unknown>;

  /** Original error that caused this error */
  readonly cause?: Error;

  constructor(
    code: ErrorCode,
    message: string,
    options?: {
      retryable?: boolean;
      userMessage?: string;
      details?: Record<string, unknown>;
      cause?: Error;
    }
  ) {
    super(message);
    this.name = 'BenthamError';
    this.code = code;
    this.httpStatus = ERROR_HTTP_STATUS[code];
    this.retryable = options?.retryable ?? false;
    this.userMessage = options?.userMessage;
    this.details = options?.details;
    this.cause = options?.cause;

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, BenthamError);
    }
  }

  /**
   * Create a JSON representation of the error
   */
  toJSON(): {
    code: ErrorCode;
    message: string;
    httpStatus: number;
    retryable: boolean;
    userMessage?: string;
    details?: Record<string, unknown>;
  } {
    return {
      code: this.code,
      message: this.message,
      httpStatus: this.httpStatus,
      retryable: this.retryable,
      userMessage: this.userMessage,
      details: this.details,
    };
  }
}

/**
 * Error factory functions for common error types
 */
export const Errors = {
  // Validation errors
  invalidManifest: (message: string, details?: Record<string, unknown>) =>
    new BenthamError('INVALID_MANIFEST', message, { details }),

  validationFailed: (message: string, details?: Record<string, unknown>) =>
    new BenthamError('VALIDATION_FAILED', message, { details }),

  // Auth errors
  unauthorized: (message = 'Authentication required') =>
    new BenthamError('UNAUTHORIZED', message, {
      userMessage: 'Please provide valid credentials',
    }),

  forbidden: (message = 'Access denied') =>
    new BenthamError('FORBIDDEN', message, {
      userMessage: 'You do not have permission to perform this action',
    }),

  // Resource errors
  studyNotFound: (studyId: string) =>
    new BenthamError('STUDY_NOT_FOUND', `Study not found: ${studyId}`, {
      details: { studyId },
      userMessage: 'The requested study was not found',
    }),

  jobNotFound: (jobId: string) =>
    new BenthamError('JOB_NOT_FOUND', `Job not found: ${jobId}`, {
      details: { jobId },
    }),

  // Rate limiting
  rateLimited: (retryAfterMs?: number) =>
    new BenthamError('RATE_LIMITED', 'Rate limit exceeded', {
      retryable: true,
      details: retryAfterMs ? { retryAfterMs } : undefined,
      userMessage: 'Too many requests. Please try again later.',
    }),

  quotaExceeded: (message: string) =>
    new BenthamError('QUOTA_EXCEEDED', message, {
      userMessage: 'Your quota has been exceeded. Please contact support.',
    }),

  // Surface errors
  surfaceUnavailable: (surfaceId: string) =>
    new BenthamError('SURFACE_UNAVAILABLE', `Surface unavailable: ${surfaceId}`, {
      retryable: true,
      details: { surfaceId },
    }),

  captchaRequired: (surfaceId: string) =>
    new BenthamError('CAPTCHA_REQUIRED', `CAPTCHA required on ${surfaceId}`, {
      retryable: true,
      details: { surfaceId },
    }),

  // Session/Proxy errors
  sessionInvalid: (sessionId: string) =>
    new BenthamError('SESSION_INVALID', `Session invalid: ${sessionId}`, {
      retryable: true,
      details: { sessionId },
    }),

  proxyError: (message: string, providerId?: string) =>
    new BenthamError('PROXY_ERROR', message, {
      retryable: true,
      details: providerId ? { providerId } : undefined,
    }),

  // Execution errors
  timeout: (operation: string, timeoutMs: number) =>
    new BenthamError('TIMEOUT', `Operation timed out: ${operation}`, {
      retryable: true,
      details: { operation, timeoutMs },
    }),

  maxRetriesExceeded: (jobId: string, attempts: number) =>
    new BenthamError('MAX_RETRIES_EXCEEDED', `Max retries exceeded for job: ${jobId}`, {
      details: { jobId, attempts },
    }),

  // System errors
  internalError: (message: string, cause?: Error) =>
    new BenthamError('INTERNAL_ERROR', message, {
      cause,
      userMessage: 'An unexpected error occurred. Please try again.',
    }),

  databaseError: (message: string, cause?: Error) =>
    new BenthamError('DATABASE_ERROR', message, {
      cause,
      retryable: true,
    }),

  temporaryFailure: (message: string) =>
    new BenthamError('TEMPORARY_FAILURE', message, {
      retryable: true,
      userMessage: 'A temporary error occurred. Please try again.',
    }),
};

/**
 * Type guard to check if an error is a BenthamError
 */
export function isBenthamError(error: unknown): error is BenthamError {
  return error instanceof BenthamError;
}

/**
 * Convert any error to a BenthamError
 */
export function toBenthamError(error: unknown): BenthamError {
  if (error instanceof BenthamError) {
    return error;
  }

  if (error instanceof Error) {
    return new BenthamError('INTERNAL_ERROR', error.message, {
      cause: error,
    });
  }

  return new BenthamError('INTERNAL_ERROR', String(error));
}
