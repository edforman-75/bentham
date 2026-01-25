/**
 * Manifest validation schemas using Zod
 *
 * These schemas validate incoming manifests at the API gateway level.
 * More comprehensive validation (e.g., business rules, quotas) is handled
 * by the Validator module.
 */

import { z } from 'zod';
import { LOCATIONS, type LocationId } from '../types/location.js';
import { SURFACES, type SurfaceId } from '../types/surface.js';
import { MANIFEST_VERSION } from '../constants.js';
import type { ValidationErrorDetail, ManifestValidationResponse, ApiResponse } from '../types/api-response.js';
import { createValidationErrorResponse, createSuccessResponse } from '../types/api-response.js';
import { estimateStudyCost } from '../config/surface-defaults.js';

/**
 * Query schema
 */
export const QuerySchema = z.object({
  text: z.string().min(1, 'Query text is required').max(10000, 'Query text too long'),
  context: z.string().max(5000).optional(),
  category: z.string().max(100).optional(),
  tags: z.array(z.string().max(50)).max(20).optional(),
});

/**
 * Surface options schema with model selection and capture settings
 */
export const SurfaceOptionsSchema = z.object({
  /** Model override (uses surface default if not specified) */
  model: z.string().optional(),
  /** Capture screenshot of each query result */
  captureScreenshots: z.boolean().optional().default(false),
  /** Extract and capture images from responses */
  captureImages: z.boolean().optional().default(false),
  /** Capture full HTML content */
  captureHtml: z.boolean().optional().default(false),
  /** Other surface-specific options */
}).passthrough();

/**
 * Surface configuration schema
 */
export const SurfaceConfigSchema = z.object({
  id: z.string().refine(
    (id): id is SurfaceId => id in SURFACES,
    { message: 'Invalid surface ID' }
  ),
  required: z.boolean().default(true),
  options: SurfaceOptionsSchema.optional(),
});

/**
 * Supported proxy providers
 */
export const PROXY_PROVIDERS = ['auto', 'brightdata', 'oxylabs', 'smartproxy', 'iproyal', '2captcha'] as const;
export type ProxyProviderId = typeof PROXY_PROVIDERS[number];

/**
 * Location configuration schema
 */
export const LocationConfigSchema = z.object({
  id: z.string().refine(
    (id): id is LocationId => id in LOCATIONS,
    { message: 'Invalid location ID' }
  ),
  name: z.string().optional(),
  country: z.string().length(2).optional(),
  region: z.string().optional(),
  city: z.string().optional(),
  proxyType: z.enum(['residential', 'datacenter', 'mobile']).default('residential'),
  requireSticky: z.boolean().default(false),
  /** Proxy provider to use for this location. Defaults to 'auto' (best available). */
  proxyProvider: z.enum(PROXY_PROVIDERS).default('auto'),
  /** Session duration in minutes for rotating proxies (0-120). Provider-specific. */
  sessionDuration: z.number().int().min(0).max(120).optional(),
});

/**
 * Retry backoff strategy types
 */
export const RetryBackoffStrategy = z.enum(['fixed', 'linear', 'exponential']);
export type RetryBackoffStrategyType = z.infer<typeof RetryBackoffStrategy>;

/**
 * Retry conditions - which error types to retry
 */
export const RetryConditionSchema = z.object({
  /** Retry on rate limiting (default: true) */
  onRateLimited: z.boolean().default(true),
  /** Retry on network errors (default: true) */
  onNetworkError: z.boolean().default(true),
  /** Retry on service unavailable (default: true) */
  onServiceUnavailable: z.boolean().default(true),
  /** Retry on timeout (default: true) */
  onTimeout: z.boolean().default(true),
  /** Retry on invalid response (default: true) */
  onInvalidResponse: z.boolean().default(true),
  /** Retry on CAPTCHA required (default: false - usually requires manual intervention) */
  onCaptchaRequired: z.boolean().default(false),
  /** Retry on session expired (default: true) */
  onSessionExpired: z.boolean().default(true),
});

