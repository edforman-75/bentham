/**
 * Account Manager Types
 *
 * Types for managing platform accounts and credentials.
 */

import type { SurfaceId } from '@bentham/core';

/**
 * Account status
 */
export type AccountStatus =
  | 'active'       // Account is usable
  | 'cooldown'     // Temporarily unavailable (rate limited)
  | 'suspended'    // Account suspended by platform
  | 'invalid'      // Credentials invalid
  | 'locked'       // Account locked (needs verification)
  | 'retired';     // No longer in use

/**
 * Credential types
 */
export type CredentialType = 'password' | 'cookie' | 'token' | 'api_key' | 'oauth';

/**
 * Account credential
 */
export interface AccountCredential {
  /** Credential type */
  type: CredentialType;
  /** Credential value (encrypted in storage) */
  value: string;
  /** When the credential expires */
  expiresAt?: Date;
  /** When the credential was last refreshed */
  refreshedAt?: Date;
}

/**
 * Account configuration
 */
export interface AccountConfig {
  /** Unique account ID */
  id: string;
  /** Platform/surface this account is for */
  surfaceId: SurfaceId;
  /** Account identifier (email, username, etc.) */
  identifier: string;
  /** Display name */
  name?: string;
  /** Credentials for this account */
  credentials: AccountCredential[];
  /** Current status */
  status: AccountStatus;
  /** Tenant that owns this account */
  tenantId: string;
  /** Whether this account can be used */
  enabled: boolean;
  /** Maximum concurrent sessions */
  maxConcurrent?: number;
  /** Cooldown period in seconds after use */
  cooldownSeconds?: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  /** Created timestamp */
  createdAt: Date;
  /** Last updated timestamp */
  updatedAt: Date;
}

/**
 * Account usage record
 */
export interface AccountUsage {
  /** Account ID */
  accountId: string;
  /** Total requests made */
  requestCount: number;
  /** Successful requests */
  successCount: number;
  /** Failed requests */
  failedCount: number;
  /** Current active sessions */
  activeSessions: number;
  /** Last used timestamp */
  lastUsedAt?: Date;
  /** Cooldown ends at */
  cooldownEndsAt?: Date;
  /** Period start */
  periodStart: Date;
  /** Period end */
  periodEnd: Date;
}

/**
 * Account pool for a surface
 */
export interface AccountPool {
  /** Pool ID */
  id: string;
  /** Surface this pool serves */
  surfaceId: SurfaceId;
  /** Account IDs in this pool */
  accountIds: string[];
  /** Tenant ID */
  tenantId: string;
  /** Pool configuration */
  config?: AccountPoolConfig;
}

/**
 * Account pool configuration
 */
export interface AccountPoolConfig {
  /** Minimum healthy accounts required */
  minHealthyAccounts?: number;
  /** Maximum accounts in cooldown */
  maxCooldownAccounts?: number;
  /** Default cooldown period in seconds */
  defaultCooldownSeconds?: number;
  /** Whether to auto-rotate unhealthy accounts */
  autoRotate?: boolean;
}

/**
 * Account request options
 */
export interface AccountRequestOptions {
  /** Surface ID (required) */
  surfaceId: SurfaceId;
  /** Tenant ID (required) */
  tenantId: string;
  /** Pool ID to select from */
  poolId?: string;
  /** Exclude these account IDs */
  exclude?: string[];
  /** Prefer these account IDs */
  prefer?: string[];
  /** Session duration hint in seconds */
  sessionDuration?: number;
}

/**
 * Account checkout result
 */
export interface AccountCheckout {
  /** Checkout ID */
  id: string;
  /** Account that was checked out */
  account: AccountConfig;
  /** When this checkout expires */
  expiresAt: Date;
  /** Tenant ID */
  tenantId: string;
}

/**
 * Account health check result
 */
export interface AccountHealthCheck {
  /** Account ID */
  accountId: string;
  /** Check timestamp */
  timestamp: Date;
  /** Whether the check passed */
  healthy: boolean;
  /** Response time in ms */
  responseTimeMs?: number;
  /** Error message if unhealthy */
  error?: string;
  /** Recommended status */
  recommendedStatus: AccountStatus;
}

/**
 * Account manager configuration
 */
export interface AccountManagerConfig {
  /** Default cooldown period in seconds */
  defaultCooldownSeconds?: number;
  /** Maximum checkout duration in seconds */
  maxCheckoutDuration?: number;
  /** Health check interval in ms */
  healthCheckInterval?: number;
  /** Auto-cleanup expired checkouts */
  autoCleanup?: boolean;
  /** Cleanup interval in ms */
  cleanupInterval?: number;
}

/**
 * Account manager statistics
 */
export interface AccountManagerStats {
  /** Total accounts */
  totalAccounts: number;
  /** Active accounts */
  activeAccounts: number;
  /** Accounts in cooldown */
  cooldownAccounts: number;
  /** Suspended/invalid accounts */
  unavailableAccounts: number;
  /** Active checkouts */
  activeCheckouts: number;
  /** Total pools */
  totalPools: number;
  /** By surface */
  bySurface: Record<string, number>;
  /** By status */
  byStatus: Record<AccountStatus, number>;
}

/**
 * Default manager configuration
 */
export const DEFAULT_ACCOUNT_MANAGER_CONFIG: Required<AccountManagerConfig> = {
  defaultCooldownSeconds: 30,
  maxCheckoutDuration: 300,    // 5 minutes
  healthCheckInterval: 300000, // 5 minutes
  autoCleanup: true,
  cleanupInterval: 60000,      // 1 minute
};
