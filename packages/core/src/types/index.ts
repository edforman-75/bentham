/**
 * Type exports for @bentham/core
 */

// Execution Metadata (IP, timing, costs, failures, debugging)
export * from './execution-metadata.js';

// Common types
export type {
  Query,
  QueryContext,
  QueryResult,
  Checkpoint,
  ResultSummary,
} from './common.js';

// Study types
export type {
  StudyStatus,
  SessionIsolation,
  EvidenceLevel,
  CompletionCriteria,
  QualityGates,
  Manifest,
  Study,
  JobStatus,
  JobEvidence,
  JobValidation,
  JobResultContext,
  JobResult,
  Job,
} from './study.js';

// Surface types
export type {
  SurfaceCategory,
  BrowserEngine,
  BrowserEngineConfig,
  SessionStatus,
  SurfaceConfig,
  SurfaceAdapter,
  HumanBehaviorConfig,
  SurfaceId,
} from './surface.js';
export { SURFACES, isValidSurfaceId, getSurfaceDefinition } from './surface.js';

// Location types
export type {
  LocationConfig,
  LocationId,
  LocationVerification,
} from './location.js';
export { LOCATIONS, isValidLocationId, getLocationConfig } from './location.js';

// Cost types
export type {
  CostCategory,
  CostLineItem,
  CostEstimate,
  CostRecord,
} from './cost.js';
export {
  createEmptyCostEstimate,
  createEmptyCostRecord,
  addCostLineItem,
} from './cost.js';

// Tenant types
export type {
  Role,
  TenantStatus,
  User,
  TenantQuota,
  TenantNotificationPrefs,
  Tenant,
  ApiKey,
  ApiKeyPermission,
} from './tenant.js';
export {
  createDefaultQuota,
  createDefaultNotificationPrefs,
} from './tenant.js';

// API Response types
export type {
  ApiResponse,
  ApiError,
  ApiMeta,
  ValidationErrorDetail,
  ValidationWarning,
  ManifestValidationResponse,
} from './api-response.js';
export {
  createSuccessResponse,
  createErrorResponse,
  createValidationErrorResponse,
} from './api-response.js';
