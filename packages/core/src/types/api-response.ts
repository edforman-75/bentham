/**
 * API Response Types
 *
 * Standardized response formats for the Bentham API.
 */

/**
 * Base API response structure
 */
export interface ApiResponse<T = unknown> {
  /** Whether the request was successful */
  success: boolean;
  /** Response data (present on success) */
  data?: T;
  /** Error information (present on failure) */
  error?: ApiError;
  /** Request metadata */
  meta?: ApiMeta;
}

/**
 * API error structure
 */
export interface ApiError {
  /** Machine-readable error code */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Detailed validation errors (for validation failures) */
  details?: ValidationErrorDetail[];
  /** Request ID for support/debugging */
  requestId?: string;
}

/**
 * Validation error detail
 */
export interface ValidationErrorDetail {
  /** JSON path to the field with the error (e.g., "queries[0].text") */
  field: string;
  /** Human-readable error message */
  message: string;
  /** The invalid value (if safe to include) */
  value?: unknown;
  /** Constraint that was violated (e.g., "minLength", "required", "enum") */
  constraint?: string;
}

/**
 * API response metadata
 */
export interface ApiMeta {
  /** Request ID */
  requestId?: string;
  /** Response timestamp */
  timestamp: string;
  /** API version */
  version?: string;
}

/**
 * Manifest validation response (specific to manifest submission)
 */
export interface ManifestValidationResponse {
  /** Whether the manifest is valid */
  valid: boolean;
  /** Validation errors (if invalid) */
  errors?: ValidationErrorDetail[];
  /** Warnings (valid but with recommendations) */
  warnings?: ValidationWarning[];
  /** Study metadata (if valid) */
  studyInfo?: {
    /** Total number of cells (queries × surfaces × locations) */
    totalCells: number;
    /** Estimated cost range */
    estimatedCost?: {
      min: number;
      max: number;
      currency: string;
    };
  };
}

/**
 * Validation warning (non-blocking issues)
 */
export interface ValidationWarning {
  /** JSON path to the field */
  field: string;
  /** Warning message */
  message: string;
  /** Recommendation */
  recommendation?: string;
}

/**
 * Create a successful API response
 */
export function createSuccessResponse<T>(
  data: T,
  meta?: Partial<ApiMeta>
): ApiResponse<T> {
  return {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };
}

/**
 * Create an error API response
 */
export function createErrorResponse(
  code: string,
  message: string,
  details?: ValidationErrorDetail[],
  meta?: Partial<ApiMeta>
): ApiResponse<never> {
  return {
    success: false,
    error: {
      code,
      message,
      details,
    },
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };
}

/**
 * Create a manifest validation error response
 */
export function createValidationErrorResponse(
  errors: ValidationErrorDetail[],
  requestId?: string
): ApiResponse<ManifestValidationResponse> {
  return {
    success: false,
    error: {
      code: 'MANIFEST_VALIDATION_FAILED',
      message: `Manifest validation failed with ${errors.length} error${errors.length === 1 ? '' : 's'}`,
      details: errors,
      requestId,
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId,
    },
  };
}
