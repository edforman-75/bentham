/**
 * Account Manager Implementation
 *
 * Manages platform accounts, credentials, and checkout/checkin flow.
 */

import { randomUUID } from 'crypto';
import type { SurfaceId } from '@bentham/core';
import type {
  AccountConfig,
  AccountUsage,
  AccountPool,
  AccountRequestOptions,
  AccountCheckout,
  AccountHealthCheck,
  AccountManagerConfig,
  AccountManagerStats,
  AccountStatus,
} from './types.js';
import { DEFAULT_ACCOUNT_MANAGER_CONFIG } from './types.js';

/**
 * Account Manager class
 */
export class AccountManager {
  private config: Required<AccountManagerConfig>;
  private accounts: Map<string, AccountConfig> = new Map();
  private usage: Map<string, AccountUsage> = new Map();
  private pools: Map<string, AccountPool> = new Map();
  private checkouts: Map<string, AccountCheckout> = new Map();
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(config: AccountManagerConfig = {}) {
    this.config = {
      ...DEFAULT_ACCOUNT_MANAGER_CONFIG,
      ...config,
    };

    if (this.config.autoCleanup) {
      this.startCleanup();
    }
  }

  /**
   * Add an account
   */
  addAccount(account: AccountConfig): void {
    this.accounts.set(account.id, account);

    // Initialize usage record
    const now = new Date();
    this.usage.set(account.id, {
      accountId: account.id,
      requestCount: 0,
      successCount: 0,
      failedCount: 0,
      activeSessions: 0,
      periodStart: now,
      periodEnd: now,
    });
  }

  /**
   * Remove an account
   */
  removeAccount(accountId: string): boolean {
    if (!this.accounts.has(accountId)) return false;

    this.accounts.delete(accountId);
    this.usage.delete(accountId);

    // Remove from all pools
    for (const pool of this.pools.values()) {
      const index = pool.accountIds.indexOf(accountId);
      if (index >= 0) {
        pool.accountIds.splice(index, 1);
      }
    }

    // Cancel any active checkouts
    for (const [checkoutId, checkout] of this.checkouts) {
      if (checkout.account.id === accountId) {
        this.checkouts.delete(checkoutId);
      }
    }

    return true;
  }

  /**
   * Get an account by ID
   */
  getAccount(accountId: string): AccountConfig | undefined {
    return this.accounts.get(accountId);
  }

  /**
   * Get all accounts
   */
  getAllAccounts(): AccountConfig[] {
    return Array.from(this.accounts.values());
  }

  /**
   * Get accounts for a tenant
   */
  getTenantAccounts(tenantId: string): AccountConfig[] {
    return Array.from(this.accounts.values())
      .filter(a => a.tenantId === tenantId);
  }

  /**
   * Get accounts for a surface
   */
  getSurfaceAccounts(surfaceId: SurfaceId): AccountConfig[] {
    return Array.from(this.accounts.values())
      .filter(a => a.surfaceId === surfaceId);
  }

  /**
   * Update an account
   */
  updateAccount(accountId: string, updates: Partial<AccountConfig>): boolean {
    const account = this.accounts.get(accountId);
    if (!account) return false;

    this.accounts.set(accountId, {
      ...account,
      ...updates,
      id: accountId,
      updatedAt: new Date(),
    });
    return true;
  }

  /**
   * Set account status
   */
  setAccountStatus(accountId: string, status: AccountStatus): boolean {
    return this.updateAccount(accountId, { status });
  }

  /**
   * Enable an account
   */
  enableAccount(accountId: string): boolean {
    return this.updateAccount(accountId, { enabled: true });
  }

  /**
   * Disable an account
   */
  disableAccount(accountId: string): boolean {
    return this.updateAccount(accountId, { enabled: false });
  }

  /**
   * Create an account pool
   */
  createPool(pool: AccountPool): void {
    this.pools.set(pool.id, pool);
  }

  /**
   * Get a pool by ID
   */
  getPool(poolId: string): AccountPool | undefined {
    return this.pools.get(poolId);
  }

  /**
   * Get pools for a surface
   */
  getSurfacePools(surfaceId: SurfaceId): AccountPool[] {
    return Array.from(this.pools.values())
      .filter(p => p.surfaceId === surfaceId);
  }

  /**
   * Remove a pool
   */
  removePool(poolId: string): boolean {
    return this.pools.delete(poolId);
  }

