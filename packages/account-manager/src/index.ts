/**
 * @bentham/account-manager
 *
 * Account credential management for Bentham.
 */

// Types
export type {
  AccountStatus,
  CredentialType,
  AccountCredential,
  AccountConfig,
  AccountUsage,
  AccountPool,
  AccountPoolConfig,
  AccountRequestOptions,
  AccountCheckout,
  AccountHealthCheck,
  AccountManagerConfig,
  AccountManagerStats,
} from './types.js';

export { DEFAULT_ACCOUNT_MANAGER_CONFIG } from './types.js';

// Manager
export { AccountManager, createAccountManager } from './manager.js';