/**
 * Retry configuration schema
 */
export const RetryConfigSchema = z.object({
  /** Maximum retries per cell (default: 3) */
  maxRetries: z.number().int().min(0).max(10).default(3),
  /** Backoff strategy (default: exponential) */
  backoffStrategy: RetryBackoffStrategy.default('exponential'),
  /** Initial delay in ms (default: 1000) */
  initialDelayMs: z.number().int().min(100).max(60000).default(1000),
  /** Maximum delay in ms (default: 60000) */
  maxDelayMs: z.number().int().min(1000).max(300000).default(60000),
  /** Multiplier for exponential backoff (default: 2) */
  backoffMultiplier: z.number().min(1).max(5).default(2),
  /** Add jitter to prevent thundering herd (default: true) */
  jitter: z.boolean().default(true),
  /** Conditions that trigger retry */
  retryConditions: RetryConditionSchema.default({}),
});

/**
 * Checkpoint/resume configuration schema
 */
export const CheckpointConfigSchema = z.object({
  /** Enable checkpointing for resume capability (default: true) */
  enabled: z.boolean().default(true),
  /** Save checkpoint every N completed cells (default: 10) */
  saveIntervalCells: z.number().int().min(1).max(1000).default(10),
  /** Save checkpoint every N seconds (default: 30) */
  saveIntervalSeconds: z.number().int().min(5).max(300).default(30),
  /** Keep checkpoint after study completion (default: false) */
  preserveCheckpoint: z.boolean().default(false),
});

/**
 * Timeout configuration schema
 */
export const TimeoutConfigSchema = z.object({
  /** Per-query timeout in ms (default: 30000) */
  queryTimeoutMs: z.number().int().min(5000).max(300000).default(30000),
  /** Per-surface timeout in ms - total time for all queries to a surface (default: none) */
  surfaceTimeoutMs: z.number().int().min(30000).max(3600000).optional(),
  /** Overall study timeout in ms (default: use deadline) */
  studyTimeoutMs: z.number().int().min(60000).optional(),
  /** Connection timeout in ms (default: 10000) */
  connectionTimeoutMs: z.number().int().min(1000).max(60000).default(10000),
});

/**
 * Completion criteria schema
 */
export const CompletionCriteriaSchema = z.object({
  requiredSurfaces: z.object({
    surfaceIds: z.array(z.string()).min(1, 'At least one required surface'),
    coverageThreshold: z.number().min(0).max(1).default(0.95),
  }),
  optionalSurfaces: z.object({
    surfaceIds: z.array(z.string()),
  }).optional(),
  /** @deprecated Use retry.maxRetries instead */
  maxRetriesPerCell: z.number().int().min(1).max(10).default(3),
  /** Minimum success rate to consider study successful (default: 0.8) */
  minSuccessRate: z.number().min(0).max(1).default(0.8),
  /** Fail fast if critical surface fails N times consecutively (default: 5) */
  consecutiveFailureLimit: z.number().int().min(1).max(20).default(5),
});

/**
 * Execution configuration schema - controls how the study runs
 */
export const ExecutionConfigSchema = z.object({
  /** Retry configuration */
  retry: RetryConfigSchema.default({}),
  /** Checkpoint/resume configuration */
  checkpoint: CheckpointConfigSchema.default({}),
  /** Timeout configuration */
  timeouts: TimeoutConfigSchema.default({}),
  /** Concurrency limit per surface (default: 1) */
  concurrencyPerSurface: z.number().int().min(1).max(10).default(1),
  /** Overall concurrency limit (default: 8) */
  maxConcurrency: z.number().int().min(1).max(50).default(8),
  /** Delay between queries in ms (min, max) for rate limiting */
  queryDelayMs: z.tuple([z.number().int().min(0), z.number().int().min(0)]).default([500, 2000]),
  /** Shuffle query order to avoid patterns (default: true) */
  shuffleQueries: z.boolean().default(true),
  /** Priority order: 'round-robin' or 'surface-first' (default: round-robin) */
  executionOrder: z.enum(['round-robin', 'surface-first', 'location-first']).default('round-robin'),
});

