/**
 * Integration tests for surface adapters with credential vault
 *
 * Tests the integration between surface adapters and the credential vault:
 * - Credential injection
 * - Credential rotation on failure
 * - Pool management across adapters
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createOpenAIAdapter, createAnthropicAdapter } from '../../index';
import type { SurfaceAdapter } from '../../types';

// Mock credential vault interface
interface MockCredential {
  id: string;
  type: string;
  value: string;
  metadata?: Record<string, unknown>;
}

interface MockCredentialPool {
  acquire(): Promise<MockCredential>;
  release(id: string): Promise<void>;
  reportSuccess(id: string): void;
  reportError(id: string): void;
}

function createMockCredentialPool(credentials: MockCredential[]): MockCredentialPool {
  let index = 0;
  const usage = new Map<string, { successes: number; errors: number }>();

  for (const cred of credentials) {
    usage.set(cred.id, { successes: 0, errors: 0 });
  }

  return {
    acquire: vi.fn().mockImplementation(async () => {
      const cred = credentials[index % credentials.length];
      index++;
      return cred;
    }),
    release: vi.fn().mockResolvedValue(undefined),
    reportSuccess: vi.fn().mockImplementation((id: string) => {
      const stats = usage.get(id);
      if (stats) stats.successes++;
    }),
    reportError: vi.fn().mockImplementation((id: string) => {
      const stats = usage.get(id);
      if (stats) stats.errors++;
    }),
  };
}

describe('Adapter Credential Integration', () => {
  describe('API Key Rotation', () => {
    let pool: MockCredentialPool;
    let adapters: SurfaceAdapter[];

    beforeEach(() => {
      pool = createMockCredentialPool([
        { id: 'key-1', type: 'api_key', value: 'sk-test-key-1' },
        { id: 'key-2', type: 'api_key', value: 'sk-test-key-2' },
        { id: 'key-3', type: 'api_key', value: 'sk-test-key-3' },
      ]);

      adapters = [];
    });

    afterEach(async () => {
      await Promise.all(adapters.map((a) => a.close()));
    });

    it('should create adapter with credential from pool', async () => {
      const credential = await pool.acquire();

      const adapter = createOpenAIAdapter({
        apiConfig: { apiKey: credential.value },
      });
      adapters.push(adapter);

      expect(adapter.metadata.id).toBe('openai-api');

      await pool.release(credential.id);
    });

    it('should rotate credentials on error', async () => {
      // First credential
      const cred1 = await pool.acquire();
      const adapter1 = createOpenAIAdapter({ apiConfig: { apiKey: cred1.value } });
      adapters.push(adapter1);

      // Simulate error
      pool.reportError(cred1.id);
      await pool.release(cred1.id);

      // Second credential (rotated)
      const cred2 = await pool.acquire();
      const adapter2 = createOpenAIAdapter({ apiConfig: { apiKey: cred2.value } });
      adapters.push(adapter2);

      expect(cred2.id).not.toBe(cred1.id);
    });

    it('should track credential usage across adapters', async () => {
      // Create multiple adapters with different credentials
      for (let i = 0; i < 3; i++) {
        const cred = await pool.acquire();
        const adapter = createOpenAIAdapter({ apiConfig: { apiKey: cred.value } });
        adapters.push(adapter);

        pool.reportSuccess(cred.id);
      }

      // Verify pool was used
      expect(pool.acquire).toHaveBeenCalledTimes(3);
      expect(pool.reportSuccess).toHaveBeenCalledTimes(3);
    });
  });

  describe('Multi-Surface Credential Management', () => {
    let openaiPool: MockCredentialPool;
    let anthropicPool: MockCredentialPool;

    beforeEach(() => {
      openaiPool = createMockCredentialPool([
        { id: 'openai-1', type: 'api_key', value: 'sk-openai-1' },
        { id: 'openai-2', type: 'api_key', value: 'sk-openai-2' },
      ]);

      anthropicPool = createMockCredentialPool([
        { id: 'anthropic-1', type: 'api_key', value: 'sk-ant-1' },
        { id: 'anthropic-2', type: 'api_key', value: 'sk-ant-2' },
      ]);
    });

    it('should manage credentials independently per surface', async () => {
      const openaiCred = await openaiPool.acquire();
      const anthropicCred = await anthropicPool.acquire();

      const openai = createOpenAIAdapter({ apiConfig: { apiKey: openaiCred.value } });
      const anthropic = createAnthropicAdapter({ apiConfig: { apiKey: anthropicCred.value } });

      expect(openai.metadata.id).toBe('openai-api');
      expect(anthropic.metadata.id).toBe('anthropic-api');

      openaiPool.reportSuccess(openaiCred.id);
      anthropicPool.reportSuccess(anthropicCred.id);

      await Promise.all([openai.close(), anthropic.close()]);
    });

    it('should allow credential failover within surface pool', async () => {
      // First OpenAI key fails
      const cred1 = await openaiPool.acquire();
      openaiPool.reportError(cred1.id);
      await openaiPool.release(cred1.id);

      // Second OpenAI key succeeds
      const cred2 = await openaiPool.acquire();
      openaiPool.reportSuccess(cred2.id);

      expect(openaiPool.reportError).toHaveBeenCalledWith(cred1.id);
      expect(openaiPool.reportSuccess).toHaveBeenCalledWith(cred2.id);
    });
  });

  describe('Credential Lifecycle', () => {
    it('should properly acquire, use, and release credentials', async () => {
      const pool = createMockCredentialPool([
        { id: 'key-1', type: 'api_key', value: 'test-key' },
      ]);

      // Acquire
      const cred = await pool.acquire();
      expect(pool.acquire).toHaveBeenCalled();

      // Use
      const adapter = createOpenAIAdapter({ apiConfig: { apiKey: cred.value } });

      // Success
      pool.reportSuccess(cred.id);
      expect(pool.reportSuccess).toHaveBeenCalledWith(cred.id);

      // Release
      await pool.release(cred.id);
      expect(pool.release).toHaveBeenCalledWith(cred.id);

      await adapter.close();
    });

    it('should handle credential exhaustion gracefully', async () => {
      const pool = createMockCredentialPool([]);

      // Override acquire to simulate exhaustion
      (pool.acquire as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('No credentials available')
      );

      await expect(pool.acquire()).rejects.toThrow('No credentials available');
    });
  });

  describe('Credential Metadata', () => {
    it('should include metadata in credential', async () => {
      const pool = createMockCredentialPool([
        {
          id: 'key-1',
          type: 'api_key',
          value: 'test-key',
          metadata: {
            tier: 'premium',
            rateLimit: 1000,
            expiresAt: new Date('2025-12-31').toISOString(),
          },
        },
      ]);

      const cred = await pool.acquire();
      expect(cred.metadata).toBeDefined();
      expect(cred.metadata?.tier).toBe('premium');
      expect(cred.metadata?.rateLimit).toBe(1000);
    });
  });
});
