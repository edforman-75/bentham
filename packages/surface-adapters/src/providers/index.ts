/**
 * Execution Providers
 *
 * Abstraction layer for swapping between in-house and outsourced execution.
 */

// Core interfaces
export type {
  ExecutionProvider,
  ExecutionProviderManager,
  ExecutionRequest,
  ExecutionResult,
  ProviderHealthStatus,
  ExecutionProviderConfig,
  FailoverConfig,
} from './execution-provider';

export { DEFAULT_FAILOVER_CONFIG } from './execution-provider';

// In-house provider (default)
export {
  InHouseExecutionProvider,
  createInHouseProvider,
} from './in-house-provider';
export type {
  InHouseProviderConfig,
  AdapterRegistry,
} from './in-house-provider';

// Outsourced provider stubs (implement when needed)
export {
  ApifyExecutionProvider,
  BrowserlessExecutionProvider,
  BrightDataExecutionProvider,
} from './outsourced-providers';
export type {
  ApifyProviderConfig,
  BrowserlessProviderConfig,
  BrightDataProviderConfig,
} from './outsourced-providers';