/**
 * Quality gates schema
 */
export const QualityGatesSchema = z.object({
  minResponseLength: z.number().int().min(0).optional(),
  requireActualContent: z.boolean().default(true),
});

/**
 * Full manifest schema
 */
export const ManifestSchema = z.object({
  // Version
  version: z.string().default(MANIFEST_VERSION),

  // Study definition
  name: z.string().min(1, 'Study name is required').max(200),
  description: z.string().max(2000).optional(),

  // The matrix
  queries: z.array(QuerySchema).min(1, 'At least one query required').max(1000),
  surfaces: z.array(SurfaceConfigSchema).min(1, 'At least one surface required').max(20),
  locations: z.array(LocationConfigSchema).min(1, 'At least one location required').max(50),

  // Completion criteria
  completionCriteria: CompletionCriteriaSchema,

  // Execution configuration (retry, timeouts, checkpointing)
  execution: ExecutionConfigSchema.default({}),

  // Quality gates
  qualityGates: QualityGatesSchema.default({ requireActualContent: true }),

  // Evidence
  evidenceLevel: z.enum(['full', 'metadata', 'none']).default('metadata'),
  legalHold: z.boolean().default(false),

  // Timing
  deadline: z.coerce.date().refine(
    (date) => date > new Date(),
    { message: 'Deadline must be in the future' }
  ),

  // Data retention
  retentionDays: z.number().int().min(1).max(2555).optional(), // Max ~7 years
  preserveForever: z.boolean().optional(),

  // Session isolation
  sessionIsolation: z.enum(['shared', 'dedicated_per_study']).default('shared'),
}).refine(
  (manifest) => {
    // Ensure required surface IDs are in the surfaces list
    const surfaceIdSet = new Set<string>(manifest.surfaces.map(s => s.id));
    const requiredIds = manifest.completionCriteria.requiredSurfaces.surfaceIds;
    return requiredIds.every(id => surfaceIdSet.has(id));
  },
  { message: 'Required surface IDs must be included in surfaces list' }
).refine(
  (manifest) => {
    // Ensure optional surface IDs (if any) are in the surfaces list
    const surfaceIdSet = new Set<string>(manifest.surfaces.map(s => s.id));
    const optionalIds = manifest.completionCriteria.optionalSurfaces?.surfaceIds ?? [];
    return optionalIds.every(id => surfaceIdSet.has(id));
  },
  { message: 'Optional surface IDs must be included in surfaces list' }
).refine(
  (manifest) => {
    // If preserveForever is false and legalHold is true, must set retentionDays
    if (manifest.legalHold && !manifest.preserveForever && !manifest.retentionDays) {
      return false;
    }
    return true;
  },
  { message: 'Legal hold studies must specify retentionDays or preserveForever' }
);

/**
 * Type for a validated manifest
 */
export type ValidatedManifest = z.infer<typeof ManifestSchema>;

/**
 * Validate a manifest and return result
 */
export function validateManifest(data: unknown): {
  success: boolean;
  data?: ValidatedManifest;
  errors?: Array<{ path: (string | number)[]; message: string }>;
} {
  const result = ManifestSchema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    errors: result.error.errors.map(e => ({
      path: e.path,
      message: e.message,
    })),
  };
}

/**
 * Calculate the total cell count for a manifest
 */
export function calculateCellCount(manifest: ValidatedManifest): number {
  return manifest.queries.length * manifest.surfaces.length * manifest.locations.length;
}

/**
 * Estimate the duration of a study based on cell count
 */
