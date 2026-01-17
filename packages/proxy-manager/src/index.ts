/**
 * @bentham/proxy-manager
 *
 * Proxy management and rotation for Bentham.
 */

// Types
export type {
  ProxyType,
  ProxyProtocol,
  ProxyStatus,
  RotationStrategy,
  ProxyConfig,
  ProxyHealth,
  ProxySession,
  ProxyPoolConfig,
  ProxyRequestOptions,
  ProxyUsageRecord,
  ProxyManagerConfig,
  ProxyManagerStats,
} from './types.js';

export { DEFAULT_MANAGER_CONFIG } from './types.js';

// Manager
export { ProxyManager, createProxyManager } from './manager.js';