  /**
   * Add an account to a pool
   */
  addToPool(poolId: string, accountId: string): boolean {
    const pool = this.pools.get(poolId);
    const account = this.accounts.get(accountId);
    if (!pool || !account) return false;

    // Verify surface matches
    if (account.surfaceId !== pool.surfaceId) return false;

    if (!pool.accountIds.includes(accountId)) {
      pool.accountIds.push(accountId);
    }
    return true;
  }

  /**
   * Remove an account from a pool
   */
  removeFromPool(poolId: string, accountId: string): boolean {
    const pool = this.pools.get(poolId);
    if (!pool) return false;

    const index = pool.accountIds.indexOf(accountId);
    if (index >= 0) {
      pool.accountIds.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Check out an account for use
   */
  checkout(options: AccountRequestOptions): AccountCheckout | undefined {
    // Get available accounts
    let candidates = this.getAvailableAccounts(options);

    // Apply filters
    if (options.exclude) {
      candidates = candidates.filter(a => !options.exclude!.includes(a.id));
    }

    // Apply preferences
    if (options.prefer && options.prefer.length > 0) {
      const preferred = candidates.filter(a => options.prefer!.includes(a.id));
      if (preferred.length > 0) {
        candidates = preferred;
      }
    }

    if (candidates.length === 0) return undefined;

    // Select account with least active sessions
    candidates.sort((a, b) => {
      const usageA = this.usage.get(a.id);
      const usageB = this.usage.get(b.id);
      return (usageA?.activeSessions ?? 0) - (usageB?.activeSessions ?? 0);
    });

    const account = candidates[0];
    const duration = options.sessionDuration ?? this.config.maxCheckoutDuration;

    const checkout: AccountCheckout = {
      id: randomUUID(),
      account,
      expiresAt: new Date(Date.now() + duration * 1000),
      tenantId: options.tenantId,
    };

    this.checkouts.set(checkout.id, checkout);

    // Update usage
    const usage = this.usage.get(account.id);
    if (usage) {
      usage.activeSessions++;
      usage.lastUsedAt = new Date();
    }

    return checkout;
  }

  /**
   * Check in (release) an account
   */
  checkin(checkoutId: string, options: { success?: boolean; error?: string } = {}): boolean {
    const checkout = this.checkouts.get(checkoutId);
    if (!checkout) return false;

    const account = this.accounts.get(checkout.account.id);
    const usage = this.usage.get(checkout.account.id);

    if (usage) {
      usage.activeSessions = Math.max(0, usage.activeSessions - 1);
      usage.requestCount++;
      usage.periodEnd = new Date();

      if (options.success !== false) {
        usage.successCount++;
      } else {
        usage.failedCount++;
      }
    }

    // Apply cooldown if configured
    if (account && account.cooldownSeconds) {
      if (usage) {
        usage.cooldownEndsAt = new Date(Date.now() + account.cooldownSeconds * 1000);
      }
    }

    // Handle errors that might affect account status
    if (options.error && account) {
      this.handleAccountError(account.id, options.error);
    }

    this.checkouts.delete(checkoutId);
    return true;
  }

  /**
   * Get a checkout by ID
   */
  getCheckout(checkoutId: string): AccountCheckout | undefined {
    return this.checkouts.get(checkoutId);
  }

  /**
   * Get all active checkouts
   */
  getActiveCheckouts(): AccountCheckout[] {
    return Array.from(this.checkouts.values())
      .filter(c => c.expiresAt > new Date());
  }

  /**
   * Get account usage
   */
  getUsage(accountId: string): AccountUsage | undefined {
    return this.usage.get(accountId);
  }

  /**
   * Get all usage records
   */
  getAllUsage(): AccountUsage[] {
    return Array.from(this.usage.values());
  }

  /**
   * Reset usage records
   */
  resetUsage(): void {
    const now = new Date();
    for (const accountId of this.usage.keys()) {
      this.usage.set(accountId, {
        accountId,
        requestCount: 0,
        successCount: 0,
        failedCount: 0,
        activeSessions: 0,
        periodStart: now,
        periodEnd: now,
      });
    }
  }

  /**
   * Check if an account is available
   */
  isAvailable(accountId: string): boolean {
    const account = this.accounts.get(accountId);
    if (!account) return false;
    if (!account.enabled) return false;
    if (account.status !== 'active') return false;

    const usage = this.usage.get(accountId);
    if (usage) {
      // Check cooldown
      if (usage.cooldownEndsAt && usage.cooldownEndsAt > new Date()) {
        return false;
      }

      // Check max concurrent
      if (account.maxConcurrent && usage.activeSessions >= account.maxConcurrent) {
        return false;
      }
    }

    return true;
  }

  /**
   * Report a health check result
   */
  reportHealthCheck(result: AccountHealthCheck): void {
    const account = this.accounts.get(result.accountId);
    if (!account) return;

    if (!result.healthy && result.recommendedStatus !== account.status) {
      this.setAccountStatus(result.accountId, result.recommendedStatus);
    } else if (result.healthy && account.status !== 'active') {
      this.setAccountStatus(result.accountId, 'active');
    }
  }

  /**
   * Get manager statistics
   */
  getStats(): AccountManagerStats {
    const accounts = Array.from(this.accounts.values());
    const usages = Array.from(this.usage.values());

    const byStatus: Record<AccountStatus, number> = {
      active: 0,
      cooldown: 0,
      suspended: 0,
      invalid: 0,
      locked: 0,
      retired: 0,
    };

    const bySurface: Record<string, number> = {};

    for (const account of accounts) {
      byStatus[account.status]++;
      bySurface[account.surfaceId] = (bySurface[account.surfaceId] ?? 0) + 1;
    }

    // Count cooldown from usage
    let cooldownCount = 0;
    const now = new Date();
    for (const usage of usages) {
      if (usage.cooldownEndsAt && usage.cooldownEndsAt > now) {
        cooldownCount++;
      }
    }

    return {
      totalAccounts: accounts.length,
      activeAccounts: accounts.filter(a => a.status === 'active' && a.enabled).length,
      cooldownAccounts: cooldownCount,
      unavailableAccounts: accounts.filter(a =>
        a.status === 'suspended' || a.status === 'invalid' || a.status === 'locked'
      ).length,
      activeCheckouts: this.getActiveCheckouts().length,
      totalPools: this.pools.size,
      bySurface,
      byStatus,
    };
  }

  /**
   * Start automatic cleanup
   */
  startCleanup(): void {
    if (this.cleanupTimer) return;

    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredCheckouts();
    }, this.config.cleanupInterval);
  }