export function estimateDuration(manifest: ValidatedManifest): {
  minMinutes: number;
  maxMinutes: number;
  averageMinutes: number;
} {
  const cellCount = calculateCellCount(manifest);

  // Assume 1-3 seconds per cell on average, with concurrency
  const concurrency = 8; // typical worker count
  const secondsPerCell = 2;

  const totalSeconds = (cellCount * secondsPerCell) / concurrency;
  const minutes = totalSeconds / 60;

  return {
    minMinutes: Math.ceil(minutes * 0.5),
    maxMinutes: Math.ceil(minutes * 2),
    averageMinutes: Math.ceil(minutes),
  };
}

/**
 * Convert a Zod path array to a JSON path string
 * e.g., ['queries', 0, 'text'] => 'queries[0].text'
 */
function formatFieldPath(path: (string | number)[]): string {
  if (path.length === 0) return '(root)';

  return path.reduce<string>((acc, segment, index) => {
    if (typeof segment === 'number') {
      return `${acc}[${segment}]`;
    }
    return index === 0 ? segment : `${acc}.${segment}`;
  }, '');
}

/**
 * Determine the constraint type from a Zod error
 */
function getConstraintType(error: z.ZodIssue): string {
  switch (error.code) {
    case 'too_small':
      return error.type === 'string' ? 'minLength' : 'minimum';
    case 'too_big':
      return error.type === 'string' ? 'maxLength' : 'maximum';
    case 'invalid_type':
      return 'type';
    case 'invalid_enum_value':
      return 'enum';
    case 'invalid_string':
      return 'format';
    case 'custom':
      return 'custom';
    default:
      return 'validation';
  }
}

/**
 * Transform Zod validation errors into API-friendly format
 */
export function formatValidationErrors(
  zodErrors: z.ZodError
): ValidationErrorDetail[] {
  return zodErrors.errors.map((error) => ({
    field: formatFieldPath(error.path),
    message: error.message,
    constraint: getConstraintType(error),
  }));
}

/**
 * Validate a manifest and return API-friendly response
 *
 * This is the primary function for API endpoints to use when validating
 * incoming manifests. It returns a structured response suitable for
 * direct serialization to JSON.
 *
 * @param data - The raw manifest data from the request body
 * @param requestId - Optional request ID for tracing
 * @returns API response with validation result
 */
export function validateManifestForApi(
  data: unknown,
  requestId?: string
): ApiResponse<ManifestValidationResponse> {
  const result = ManifestSchema.safeParse(data);

  if (!result.success) {
    const errors = formatValidationErrors(result.error);
    return createValidationErrorResponse(errors, requestId);
  }

  // Manifest is valid - calculate study info
  const validatedManifest = result.data;
  const totalCells = calculateCellCount(validatedManifest);

  // Generate warnings for potential issues
  const warnings = generateValidationWarnings(validatedManifest);

  return createSuccessResponse<ManifestValidationResponse>(
    {
      valid: true,
      warnings: warnings.length > 0 ? warnings : undefined,
      studyInfo: {
        totalCells,
        estimatedCost: estimateCost(validatedManifest),
      },
    },
    { requestId }
  );
}

/**
 * 2Captcha supported locations (for validation warnings)
 * This mirrors the TWOCAPTCHA_LOCATION_MAP from proxy-manager
 */
const TWOCAPTCHA_SUPPORTED_LOCATIONS = new Set<string>([
  'us-national', 'us-nyc', 'us-la', 'us-chi', 'us-hou', 'us-mia', 'us-sea',
  'uk-lon', 'de-ber', 'de-mun', 'fr-par', 'nl-ams', 'es-mad', 'it-rom',
  'jp-tok', 'au-syd', 'sg-sg', 'in-mum',
  'ca-tor', 'ca-van', 'br-sao', 'mx-mex',
]);

/**
 * Generate warnings for valid manifests that might have issues
 */
