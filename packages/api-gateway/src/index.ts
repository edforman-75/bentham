/**
 * @bentham/api-gateway
 *
 * REST API gateway for Bentham.
 */

// Types
export type {
  ApiError,
  ApiResponse,
  PaginatedResponse,
  CreateStudyRequest,
  CreateStudyResponse,
  StudyStatusResponse,
  StudyResultsResponse,
  StudyCostResponse,
  HealthResponse,
  RequestContext,
  ApiKey,
  RateLimitInfo,
  GatewayConfig,
} from './types.js';

export { DEFAULT_GATEWAY_CONFIG } from './types.js';

// Gateway
export {
  Gateway,
  createGateway,
  type GatewayDependencies,
} from './gateway.js';

// Middleware
export {
  authPlugin,
  type AuthPluginOptions,
  type ApiKeyStore,
  InMemoryApiKeyStore,
  hashApiKey,
  generateApiKey,
  errorHandlerPlugin,
} from './middleware/index.js';

// Routes
export {
  studiesRoutes,
  type StudyService,
  type StudiesRoutesOptions,
  healthRoutes,
  type HealthService,
  type HealthRoutesOptions,
  costsRoutes,
  type CostService,
  type CostsRoutesOptions,
} from './routes/index.js';
