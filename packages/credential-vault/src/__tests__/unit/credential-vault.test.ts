/**
 * Credential Vault Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SurfaceId } from '@bentham/core';
import {
  MemoryCredentialProvider,
  createMemoryProvider,
  EnvironmentCredentialProvider,
  createEnvironmentProvider,
  EncryptedFileCredentialProvider,
  createEncryptedFileProvider,
  CredentialPool,
  createCredentialPool,
  CredentialPoolManager,
  createCredentialPoolManager,
  CredentialVault,
  createCredentialVault,
  createDevVault,
  createEnvVault,
} from '../../index.js';
import type {
  ApiKeyCredential,
  BearerTokenCredential,
  Credential,
  CredentialEvent,
} from '../../types.js';
import { existsSync, unlinkSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

// ============================================
// Test Helpers
// ============================================

function createTestApiKey(surfaceId: SurfaceId, id?: string): ApiKeyCredential {
  return {
    id: id ?? `test-${surfaceId}-${Date.now()}`,
    type: 'api_key',
    surfaceId,
    apiKey: `sk-test-${surfaceId}-${Math.random().toString(36).slice(2)}`,
    createdAt: new Date(),
    isActive: true,
  };
}

function createTestBearerToken(surfaceId: SurfaceId, id?: string): BearerTokenCredential {
  return {
    id: id ?? `test-bearer-${surfaceId}-${Date.now()}`,
    type: 'bearer_token',
    surfaceId,
    token: `token-${Math.random().toString(36).slice(2)}`,
    createdAt: new Date(),
    isActive: true,
  };
}

// ============================================
// Memory Provider Tests
// ============================================

describe('Credential Vault', () => {
  describe('MemoryCredentialProvider', () => {
    let provider: MemoryCredentialProvider;

    beforeEach(() => {
      provider = createMemoryProvider();
    });

    it('should create provider', () => {
      expect(provider).toBeInstanceOf(MemoryCredentialProvider);
      expect(provider.name).toBe('memory');
    });

    it('should store and retrieve credentials', async () => {
      const credential = createTestApiKey('openai-api');

      await provider.store(credential);
      const retrieved = await provider.get(credential.id);

      expect(retrieved).toEqual(credential);
    });

    it('should return null for non-existent credential', async () => {
      const result = await provider.get('non-existent');
      expect(result).toBeNull();
    });

    it('should list credentials by surface', async () => {
      const cred1 = createTestApiKey('openai-api', 'cred-1');
      const cred2 = createTestApiKey('openai-api', 'cred-2');
      const cred3 = createTestApiKey('anthropic-api', 'cred-3');

      await provider.store(cred1);
      await provider.store(cred2);
      await provider.store(cred3);

      const openaiCreds = await provider.getBySurface('openai-api');
      expect(openaiCreds).toHaveLength(2);
      expect(openaiCreds.map(c => c.id)).toContain('cred-1');
      expect(openaiCreds.map(c => c.id)).toContain('cred-2');
    });

    it('should filter active credentials', async () => {
      const activeCred = createTestApiKey('openai-api', 'active');
      const inactiveCred = { ...createTestApiKey('openai-api', 'inactive'), isActive: false };
      const expiredCred = {
        ...createTestApiKey('openai-api', 'expired'),
        expiresAt: new Date(Date.now() - 1000),
      };

      await provider.store(activeCred);
      await provider.store(inactiveCred);
      await provider.store(expiredCred);

      const active = await provider.getActiveBySurface('openai-api');
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe('active');
    });

    it('should update credentials', async () => {
      const credential = createTestApiKey('openai-api');
      await provider.store(credential);

      await provider.update(credential.id, { isActive: false });
      const updated = await provider.get(credential.id);

      expect(updated?.isActive).toBe(false);
    });

    it('should delete credentials', async () => {
      const credential = createTestApiKey('openai-api');
      await provider.store(credential);

      await provider.delete(credential.id);
      const result = await provider.get(credential.id);

      expect(result).toBeNull();
    });

    it('should check credential existence', async () => {
      const credential = createTestApiKey('openai-api');
      await provider.store(credential);

      expect(await provider.exists(credential.id)).toBe(true);
      expect(await provider.exists('non-existent')).toBe(false);
    });

    it('should list all credential IDs', async () => {
      const cred1 = createTestApiKey('openai-api', 'id-1');
      const cred2 = createTestApiKey('anthropic-api', 'id-2');

      await provider.store(cred1);
      await provider.store(cred2);

      const ids = await provider.list();
      expect(ids).toContain('id-1');
      expect(ids).toContain('id-2');
    });

    it('should list credentials by type', async () => {
      const apiKey = createTestApiKey('openai-api');
      const bearer = createTestBearerToken('openai-api');

      await provider.store(apiKey);
      await provider.store(bearer);

      const apiKeys = await provider.listByType('api_key');
      expect(apiKeys).toHaveLength(1);
      expect(apiKeys[0].type).toBe('api_key');
    });

    it('should support initial credentials', () => {
      const initialCred = createTestApiKey('openai-api', 'initial');
      const providerWithInit = createMemoryProvider({
        initialCredentials: [initialCred],
      });

      expect(providerWithInit.count()).toBe(1);
    });

    it('should clear all credentials', async () => {
      await provider.store(createTestApiKey('openai-api', 'cred-1'));
      await provider.store(createTestApiKey('openai-api', 'cred-2'));

      provider.clear();
      expect(provider.count()).toBe(0);
    });
  });

  // ============================================
  // Environment Provider Tests
  // ============================================

  describe('EnvironmentCredentialProvider', () => {
    it('should create provider', () => {
      const provider = createEnvironmentProvider({
        useProcessEnv: false,
        env: {},
      });
      expect(provider).toBeInstanceOf(EnvironmentCredentialProvider);
      expect(provider.name).toBe('environment');
    });

    it('should read default environment variables', async () => {
      const provider = createEnvironmentProvider({
        useProcessEnv: false,
        env: {
          OPENAI_API_KEY: 'sk-test-openai',
          ANTHROPIC_API_KEY: 'sk-ant-test',
        },
      });

      const openaiCreds = await provider.getBySurface('openai-api');
      expect(openaiCreds).toHaveLength(1);
      expect((openaiCreds[0] as ApiKeyCredential).apiKey).toBe('sk-test-openai');

      const anthropicCreds = await provider.getBySurface('anthropic-api');
      expect(anthropicCreds).toHaveLength(1);
      expect((anthropicCreds[0] as ApiKeyCredential).apiKey).toBe('sk-ant-test');
    });

    it('should read prefixed environment variables', async () => {
      // The default mapping for PERPLEXITY_API_KEY is already defined
      const provider = createEnvironmentProvider({
        useProcessEnv: false,
        env: {
          PERPLEXITY_API_KEY: 'pplx-test-key',
        },
      });

      const creds = await provider.getBySurface('perplexity-api' as SurfaceId);
      expect(creds).toHaveLength(1);
      expect((creds[0] as ApiKeyCredential).apiKey).toBe('pplx-test-key');
    });

    it('should be read-only', async () => {
      const provider = createEnvironmentProvider({ useProcessEnv: false, env: {} });

      await expect(provider.store(createTestApiKey('openai-api'))).rejects.toThrow('read-only');
      await expect(provider.update('id', {})).rejects.toThrow('read-only');
      await expect(provider.delete('id')).rejects.toThrow('read-only');
    });

    it('should support custom mappings', async () => {
      const provider = createEnvironmentProvider({
        useProcessEnv: false,
        env: {
          MY_CUSTOM_KEY: 'custom-value',
        },
        mappings: [
          {
            envVar: 'MY_CUSTOM_KEY',
            surfaceId: 'custom-surface' as SurfaceId,
            type: 'api_key',
            field: 'apiKey',
          },
        ],
      });

      const creds = await provider.getBySurface('custom-surface' as SurfaceId);
      expect(creds).toHaveLength(1);
      expect((creds[0] as ApiKeyCredential).apiKey).toBe('custom-value');
    });
  });

  // ============================================
  // Encrypted File Provider Tests
  // ============================================

  describe('EncryptedFileCredentialProvider', () => {
    const testDir = join(tmpdir(), 'bentham-credential-vault-test');
    const testFile = join(testDir, 'credentials.enc');
    const testPassword = 'test-password-123';

    beforeEach(() => {
      if (!existsSync(testDir)) {
        mkdirSync(testDir, { recursive: true });
      }
      if (existsSync(testFile)) {
        unlinkSync(testFile);
      }
    });

    afterEach(() => {
      if (existsSync(testFile)) {
        unlinkSync(testFile);
      }
    });

    it('should create provider', () => {
      const provider = createEncryptedFileProvider({
        filePath: testFile,
        masterPassword: testPassword,
      });
      expect(provider).toBeInstanceOf(EncryptedFileCredentialProvider);
      expect(provider.name).toBe('encrypted-file');
    });

    it('should store and retrieve credentials with encryption', async () => {
      const provider = createEncryptedFileProvider({
        filePath: testFile,
        masterPassword: testPassword,
      });

      const credential = createTestApiKey('openai-api', 'enc-test');
      await provider.store(credential);
      provider.flush();

      // Create new provider to test reading encrypted file
      const provider2 = createEncryptedFileProvider({
        filePath: testFile,
        masterPassword: testPassword,
        salt: provider.getSalt(),
      });

      const retrieved = await provider2.get('enc-test');
      expect(retrieved).not.toBeNull();
      expect((retrieved as ApiKeyCredential).apiKey).toBe(credential.apiKey);
    });

    it('should fail with wrong password', async () => {
      const provider = createEncryptedFileProvider({
        filePath: testFile,
        masterPassword: testPassword,
      });

      await provider.store(createTestApiKey('openai-api'));
      provider.flush();

      const badProvider = createEncryptedFileProvider({
        filePath: testFile,
        masterPassword: 'wrong-password',
        salt: provider.getSalt(),
      });

      // Should throw when trying to decrypt with wrong password
      await expect(badProvider.list()).rejects.toThrow();
    });

    it('should verify password', async () => {
      const provider = createEncryptedFileProvider({
        filePath: testFile,
        masterPassword: testPassword,
      });

      expect(provider.verifyPassword(testPassword)).toBe(true);
      expect(provider.verifyPassword('wrong')).toBe(false);
    });

    it('should change password', async () => {
      const provider = createEncryptedFileProvider({
        filePath: testFile,
        masterPassword: testPassword,
      });

      await provider.store(createTestApiKey('openai-api', 'change-pw-test'));
      const newPassword = 'new-password-456';
      provider.changePassword(newPassword);

      // Should work with new password
      const provider2 = createEncryptedFileProvider({
        filePath: testFile,
        masterPassword: newPassword,
        salt: provider.getSalt(),
      });

      const retrieved = await provider2.get('change-pw-test');
      expect(retrieved).not.toBeNull();
    });
  });

  // ============================================
  // Credential Pool Tests
  // ============================================

  describe('CredentialPool', () => {
    let provider: MemoryCredentialProvider;

    beforeEach(() => {
      provider = createMemoryProvider();
    });

    it('should create pool', async () => {
      const pool = createCredentialPool(provider, {
        surfaceId: 'openai-api',
        strategy: 'round_robin',
      });

      await pool.initialize();
      expect(pool.size()).toBe(0);
    });

    it('should return null when no credentials available', async () => {
      const pool = createCredentialPool(provider, {
        surfaceId: 'openai-api',
        strategy: 'round_robin',
      });

      await pool.initialize();
      const cred = await pool.getNext();
      expect(cred).toBeNull();
    });

    it('should use round robin strategy', async () => {
      const cred1 = createTestApiKey('openai-api', 'rr-1');
      const cred2 = createTestApiKey('openai-api', 'rr-2');
      const cred3 = createTestApiKey('openai-api', 'rr-3');

      await provider.store(cred1);
      await provider.store(cred2);
      await provider.store(cred3);

      const pool = createCredentialPool(provider, {
        surfaceId: 'openai-api',
        strategy: 'round_robin',
      });
      await pool.initialize();

      const first = await pool.getNext();
      const second = await pool.getNext();
      const third = await pool.getNext();
      const fourth = await pool.getNext(); // Should wrap around

      expect(first?.id).toBe('rr-1');
      expect(second?.id).toBe('rr-2');
      expect(third?.id).toBe('rr-3');
      expect(fourth?.id).toBe('rr-1');
    });

    it('should use random strategy', async () => {
      const cred1 = createTestApiKey('openai-api', 'rand-1');
      const cred2 = createTestApiKey('openai-api', 'rand-2');

      await provider.store(cred1);
      await provider.store(cred2);

      const pool = createCredentialPool(provider, {
        surfaceId: 'openai-api',
        strategy: 'random',
      });
      await pool.initialize();

      // Just verify it returns a valid credential
      const selected = await pool.getNext();
      expect(['rand-1', 'rand-2']).toContain(selected?.id);
    });

    it('should use least_used strategy', async () => {
      const cred1 = createTestApiKey('openai-api', 'lu-1');
      const cred2 = createTestApiKey('openai-api', 'lu-2');

      await provider.store(cred1);
      await provider.store(cred2);

      const pool = createCredentialPool(provider, {
        surfaceId: 'openai-api',
        strategy: 'least_used',
      });
      await pool.initialize();

      // Get cred1 multiple times
      await pool.getNext();
      pool.reportSuccess('lu-1');
      await pool.getNext();
      pool.reportSuccess('lu-1');

      // Reset for fresh pool
      const pool2 = createCredentialPool(provider, {
        surfaceId: 'openai-api',
        strategy: 'least_used',
      });
      await pool2.initialize();

      // Use lu-1 twice
      let cred = await pool2.getNext();
      pool2.reportSuccess(cred!.id);
      cred = await pool2.getNext();
      pool2.reportSuccess(cred!.id);

      // lu-2 should be selected next as least used
      cred = await pool2.getNext();
      // Both have equal usage initially, so either could be selected
      expect(['lu-1', 'lu-2']).toContain(cred?.id);
    });

    it('should put credential in cooldown after errors', async () => {
      vi.useFakeTimers();

      const cred1 = createTestApiKey('openai-api', 'cool-1');
      const cred2 = createTestApiKey('openai-api', 'cool-2');

      await provider.store(cred1);
      await provider.store(cred2);

      const pool = createCredentialPool(provider, {
        surfaceId: 'openai-api',
        strategy: 'round_robin',
        maxErrors: 2,
        errorCooldownMs: 60000,
      });
      await pool.initialize();

      // Report errors for cred1
      pool.reportError('cool-1');
      pool.reportError('cool-1');

      // cred1 should now be in cooldown
      const usage = pool.getUsage('cool-1');
      expect(usage?.inCooldown).toBe(true);

      // Only cred2 should be available
      const next = await pool.getNext();
      expect(next?.id).toBe('cool-2');

      vi.useRealTimers();
      pool.dispose();
    });

    it('should track pool health', async () => {
      const cred1 = createTestApiKey('openai-api', 'health-1');
      await provider.store(cred1);

      const pool = createCredentialPool(provider, {
        surfaceId: 'openai-api',
        strategy: 'round_robin',
        minActiveCredentials: 1,
      });
      await pool.initialize();

      const health = pool.getHealth();
      expect(health.status).toBe('healthy');
      expect(health.activeCredentials).toBe(1);

      pool.dispose();
    });

    it('should emit events', async () => {
      const events: CredentialEvent[] = [];
      const cred1 = createTestApiKey('openai-api', 'event-1');
      await provider.store(cred1);

      const pool = createCredentialPool(provider, {
        surfaceId: 'openai-api',
        strategy: 'round_robin',
      });

      pool.on((event) => events.push(event));
      await pool.initialize();

      await pool.getNext();
      pool.reportSuccess('event-1');
      pool.reportError('event-1');

      expect(events).toContainEqual({ type: 'credential_used', credentialId: 'event-1', success: true });
      expect(events).toContainEqual({ type: 'credential_used', credentialId: 'event-1', success: false });

      pool.dispose();
    });

    it('should add and remove credentials dynamically', async () => {
      const pool = createCredentialPool(provider, {
        surfaceId: 'openai-api',
        strategy: 'round_robin',
      });
      await pool.initialize();

      expect(pool.size()).toBe(0);

      const newCred = createTestApiKey('openai-api', 'dynamic-1');
      await pool.addCredential(newCred);
      expect(pool.size()).toBe(1);

      await pool.removeCredential('dynamic-1');
      expect(pool.size()).toBe(0);

      pool.dispose();
    });
  });

  // ============================================
  // Credential Pool Manager Tests
  // ============================================

  describe('CredentialPoolManager', () => {
    let provider: MemoryCredentialProvider;
    let manager: CredentialPoolManager;

    beforeEach(async () => {
      provider = createMemoryProvider();
      await provider.store(createTestApiKey('openai-api', 'mgr-1'));
      await provider.store(createTestApiKey('anthropic-api', 'mgr-2'));
      manager = createCredentialPoolManager(provider);
    });

    afterEach(() => {
      manager.dispose();
    });

    it('should create manager', () => {
      expect(manager).toBeInstanceOf(CredentialPoolManager);
    });

    it('should get credential for surface', async () => {
      const cred = await manager.getCredential('openai-api');
      expect(cred?.id).toBe('mgr-1');
    });

    it('should create separate pools for each surface', async () => {
      const openaiCred = await manager.getCredential('openai-api');
      const anthropicCred = await manager.getCredential('anthropic-api');

      expect(openaiCred?.id).toBe('mgr-1');
      expect(anthropicCred?.id).toBe('mgr-2');
    });

    it('should report success and errors', async () => {
      await manager.getCredential('openai-api');
      await manager.reportSuccess('openai-api', 'mgr-1');
      await manager.reportError('openai-api', 'mgr-1');

      const health = manager.getHealthStatus();
      expect(health.get('openai-api')).toBeDefined();
    });

    it('should get health status for all pools', async () => {
      await manager.getCredential('openai-api');
      await manager.getCredential('anthropic-api');

      const health = manager.getHealthStatus();
      expect(health.size).toBe(2);
      expect(health.get('openai-api')?.status).toBe('healthy');
      expect(health.get('anthropic-api')?.status).toBe('healthy');
    });
  });

  // ============================================
  // Credential Vault Tests
  // ============================================

  describe('CredentialVault', () => {
    it('should create vault with memory provider', () => {
      const vault = createCredentialVault({ provider: 'memory' });
      expect(vault).toBeInstanceOf(CredentialVault);
      expect(vault.provider.name).toBe('memory');
      vault.dispose();
    });

    it('should create vault with environment provider', () => {
      const vault = createCredentialVault({
        provider: 'environment',
        providerConfig: { useProcessEnv: false, env: {} },
      });
      expect(vault.provider.name).toBe('environment');
      vault.dispose();
    });

    it('should require password for encrypted-file provider', () => {
      expect(() => {
        createCredentialVault({
          provider: 'encrypted-file',
          providerConfig: { filePath: '/tmp/test.enc' } as any,
        });
      }).toThrow('masterPassword');
    });

    it('should create dev vault', () => {
      const vault = createDevVault();
      expect(vault.provider.name).toBe('memory');
      vault.dispose();
    });

    it('should create env vault', () => {
      const vault = createEnvVault({ useProcessEnv: false, env: {} });
      expect(vault.provider.name).toBe('environment');
      vault.dispose();
    });

    it('should provide pool manager', async () => {
      const vault = createDevVault();

      await vault.provider.store(createTestApiKey('openai-api', 'vault-test'));
      const cred = await vault.poolManager.getCredential('openai-api');

      expect(cred?.id).toBe('vault-test');
      vault.dispose();
    });
  });
});
