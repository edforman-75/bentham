/**
 * @bentham/session-pool
 *
 * Browser session pooling for Bentham.
 */

// Types
export type {
  SessionStatus,
  BrowserEngine,
  SessionConfig,
  Session,
  SessionRequestOptions,
  SessionCheckout,
  SessionPoolConfig,
  SessionPoolStats,
  SessionLifecycleHooks,
  SessionExpiryForecast,
  SessionExpiryWarning,
} from './types.js';

export { DEFAULT_POOL_CONFIG, DEFAULT_SESSION_CONFIG } from './types.js';

// Pool
export { SessionPool, createSessionPool } from './pool.js';
