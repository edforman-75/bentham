/**
 * Account Manager Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AccountManager, createAccountManager } from '../../manager.js';
import type { AccountConfig, AccountPool } from '../../types.js';
import type { SurfaceId } from '@bentham/core';

describe('AccountManager', () => {
  let manager: AccountManager;

  const createTestAccount = (overrides: Partial<AccountConfig> = {}): AccountConfig => ({
    id: `account-${Math.random().toString(36).slice(2)}`,
    surfaceId: 'linkedin-jobs' as SurfaceId,
    identifier: 'test@example.com',
    name: 'Test Account',
    credentials: [{ type: 'password', value: 'encrypted-password' }],
    status: 'active',
    tenantId: 'tenant-1',
    enabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    manager = new AccountManager({ autoCleanup: false });
  });

  afterEach(() => {
    manager.clear();
  });

  describe('constructor', () => {
    it('should create manager with default config', () => {
      const stats = manager.getStats();
      expect(stats.totalAccounts).toBe(0);
    });

    it('should create manager with custom config', () => {
      const customManager = new AccountManager({
        defaultCooldownSeconds: 60,
        maxCheckoutDuration: 600,
      });
      expect(customManager).toBeInstanceOf(AccountManager);
      customManager.clear();
    });
  });

  describe('account management', () => {
    it('should add an account', () => {
      const account = createTestAccount({ id: 'account-1' });
      manager.addAccount(account);

      const retrieved = manager.getAccount('account-1');
      expect(retrieved).toEqual(account);
    });

    it('should initialize usage record when adding account', () => {
      const account = createTestAccount({ id: 'account-1' });
      manager.addAccount(account);

      const usage = manager.getUsage('account-1');
      expect(usage).toBeDefined();
      expect(usage!.requestCount).toBe(0);
    });

    it('should remove an account', () => {
      const account = createTestAccount({ id: 'account-1' });
      manager.addAccount(account);

      const removed = manager.removeAccount('account-1');
      expect(removed).toBe(true);
      expect(manager.getAccount('account-1')).toBeUndefined();
    });

    it('should return false when removing non-existent account', () => {
      const removed = manager.removeAccount('non-existent');
      expect(removed).toBe(false);
    });

    it('should get all accounts', () => {
      manager.addAccount(createTestAccount({ id: 'account-1' }));
      manager.addAccount(createTestAccount({ id: 'account-2' }));

      const accounts = manager.getAllAccounts();
      expect(accounts).toHaveLength(2);
    });

    it('should get tenant accounts', () => {
      manager.addAccount(createTestAccount({ id: 'account-1', tenantId: 'tenant-1' }));
      manager.addAccount(createTestAccount({ id: 'account-2', tenantId: 'tenant-2' }));

      const accounts = manager.getTenantAccounts('tenant-1');
      expect(accounts).toHaveLength(1);
      expect(accounts[0].tenantId).toBe('tenant-1');
    });

    it('should get surface accounts', () => {
      manager.addAccount(createTestAccount({ id: 'account-1', surfaceId: 'linkedin-jobs' as SurfaceId }));
      manager.addAccount(createTestAccount({ id: 'account-2', surfaceId: 'indeed-jobs' as SurfaceId }));

      const accounts = manager.getSurfaceAccounts('linkedin-jobs' as SurfaceId);
      expect(accounts).toHaveLength(1);
      expect(accounts[0].surfaceId).toBe('linkedin-jobs');
    });

    it('should update an account', () => {
      manager.addAccount(createTestAccount({ id: 'account-1', name: 'Original' }));

      const updated = manager.updateAccount('account-1', { name: 'Updated' });
      expect(updated).toBe(true);

      const account = manager.getAccount('account-1');
      expect(account!.name).toBe('Updated');
    });

    it('should set account status', () => {
      manager.addAccount(createTestAccount({ id: 'account-1', status: 'active' }));

      manager.setAccountStatus('account-1', 'suspended');

      const account = manager.getAccount('account-1');
      expect(account!.status).toBe('suspended');
    });

    it('should enable an account', () => {
      manager.addAccount(createTestAccount({ id: 'account-1', enabled: false }));

      manager.enableAccount('account-1');

      const account = manager.getAccount('account-1');
      expect(account!.enabled).toBe(true);
    });

    it('should disable an account', () => {
      manager.addAccount(createTestAccount({ id: 'account-1', enabled: true }));

      manager.disableAccount('account-1');

      const account = manager.getAccount('account-1');
      expect(account!.enabled).toBe(false);
    });
  });

  describe('pool management', () => {
    it('should create a pool', () => {
      const pool: AccountPool = {
        id: 'pool-1',
        surfaceId: 'linkedin-jobs' as SurfaceId,
        accountIds: [],
        tenantId: 'tenant-1',
      };

      manager.createPool(pool);

      const retrieved = manager.getPool('pool-1');
      expect(retrieved).toEqual(pool);
    });

    it('should get pools for a surface', () => {
      manager.createPool({
        id: 'pool-1',
        surfaceId: 'linkedin-jobs' as SurfaceId,
        accountIds: [],
        tenantId: 'tenant-1',
      });

      manager.createPool({
        id: 'pool-2',
        surfaceId: 'indeed-jobs' as SurfaceId,
        accountIds: [],
        tenantId: 'tenant-1',
      });

      const pools = manager.getSurfacePools('linkedin-jobs' as SurfaceId);
      expect(pools).toHaveLength(1);
    });

    it('should remove a pool', () => {
      manager.createPool({
        id: 'pool-1',
        surfaceId: 'linkedin-jobs' as SurfaceId,
        accountIds: [],
        tenantId: 'tenant-1',
      });

      const removed = manager.removePool('pool-1');
      expect(removed).toBe(true);
      expect(manager.getPool('pool-1')).toBeUndefined();
    });

    it('should add account to pool', () => {
      manager.addAccount(createTestAccount({ id: 'account-1', surfaceId: 'linkedin-jobs' as SurfaceId }));
      manager.createPool({
        id: 'pool-1',
        surfaceId: 'linkedin-jobs' as SurfaceId,
        accountIds: [],
        tenantId: 'tenant-1',
      });

      const added = manager.addToPool('pool-1', 'account-1');
      expect(added).toBe(true);

      const pool = manager.getPool('pool-1');
      expect(pool!.accountIds).toContain('account-1');
    });

    it('should not add account with wrong surface to pool', () => {
      manager.addAccount(createTestAccount({ id: 'account-1', surfaceId: 'indeed-jobs' as SurfaceId }));
      manager.createPool({
        id: 'pool-1',
        surfaceId: 'linkedin-jobs' as SurfaceId,
        accountIds: [],
        tenantId: 'tenant-1',
      });

      const added = manager.addToPool('pool-1', 'account-1');
      expect(added).toBe(false);
    });

    it('should remove account from pool', () => {
      manager.addAccount(createTestAccount({ id: 'account-1', surfaceId: 'linkedin-jobs' as SurfaceId }));
      manager.createPool({
        id: 'pool-1',
        surfaceId: 'linkedin-jobs' as SurfaceId,
        accountIds: ['account-1'],
        tenantId: 'tenant-1',
      });

      const removed = manager.removeFromPool('pool-1', 'account-1');
      expect(removed).toBe(true);

      const pool = manager.getPool('pool-1');
      expect(pool!.accountIds).not.toContain('account-1');
    });

    it('should remove account from pools when account is deleted', () => {
      manager.addAccount(createTestAccount({ id: 'account-1', surfaceId: 'linkedin-jobs' as SurfaceId }));
      manager.createPool({
        id: 'pool-1',
        surfaceId: 'linkedin-jobs' as SurfaceId,
        accountIds: ['account-1'],
        tenantId: 'tenant-1',
      });

      manager.removeAccount('account-1');

      const pool = manager.getPool('pool-1');
      expect(pool!.accountIds).not.toContain('account-1');
    });
  });

  describe('checkout/checkin', () => {
    beforeEach(() => {
      manager.addAccount(createTestAccount({
        id: 'account-1',
        surfaceId: 'linkedin-jobs' as SurfaceId,
        tenantId: 'tenant-1',
      }));
      manager.addAccount(createTestAccount({
        id: 'account-2',
        surfaceId: 'linkedin-jobs' as SurfaceId,
        tenantId: 'tenant-1',
      }));
    });

    it('should checkout an account', () => {
      const checkout = manager.checkout({
        surfaceId: 'linkedin-jobs' as SurfaceId,
        tenantId: 'tenant-1',
      });

      expect(checkout).toBeDefined();
      expect(checkout!.id).toBeDefined();
      expect(checkout!.account).toBeDefined();
      expect(checkout!.expiresAt).toBeInstanceOf(Date);
    });

    it('should update usage on checkout', () => {
      const checkout = manager.checkout({
        surfaceId: 'linkedin-jobs' as SurfaceId,
        tenantId: 'tenant-1',
      });

      const usage = manager.getUsage(checkout!.account.id);
      expect(usage!.activeSessions).toBe(1);
      expect(usage!.lastUsedAt).toBeDefined();
    });

    it('should checkin an account', () => {
      const checkout = manager.checkout({
        surfaceId: 'linkedin-jobs' as SurfaceId,
        tenantId: 'tenant-1',
      });

      const checkedIn = manager.checkin(checkout!.id, { success: true });
      expect(checkedIn).toBe(true);

      const usage = manager.getUsage(checkout!.account.id);
      expect(usage!.activeSessions).toBe(0);
      expect(usage!.requestCount).toBe(1);
      expect(usage!.successCount).toBe(1);
    });

    it('should track failed checkin', () => {
      const checkout = manager.checkout({
        surfaceId: 'linkedin-jobs' as SurfaceId,
        tenantId: 'tenant-1',
      });

      manager.checkin(checkout!.id, { success: false });

      const usage = manager.getUsage(checkout!.account.id);
      expect(usage!.failedCount).toBe(1);
    });

    it('should return undefined when no accounts available', () => {
      manager.disableAccount('account-1');
      manager.disableAccount('account-2');

      const checkout = manager.checkout({
        surfaceId: 'linkedin-jobs' as SurfaceId,
        tenantId: 'tenant-1',
      });

      expect(checkout).toBeUndefined();
    });

    it('should exclude specified accounts', () => {
      const checkout = manager.checkout({
        surfaceId: 'linkedin-jobs' as SurfaceId,
        tenantId: 'tenant-1',
        exclude: ['account-1'],
      });

      expect(checkout!.account.id).toBe('account-2');
    });

    it('should prefer specified accounts', () => {
      const checkout = manager.checkout({
        surfaceId: 'linkedin-jobs' as SurfaceId,
        tenantId: 'tenant-1',
        prefer: ['account-2'],
      });

      expect(checkout!.account.id).toBe('account-2');
    });

    it('should select from pool when specified', () => {
      manager.createPool({
        id: 'pool-1',
        surfaceId: 'linkedin-jobs' as SurfaceId,
        accountIds: ['account-1'],
        tenantId: 'tenant-1',
      });

      const checkout = manager.checkout({
        surfaceId: 'linkedin-jobs' as SurfaceId,
        tenantId: 'tenant-1',
        poolId: 'pool-1',
      });

      expect(checkout!.account.id).toBe('account-1');
    });

    it('should get checkout by ID', () => {
      const checkout = manager.checkout({
        surfaceId: 'linkedin-jobs' as SurfaceId,
        tenantId: 'tenant-1',
      });

      const retrieved = manager.getCheckout(checkout!.id);
      expect(retrieved).toEqual(checkout);
    });

    it('should get active checkouts', () => {
      manager.checkout({
        surfaceId: 'linkedin-jobs' as SurfaceId,
        tenantId: 'tenant-1',
      });

      manager.checkout({
        surfaceId: 'linkedin-jobs' as SurfaceId,
        tenantId: 'tenant-1',
      });

      const checkouts = manager.getActiveCheckouts();
      expect(checkouts).toHaveLength(2);
    });
  });

  describe('availability', () => {
    beforeEach(() => {
      manager.addAccount(createTestAccount({ id: 'account-1' }));
    });

    it('should return true for available account', () => {
      expect(manager.isAvailable('account-1')).toBe(true);
    });

    it('should return false for disabled account', () => {
      manager.disableAccount('account-1');
      expect(manager.isAvailable('account-1')).toBe(false);
    });

    it('should return false for suspended account', () => {
      manager.setAccountStatus('account-1', 'suspended');
      expect(manager.isAvailable('account-1')).toBe(false);
    });

    it('should return false for account in cooldown', () => {
      const usage = manager.getUsage('account-1');
      usage!.cooldownEndsAt = new Date(Date.now() + 60000);

      expect(manager.isAvailable('account-1')).toBe(false);
    });

    it('should return false when max concurrent reached', () => {
      manager.updateAccount('account-1', { maxConcurrent: 1 });

      const usage = manager.getUsage('account-1');
      usage!.activeSessions = 1;

      expect(manager.isAvailable('account-1')).toBe(false);
    });
  });

  describe('health checks', () => {
    beforeEach(() => {
      manager.addAccount(createTestAccount({ id: 'account-1', status: 'active' }));
    });

    it('should update status based on health check', () => {
      manager.reportHealthCheck({
        accountId: 'account-1',
        timestamp: new Date(),
        healthy: false,
        error: 'Credentials invalid',
        recommendedStatus: 'invalid',
      });

      const account = manager.getAccount('account-1');
      expect(account!.status).toBe('invalid');
    });

    it('should restore status when healthy', () => {
      manager.setAccountStatus('account-1', 'invalid');

      manager.reportHealthCheck({
        accountId: 'account-1',
        timestamp: new Date(),
        healthy: true,
        recommendedStatus: 'active',
      });

      const account = manager.getAccount('account-1');
      expect(account!.status).toBe('active');
    });
  });

  describe('usage tracking', () => {
    beforeEach(() => {
      manager.addAccount(createTestAccount({ id: 'account-1' }));
    });

    it('should get usage record', () => {
      const usage = manager.getUsage('account-1');
      expect(usage).toBeDefined();
      expect(usage!.accountId).toBe('account-1');
    });

    it('should get all usage records', () => {
      manager.addAccount(createTestAccount({ id: 'account-2' }));

      const usages = manager.getAllUsage();
      expect(usages).toHaveLength(2);
    });

    it('should reset usage records', () => {
      const checkout = manager.checkout({
        surfaceId: 'linkedin-jobs' as SurfaceId,
        tenantId: 'tenant-1',
      });
      manager.checkin(checkout!.id);

      expect(manager.getUsage('account-1')!.requestCount).toBe(1);

      manager.resetUsage();

      expect(manager.getUsage('account-1')!.requestCount).toBe(0);
    });
  });

  describe('statistics', () => {
    it('should return correct statistics', () => {
      manager.addAccount(createTestAccount({
        id: 'account-1',
        status: 'active',
        surfaceId: 'linkedin-jobs' as SurfaceId,
      }));
      manager.addAccount(createTestAccount({
        id: 'account-2',
        status: 'suspended',
        surfaceId: 'indeed-jobs' as SurfaceId,
      }));
      manager.createPool({
        id: 'pool-1',
        surfaceId: 'linkedin-jobs' as SurfaceId,
        accountIds: [],
        tenantId: 'tenant-1',
      });

      const stats = manager.getStats();
      expect(stats.totalAccounts).toBe(2);
      expect(stats.activeAccounts).toBe(1);
      expect(stats.unavailableAccounts).toBe(1);
      expect(stats.totalPools).toBe(1);
      expect(stats.byStatus.active).toBe(1);
      expect(stats.byStatus.suspended).toBe(1);
      expect(stats.bySurface['linkedin-jobs']).toBe(1);
      expect(stats.bySurface['indeed-jobs']).toBe(1);
    });
  });

  describe('cleanup', () => {
    it('should cleanup expired checkouts', async () => {
      manager.addAccount(createTestAccount({ id: 'account-1' }));

      // Create checkout with short duration (1 second)
      manager.checkout({
        surfaceId: 'linkedin-jobs' as SurfaceId,
        tenantId: 'tenant-1',
        sessionDuration: 1,
      });

      // Should have 1 active checkout
      expect(manager.getActiveCheckouts()).toHaveLength(1);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Checkout should now be expired, cleanup should find and remove it
      const cleaned = manager.cleanupExpiredCheckouts();
      expect(cleaned).toBe(1);
      expect(manager.getActiveCheckouts()).toHaveLength(0);
    });
  });

  describe('clear', () => {
    it('should clear all data', () => {
      manager.addAccount(createTestAccount({ id: 'account-1' }));
      manager.createPool({
        id: 'pool-1',
        surfaceId: 'linkedin-jobs' as SurfaceId,
        accountIds: [],
        tenantId: 'tenant-1',
      });
      manager.checkout({
        surfaceId: 'linkedin-jobs' as SurfaceId,
        tenantId: 'tenant-1',
      });

      manager.clear();

      expect(manager.getAllAccounts()).toHaveLength(0);
      expect(manager.getPool('pool-1')).toBeUndefined();
      expect(manager.getActiveCheckouts()).toHaveLength(0);
    });
  });
});

describe('createAccountManager', () => {
  it('should create a new manager instance', () => {
    const manager = createAccountManager({ autoCleanup: false });
    expect(manager).toBeInstanceOf(AccountManager);
    manager.clear();
  });

  it('should accept config', () => {
    const manager = createAccountManager({
      defaultCooldownSeconds: 60,
      autoCleanup: false,
    });
    expect(manager).toBeInstanceOf(AccountManager);
    manager.clear();
  });
});
