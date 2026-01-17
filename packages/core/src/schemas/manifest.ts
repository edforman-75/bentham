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
 * Surface configuration schema
 */
export const SurfaceConfigSchema = z.object({
  id: z.string().refine(
    (id): id is SurfaceId => id in SURFACES,
    { message: 'Invalid surface ID' }
  ),
  required: z.boolean().default(true),
  options: z.record(z.unknown()).optional(),
});

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
  maxRetriesPerCell: z.number().int().min(1).max(10).default(3),
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

  return warnings;
}

/**
 * Estimate cost for a manifest
 */
function estimateCost(manifest: ValidatedManifest): {
  min: number;
  max: number;
  currency: string;
} {
  const totalCells = calculateCellCount(manifest);

  // Base cost estimates per cell (rough estimates)
  const baseCostPerCell = 0.005; // $0.005 per cell baseline
  const proxyMultiplier = manifest.locations.some(l => l.proxyType === 'mobile') ? 1.5 : 1;
  const evidenceMultiplier = manifest.evidenceLevel === 'full' ? 1.3 : 1;

  const baseTotal = totalCells * baseCostPerCell * proxyMultiplier * evidenceMultiplier;

  return {
    min: Math.round(baseTotal * 0.8 * 100) / 100,
    max: Math.round(baseTotal * 1.5 * 100) / 100,
    currency: 'USD',
  };
}
