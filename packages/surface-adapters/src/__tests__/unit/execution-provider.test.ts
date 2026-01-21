/**
 * Execution Provider Tests
 *
 * Tests for the execution provider abstraction layer.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  InHouseExecutionProvider,
  createInHouseProvider,
  DEFAULT_FAILOVER_CONFIG,
} from '../../providers/index';
import type {
  ExecutionRequest,
  AdapterRegistry,
} from '../../providers/index';
import type { SurfaceAdapter, SurfaceQueryResponse } from '../../types';

// Mock adapter
function createMockAdapter(
  surfaceId: string,
  options: { shouldFail?: boolean; latencyMs?: number } = {}
): SurfaceAdapter {
  return {
    metadata: {
      id: surfaceId,
      name: `Mock ${surfaceId}`,
      category: 'api',
      authRequirement: 'api_key',
      baseUrl: 'https://mock.api',
      capabilities: {
        streaming: false,
        systemPrompts: true,
        conversationHistory: false,
        fileUploads: false,
        modelSelection: false,
        responseFormat: false,
      },
      enabled: true,
    },
    query: vi.fn().mockImplementation(async () => {
      if (options.latencyMs) {
        await new Promise((r) => setTimeout(r, options.latencyMs));
      }
      if (options.shouldFail) {
        throw new Error('Mock adapter failure');
      }
      return {
        success: true,
        responseText: 'Mock response',
        timing: {
          totalMs: options.latencyMs ?? 100,
          responseMs: options.latencyMs ?? 100,
        },
      } as SurfaceQueryResponse;
    }),
    healthCheck: vi.fn().mockResolvedValue({
      healthy: true,
      latencyMs: 50,
      failureCount: 0,
    }),
    getRateLimitStatus: vi.fn().mockReturnValue({
      currentCount: 0,
      maxCount: 100,
      isLimited: false,
    }),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

// Mock adapter registry
function createMockRegistry(
  adapters: Record<string, SurfaceAdapter>
): AdapterRegistry {
  return {
    get: (id: string) => adapters[id],
    list: () => Object.keys(adapters),
    has: (id: string) => id in adapters,
  };
}

describe('InHouseExecutionProvider', () => {
  let provider: InHouseExecutionProvider;
  let mockAdapter: SurfaceAdapter;
  let registry: AdapterRegistry;

  beforeEach(() => {
    mockAdapter = createMockAdapter('openai-api');
    registry = createMockRegistry({ 'openai-api': mockAdapter });
    provider = createInHouseProvider({
      adapterRegistry: registry,
      defaultTimeoutMs: 30000,
    });
  });

  describe('initialization', () => {
    it('should have correct name', () => {
      expect(provider.name).toBe('in-house');
    });

    it('should initialize without error', async () => {
      await expect(provider.initialize()).resolves.not.toThrow();
    });

    it('should support surfaces in registry', () => {
      expect(provider.supportsSurface('openai-api')).toBe(true);
      expect(provider.supportsSurface('unknown-surface')).toBe(false);
    });
  });

  describe('execute', () => {
    it('should execute query successfully', async () => {
      const request: ExecutionRequest = {
        surfaceId: 'openai-api',
        query: {
          query: 'What is 2+2?',
        },
      };

      const result = await provider.execute(request);

      expect(result.success).toBe(true);
      expect(result.response?.responseText).toBe('Mock response');
      expect(result.metadata.provider).toBe('in-house');
      expect(result.metadata.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should return error for unsupported surface', async () => {
      const request: ExecutionRequest = {
        surfaceId: 'unknown-surface',
        query: { query: 'test' },
      };

      const result = await provider.execute(request);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('UNSUPPORTED_SURFACE');
      expect(result.error?.isRetryable).toBe(false);
    });

    it('should handle adapter failures', async () => {
      const failingAdapter = createMockAdapter('failing-api', {
        shouldFail: true,
      });
      const failRegistry = createMockRegistry({ 'failing-api': failingAdapter });
      const failProvider = createInHouseProvider({
        adapterRegistry: failRegistry,
      });

      const request: ExecutionRequest = {
        surfaceId: 'failing-api',
        query: { query: 'test' },
      };

      const result = await failProvider.execute(request);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('EXECUTION_ERROR');
      expect(result.error?.message).toContain('Mock adapter failure');
    });

    it('should include location in metadata', async () => {
      const request: ExecutionRequest = {
        surfaceId: 'openai-api',
        query: { query: 'test' },
        location: { country: 'US', city: 'New York' },
      };

      const result = await provider.execute(request);

      expect(result.metadata.locationUsed).toBe('New York');
    });

    it('should include proxy in metadata', async () => {
      const request: ExecutionRequest = {
        surfaceId: 'openai-api',
        query: { query: 'test' },
        proxy: { host: 'proxy.example.com', port: 8080 },
      };

      const result = await provider.execute(request);

      expect(result.metadata.proxyUsed).toBe('proxy.example.com');
    });
  });

  describe('health tracking', () => {
    it('should track success rate', async () => {
      // Execute 3 successful queries
      for (let i = 0; i < 3; i++) {
        await provider.execute({
          surfaceId: 'openai-api',
          query: { query: 'test' },
        });
      }

      const health = await provider.getHealth();

      expect(health.successRate).toBe(1);
      expect(health.queriesInWindow).toBe(3);
      expect(health.healthy).toBe(true);
    });

    it('should report unhealthy when success rate drops', async () => {
      // Create provider with failing adapter
      const failingAdapter = createMockAdapter('test-api', { shouldFail: true });
      const failRegistry = createMockRegistry({ 'test-api': failingAdapter });
      const failProvider = createInHouseProvider({
        adapterRegistry: failRegistry,
      });

      // Execute 5 failing queries
      for (let i = 0; i < 5; i++) {
        await failProvider.execute({
          surfaceId: 'test-api',
          query: { query: 'test' },
        });
      }

      const health = await failProvider.getHealth();

      expect(health.successRate).toBe(0);
      expect(health.healthy).toBe(false);
      expect(health.lastError).toBeDefined();
    });

    it('should list supported surfaces', async () => {
      const multiRegistry = createMockRegistry({
        'openai-api': createMockAdapter('openai-api'),
        'anthropic-api': createMockAdapter('anthropic-api'),
        'chatgpt-web': createMockAdapter('chatgpt-web'),
      });
      const multiProvider = createInHouseProvider({
        adapterRegistry: multiRegistry,
      });

      const health = await multiProvider.getHealth();

      expect(health.supportedSurfaces).toContain('openai-api');
      expect(health.supportedSurfaces).toContain('anthropic-api');
      expect(health.supportedSurfaces).toContain('chatgpt-web');
    });
  });

  describe('cost estimation', () => {
    it('should estimate lower cost for API surfaces', () => {
      const apiCost = provider.estimateCost({
        surfaceId: 'openai-api',
        query: { query: 'test' },
      });

      expect(apiCost).toBeLessThan(0.01);
    });

    it('should estimate higher cost for web surfaces', () => {
      const webRegistry = createMockRegistry({
        'chatgpt-web': createMockAdapter('chatgpt-web'),
      });
      const webProvider = createInHouseProvider({
        adapterRegistry: webRegistry,
      });

      const webCost = webProvider.estimateCost({
        surfaceId: 'chatgpt-web',
        query: { query: 'test' },
      });

      expect(webCost).toBeGreaterThanOrEqual(0.01);
    });
  });

  describe('shutdown', () => {
    it('should close all adapters on shutdown', async () => {
      await provider.shutdown();

      expect(mockAdapter.close).toHaveBeenCalled();
    });
  });
});

describe('DEFAULT_FAILOVER_CONFIG', () => {
  it('should have reasonable defaults', () => {
    expect(DEFAULT_FAILOVER_CONFIG.enabled).toBe(true);
    expect(DEFAULT_FAILOVER_CONFIG.successRateThreshold).toBe(0.7);
    expect(DEFAULT_FAILOVER_CONFIG.consecutiveFailureThreshold).toBe(3);
    expect(DEFAULT_FAILOVER_CONFIG.windowMs).toBe(5 * 60 * 1000);
    expect(DEFAULT_FAILOVER_CONFIG.cooldownMs).toBe(15 * 60 * 1000);
  });
});
