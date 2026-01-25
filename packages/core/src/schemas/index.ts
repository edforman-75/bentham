/**
 * Schema exports for @bentham/core
 */

export {
  // Core schemas
  QuerySchema,
  SurfaceConfigSchema,
  SurfaceOptionsSchema,
  LocationConfigSchema,
  CompletionCriteriaSchema,
  QualityGatesSchema,
  ManifestSchema,

  // New execution config schemas
  RetryBackoffStrategy,
  RetryConditionSchema,
  RetryConfigSchema,
  CheckpointConfigSchema,
  TimeoutConfigSchema,
  ExecutionConfigSchema,

  // Validation functions
  validateManifest,
  validateManifestForApi,
  formatValidationErrors,

  // Utility functions
  calculateCellCount,
  estimateDuration,

  // Constants
  PROXY_PROVIDERS,
} from './manifest.js';

export type {
  ValidatedManifest,
  ProxyProviderId,
  RetryBackoffStrategyType,
} from './manifest.js';
