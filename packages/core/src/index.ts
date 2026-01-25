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

// Surface Collection Configuration
export {
  SURFACE_COLLECTION_CONFIG,
  getCollectionConfig,
  requiresVpnForLocation,
  getRecommendedMethod,
  useSerpApi,
  type CollectionMethod,
  type LocationHandling,
  type SurfaceCollectionConfig,
} from './config/surface-defaults.js';

// Location & Proxy Configuration
export {
  PROXY_PROVIDERS,
  LOCATION_CONFIG,
  getLocationConfig,
  locationRequiresVpn,
  getSerpApiParams,
  getBrowserProxyConfig,
  type ProxyProviderConfig,
  type LocationConfig,
} from './config/surface-defaults.js';

// Study Runner
export {
  type StudyQuery,
  type QueryResult,
  type StudyConfig,
  type StudyProgress,
  extractBrandMentions,
  getCollectionMethod,
  shouldUseSerpApi,
  requiresBrowser,
  usesDirectApi,
  routeQuery,
  getStudyRoutingSummary,
  validateStudyConfig,
  getSurfaceOutputPath,
  sleep,
  randomDelay,
} from './study/index.js';