function generateValidationWarnings(
  manifest: ValidatedManifest
): Array<{ field: string; message: string; recommendation?: string }> {
  const warnings: Array<{ field: string; message: string; recommendation?: string }> = [];

  // Warn if deadline is very soon (< 1 hour)
  const hourFromNow = new Date(Date.now() + 60 * 60 * 1000);
  if (manifest.deadline < hourFromNow) {
    warnings.push({
      field: 'deadline',
      message: 'Deadline is less than 1 hour away',
      recommendation: 'Consider extending the deadline to allow for retries and delays',
    });
  }

  // Warn if coverage threshold is 100% (may be hard to achieve)
  if (manifest.completionCriteria.requiredSurfaces.coverageThreshold === 1) {
    warnings.push({
      field: 'completionCriteria.requiredSurfaces.coverageThreshold',
      message: '100% coverage threshold may be difficult to achieve',
      recommendation: 'Consider using 0.95 (95%) to allow for occasional failures',
    });
  }

  // Warn if cell count is very large
  const totalCells = calculateCellCount(manifest);
  if (totalCells > 10000) {
    warnings.push({
      field: '(computed)',
      message: `Study contains ${totalCells.toLocaleString()} cells which may take significant time`,
      recommendation: 'Consider breaking into smaller studies or extending the deadline',
    });
  }

  // Warn if retries are set to minimum
  if (manifest.completionCriteria.maxRetriesPerCell === 1) {
    warnings.push({
      field: 'completionCriteria.maxRetriesPerCell',
      message: 'Only 1 retry per cell may result in lower completion rates',
      recommendation: 'Consider allowing 2-3 retries for better reliability',
    });
  }

  // Warn if using legal hold without preserve forever
  if (manifest.legalHold && !manifest.preserveForever && manifest.retentionDays && manifest.retentionDays < 365) {
    warnings.push({
      field: 'retentionDays',
      message: 'Legal hold studies with retention under 1 year may not meet compliance requirements',
      recommendation: 'Consider extending retention or enabling preserveForever',
    });
  }

  // Check 2captcha provider compatibility with locations
  manifest.locations.forEach((loc, index) => {
    if (loc.proxyProvider === '2captcha' && !TWOCAPTCHA_SUPPORTED_LOCATIONS.has(loc.id)) {
      warnings.push({
        field: `locations[${index}].proxyProvider`,
        message: `Location '${loc.id}' may not be optimally supported by 2captcha provider`,
        recommendation: "Consider using 'auto' provider or select a different provider for this location",
      });
    }
  });

  // Warn if session duration is set without sticky requirement
  manifest.locations.forEach((loc, index) => {
    if (loc.sessionDuration && loc.sessionDuration > 0 && !loc.requireSticky) {
      warnings.push({
        field: `locations[${index}].sessionDuration`,
        message: 'Session duration specified but requireSticky is false',
        recommendation: 'Set requireSticky to true to ensure consistent IP for the session duration',
      });
    }
  });

  return warnings;
}

/**
 * Estimate cost for a manifest using actual model pricing
 */
function estimateCost(manifest: ValidatedManifest): {
  min: number;
  max: number;
  currency: string;
  breakdown?: Array<{ surfaceId: string; model: string; costPer10: number }>;
} {
  // Use accurate cost estimation based on surface/model config
  const surfaces = manifest.surfaces.map(s => ({
    id: s.id,
    options: s.options as { model?: string } | undefined,
  }));

  const estimate = estimateStudyCost(
    surfaces,
    manifest.queries.length,
    manifest.locations.length
  );

  // Add multipliers for additional costs
  const proxyMultiplier = manifest.locations.some(l => l.proxyType === 'mobile') ? 1.2 : 1;
  const evidenceMultiplier = manifest.evidenceLevel === 'full' ? 1.1 : 1;

  const adjustedTotal = estimate.total * proxyMultiplier * evidenceMultiplier;

  return {
    min: Math.round(adjustedTotal * 0.8 * 100) / 100,
    max: Math.round(adjustedTotal * 1.3 * 100) / 100,
    currency: 'USD',
    breakdown: estimate.breakdown,
  };
}
