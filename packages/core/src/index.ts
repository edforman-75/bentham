/**
 * @bentham/core
 *
 * Core types, utilities, and constants for the Bentham multi-tenant AI extraction service.
 */

// Types
export * from './types/index.js';

// Schemas (manifest validation)
export * from './schemas/index.js';

// Errors
export {
  BenthamError,
  Errors,
  isBenthamError,
  toBenthamError,
  ERROR_HTTP_STATUS,
} from './errors.js';
export type { ErrorCode } from './errors.js';

// Utilities
export * from './utils/index.js';

// Constants
export {
  DEFAULT_TIMEOUTS,
  MAX_RETRIES,
  RETRY_DELAYS,
  SESSION_POOL,
  HUMAN_BEHAVIOR,
  EVIDENCE,
  QUEUE,
  MANIFEST_VERSION,
  API_VERSION,
} from './constants.js';

// Alerting
export {
  OperatorAlertingService,
  createOperatorAlertingService,
  type IncidentSeverity,
  type IncidentStatus,
  type Incident,
  type ImpactAssessment,
  type RemediationAction,
  type NotificationChannel,
  type NotificationConfig,
  type NotificationPayload,
  type AlertListener,
} from './alerting/operator-alerting-service.js';

// Surface Defaults & Pricing
export {
  SURFACE_DEFAULTS,
  getDefaultModel,
  getModelConfig,
  estimateQueryCost,
  estimateStudyCost,
  getAvailableModels,
  isValidModel,
  type ModelTier,
  type ModelConfig,
  type SurfaceConfig,
} from './config/surface-defaults.js';
