/**
 * Recovery Module
 *
 * Automatic recovery strategies for surface adapters:
 * - Failover chain (API -> Playwright -> CDP)
 * - Circuit breaker pattern
 * - Rate limit handling with exponential backoff
 * - Session health monitoring
 * - CDP fallback for anti-bot bypass
 */

export {
  RecoveryManager,
  createRecoveryManager,
  type RecoveryConfig,
  type RecoveryResult,
  type SurfaceHealth,
  type FailureType,
  DEFAULT_RECOVERY_CONFIG,
} from './recovery-manager.js';

export {
  querySurfaceViaCdp,
  createCdpQueryFn,
  isCdpAvailable,
  type CdpFallbackConfig,
} from './cdp-fallback.js';