  /**
   * Stop automatic cleanup
   */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Clean up expired checkouts
   */
  cleanupExpiredCheckouts(): number {
    const now = new Date();
    let cleaned = 0;

    for (const [checkoutId, checkout] of this.checkouts) {
      if (checkout.expiresAt <= now) {
        // Auto-checkin expired checkout
        this.checkin(checkoutId, { success: false, error: 'Checkout expired' });
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.stopCleanup();
    this.accounts.clear();
    this.usage.clear();
    this.pools.clear();
    this.checkouts.clear();
  }

  // Private helper methods

  private getAvailableAccounts(options: AccountRequestOptions): AccountConfig[] {
    let candidates: AccountConfig[];

    if (options.poolId) {
      const pool = this.pools.get(options.poolId);
      if (!pool) return [];

      candidates = pool.accountIds
        .map(id => this.accounts.get(id))
        .filter((a): a is AccountConfig => a !== undefined);
    } else {
      candidates = Array.from(this.accounts.values())
        .filter(a =>
          a.surfaceId === options.surfaceId &&
          a.tenantId === options.tenantId
        );
    }

    // Filter to available accounts
    return candidates.filter(a => this.isAvailable(a.id));
  }

  private handleAccountError(accountId: string, error: string): void {
    const lowercaseError = error.toLowerCase();

    if (lowercaseError.includes('suspended') || lowercaseError.includes('banned')) {
      this.setAccountStatus(accountId, 'suspended');
    } else if (lowercaseError.includes('invalid') || lowercaseError.includes('unauthorized')) {
      this.setAccountStatus(accountId, 'invalid');
    } else if (lowercaseError.includes('locked') || lowercaseError.includes('verification')) {
      this.setAccountStatus(accountId, 'locked');
    } else if (lowercaseError.includes('rate limit') || lowercaseError.includes('too many')) {
      // Apply cooldown
      const usage = this.usage.get(accountId);
      if (usage) {
        usage.cooldownEndsAt = new Date(Date.now() + this.config.defaultCooldownSeconds * 1000);
      }
    }
  }
}

/**
 * Create a new account manager instance
 */
export function createAccountManager(config?: AccountManagerConfig): AccountManager {
  return new AccountManager(config);
}
