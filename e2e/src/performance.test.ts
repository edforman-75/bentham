/**
 * Performance Tests
 *
 * Tests system performance under load:
 * - API gateway throughput
 * - Concurrent request handling
 * - Response time benchmarks
 * - Memory usage patterns
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createGateway, InMemoryApiKeyStore, hashApiKey, generateApiKey } from '@bentham/api-gateway';
import type { FastifyInstance } from 'fastify';
import type { Manifest } from '@bentham/core';

describe('Performance: API Gateway Throughput', () => {
  let gateway: FastifyInstance;
  let apiKeyStore: InMemoryApiKeyStore;
  let testApiKey: string;

  beforeEach(async () => {
    apiKeyStore = new InMemoryApiKeyStore();
    testApiKey = generateApiKey();
    apiKeyStore.addKey({
      id: 'perf-test-key',
      tenantId: 'tenant-perf',
      keyHash: hashApiKey(testApiKey),
      name: 'Performance Test Key',
      permissions: ['*'],
      rateLimit: 10000, // High limit for performance tests
      createdAt: new Date(),
    });

    const studyService = {
      createStudy: vi.fn(async () => ({
        studyId: `study_${Date.now()}`,
        status: 'validating' as const,
        createdAt: new Date(),
      })),
      getStudyStatus: vi.fn(async (_tenantId, studyId) => ({
        studyId,
        status: 'executing' as const,
        progress: { totalJobs: 100, completedJobs: 50, failedJobs: 0, pendingJobs: 50, completionPercentage: 50 },
        surfaces: [],
        createdAt: new Date(),
      })),
      getStudyResults: vi.fn(async () => null),
      cancelStudy: vi.fn(async () => true),
      pauseStudy: vi.fn(async () => true),
      resumeStudy: vi.fn(async () => true),
    };

    const healthService = {
      checkDatabase: vi.fn(async () => true),
      checkRedis: vi.fn(async () => true),
      checkOrchestrator: vi.fn(async () => true),
    };

    const costService = {
      getStudyCosts: vi.fn(async () => ({
        studyId: 'test',
        costs: { total: 1.0, currency: 'USD', breakdown: { apiCalls: 0.5, proxyUsage: 0.3, storage: 0.1, compute: 0.1 } },
      })),
    };

    gateway = await createGateway(
      {
        rateLimit: { enabled: false, max: 10000, windowMs: 60000 },
        logging: { level: 'error', pretty: false },
      },
      {
        studyService,
        healthService,
        costService,
        apiKeyStore,
      }
    );
  });

  afterEach(async () => {
    await gateway.close();
  });

  describe('Response Time Benchmarks', () => {
    it('should respond to health check in under 50ms', async () => {
      const iterations = 100;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await gateway.inject({
          method: 'GET',
          url: '/health',
        });
        times.push(performance.now() - start);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const maxTime = Math.max(...times);
      const p95Time = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];

      expect(avgTime).toBeLessThan(50);
      expect(p95Time).toBeLessThan(100);

      console.log(`Health check - Avg: ${avgTime.toFixed(2)}ms, P95: ${p95Time.toFixed(2)}ms, Max: ${maxTime.toFixed(2)}ms`);
    });

    it('should respond to authenticated requests in under 100ms', async () => {
      const iterations = 50;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await gateway.inject({
          method: 'GET',
          url: '/v1/studies/study-123',
          headers: { authorization: `Bearer ${testApiKey}` },
        });
        times.push(performance.now() - start);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const p95Time = times.sort((a, b) => a - b)[Math.floor(times.length * 0.95)];

      expect(avgTime).toBeLessThan(100);
      expect(p95Time).toBeLessThan(200);

      console.log(`Authenticated request - Avg: ${avgTime.toFixed(2)}ms, P95: ${p95Time.toFixed(2)}ms`);
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle 50 concurrent health checks', async () => {
      const concurrency = 50;
      const start = performance.now();

      const requests = Array(concurrency).fill(null).map(() =>
        gateway.inject({
          method: 'GET',
          url: '/health',
        })
      );

      const responses = await Promise.all(requests);
      const duration = performance.now() - start;

      // All should succeed
      responses.forEach(response => {
        expect(response.statusCode).toBe(200);
      });

      // Should complete within reasonable time
      expect(duration).toBeLessThan(1000); // 1 second for 50 requests

      console.log(`50 concurrent health checks completed in ${duration.toFixed(2)}ms`);
    });

    it('should handle 20 concurrent authenticated requests', async () => {
      const concurrency = 20;
      const start = performance.now();

      const requests = Array(concurrency).fill(null).map((_, i) =>
        gateway.inject({
          method: 'GET',
          url: `/v1/studies/study-${i}`,
          headers: { authorization: `Bearer ${testApiKey}` },
        })
      );

      const responses = await Promise.all(requests);
      const duration = performance.now() - start;

      // All should succeed
      responses.forEach(response => {
        expect(response.statusCode).toBe(200);
      });

      // Should complete within reasonable time
      expect(duration).toBeLessThan(2000); // 2 seconds

      console.log(`20 concurrent authenticated requests completed in ${duration.toFixed(2)}ms`);
    });

    it('should handle mixed read/write operations concurrently', async () => {
      const manifest: Manifest = {
        version: '1.0',
        name: 'Perf Test Study',
        queries: [{ text: 'Test query' }],
        surfaces: [{ id: 'openai-api', required: true }],
        locations: [{ id: 'us-nyc', name: 'New York', country: 'US', proxyType: 'residential', requireSticky: false }],
        completionCriteria: { requiredSurfaces: { surfaceIds: ['openai-api'], coverageThreshold: 0.95 }, maxRetriesPerCell: 3 },
        qualityGates: { requireActualContent: true },
        evidenceLevel: 'metadata',
        legalHold: false,
        deadline: new Date(Date.now() + 86400000),
        sessionIsolation: 'shared',
      };

      const operations = [
        // 5 writes (create study)
        ...Array(5).fill(null).map(() =>
          gateway.inject({
            method: 'POST',
            url: '/v1/studies',
            headers: { authorization: `Bearer ${testApiKey}`, 'content-type': 'application/json' },
            payload: { manifest },
          })
        ),
        // 10 reads (get status)
        ...Array(10).fill(null).map((_, i) =>
          gateway.inject({
            method: 'GET',
            url: `/v1/studies/study-${i}`,
            headers: { authorization: `Bearer ${testApiKey}` },
          })
        ),
        // 5 health checks
        ...Array(5).fill(null).map(() =>
          gateway.inject({
            method: 'GET',
            url: '/health',
          })
        ),
      ];

      const start = performance.now();
      const responses = await Promise.all(operations);
      const duration = performance.now() - start;

      // Count successes
      const writeSuccesses = responses.slice(0, 5).filter(r => r.statusCode === 201).length;
      const readSuccesses = responses.slice(5, 15).filter(r => r.statusCode === 200).length;
      const healthSuccesses = responses.slice(15).filter(r => r.statusCode === 200).length;

      expect(writeSuccesses).toBe(5);
      expect(readSuccesses).toBe(10);
      expect(healthSuccesses).toBe(5);

      console.log(`Mixed operations (5 writes, 10 reads, 5 health) completed in ${duration.toFixed(2)}ms`);
    });
  });

  describe('Throughput Under Sustained Load', () => {
    it('should maintain consistent response times under sustained load', async () => {
      const totalRequests = 200;
      const batchSize = 10;
      const batches = totalRequests / batchSize;
      const batchTimes: number[] = [];

      for (let batch = 0; batch < batches; batch++) {
        const start = performance.now();

        const requests = Array(batchSize).fill(null).map(() =>
          gateway.inject({
            method: 'GET',
            url: '/health',
          })
        );

        await Promise.all(requests);
        batchTimes.push(performance.now() - start);
      }

      const avgBatchTime = batchTimes.reduce((a, b) => a + b, 0) / batchTimes.length;
      const firstBatchTime = batchTimes[0];
      const lastBatchTime = batchTimes[batchTimes.length - 1];

      // Last batch should not be significantly slower than first
      // (allow 50% degradation as acceptable)
      expect(lastBatchTime).toBeLessThan(firstBatchTime * 1.5);

      console.log(`Sustained load - First batch: ${firstBatchTime.toFixed(2)}ms, Last batch: ${lastBatchTime.toFixed(2)}ms, Avg: ${avgBatchTime.toFixed(2)}ms`);
    });
  });
});

describe('Performance: Authentication Overhead', () => {
  let gateway: FastifyInstance;
  let apiKeyStore: InMemoryApiKeyStore;

  beforeEach(async () => {
    apiKeyStore = new InMemoryApiKeyStore();

    // Add 1000 API keys to test lookup performance
    for (let i = 0; i < 1000; i++) {
      const key = generateApiKey();
      apiKeyStore.addKey({
        id: `key-${i}`,
        tenantId: `tenant-${i}`,
        keyHash: hashApiKey(key),
        name: `Key ${i}`,
        permissions: ['*'],
        rateLimit: 1000,
        createdAt: new Date(),
      });
    }

    const studyService = {
      createStudy: vi.fn(async () => ({ studyId: 'test', status: 'validating' as const, createdAt: new Date() })),
      getStudyStatus: vi.fn(async (_t, id) => ({
        studyId: id, status: 'executing' as const,
        progress: { totalJobs: 10, completedJobs: 5, failedJobs: 0, pendingJobs: 5, completionPercentage: 50 },
        surfaces: [], createdAt: new Date(),
      })),
      getStudyResults: vi.fn(async () => null),
      cancelStudy: vi.fn(async () => true),
      pauseStudy: vi.fn(async () => true),
      resumeStudy: vi.fn(async () => true),
    };

    const healthService = {
      checkDatabase: vi.fn(async () => true),
      checkRedis: vi.fn(async () => true),
      checkOrchestrator: vi.fn(async () => true),
    };

    const costService = {
      getStudyCosts: vi.fn(async () => null),
    };

    gateway = await createGateway(
      {
        rateLimit: { enabled: false, max: 10000, windowMs: 60000 },
        logging: { level: 'error', pretty: false },
      },
      {
        studyService,
        healthService,
        costService,
        apiKeyStore,
      }
    );
  });

  afterEach(async () => {
    await gateway.close();
  });

  it('should have O(1) API key lookup time regardless of key count', async () => {
    // Add a known key at the end
    const lastKey = generateApiKey();
    apiKeyStore.addKey({
      id: 'last-key',
      tenantId: 'tenant-last',
      keyHash: hashApiKey(lastKey),
      name: 'Last Key',
      permissions: ['*'],
      rateLimit: 1000,
      createdAt: new Date(),
    });

    const iterations = 50;
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await gateway.inject({
        method: 'GET',
        url: '/v1/studies/study-123',
        headers: { authorization: `Bearer ${lastKey}` },
      });
      times.push(performance.now() - start);
    }

    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;

    // Even with 1000+ keys, lookup should be fast (hash-based O(1))
    expect(avgTime).toBeLessThan(100);

    console.log(`API key lookup with 1000+ keys - Avg: ${avgTime.toFixed(2)}ms`);
  });
});

describe('Performance: Validation Overhead', () => {
  let gateway: FastifyInstance;
  let testApiKey: string;

  beforeEach(async () => {
    const apiKeyStore = new InMemoryApiKeyStore();
    testApiKey = generateApiKey();
    apiKeyStore.addKey({
      id: 'validation-test-key',
      tenantId: 'tenant-validation',
      keyHash: hashApiKey(testApiKey),
      name: 'Validation Test Key',
      permissions: ['*'],
      rateLimit: 10000,
      createdAt: new Date(),
    });

    const studyService = {
      createStudy: vi.fn(async () => ({ studyId: 'test', status: 'validating' as const, createdAt: new Date() })),
      getStudyStatus: vi.fn(async () => null),
      getStudyResults: vi.fn(async () => null),
      cancelStudy: vi.fn(async () => false),
      pauseStudy: vi.fn(async () => false),
      resumeStudy: vi.fn(async () => false),
    };

    const healthService = {
      checkDatabase: vi.fn(async () => true),
      checkRedis: vi.fn(async () => true),
      checkOrchestrator: vi.fn(async () => true),
    };

    const costService = {
      getStudyCosts: vi.fn(async () => null),
    };

    gateway = await createGateway(
      {
        rateLimit: { enabled: false, max: 10000, windowMs: 60000 },
        logging: { level: 'error', pretty: false },
      },
      {
        studyService,
        healthService,
        costService,
        apiKeyStore,
      }
    );
  });

  afterEach(async () => {
    await gateway.close();
  });

  it('should validate manifests efficiently regardless of size', async () => {
    // Create manifests of varying sizes
    const sizes = [10, 50, 100, 200];
    const results: Array<{ size: number; avgTime: number }> = [];

    for (const size of sizes) {
      const manifest: Manifest = {
        version: '1.0',
        name: `Large Study ${size}`,
        queries: Array(size).fill(null).map((_, i) => ({ text: `Query ${i}: What is the capital of country ${i}?` })),
        surfaces: [
          { id: 'openai-api', required: true },
          { id: 'anthropic-api', required: false },
        ],
        locations: [
          { id: 'us-nyc', name: 'New York', country: 'US', proxyType: 'residential', requireSticky: false },
          { id: 'uk-lon', name: 'London', country: 'GB', proxyType: 'residential', requireSticky: false },
        ],
        completionCriteria: {
          requiredSurfaces: { surfaceIds: ['openai-api'], coverageThreshold: 0.95 },
          maxRetriesPerCell: 3,
        },
        qualityGates: { minResponseLength: 10, requireActualContent: true },
        evidenceLevel: 'metadata',
        legalHold: false,
        deadline: new Date(Date.now() + 86400000),
        sessionIsolation: 'shared',
      };

      const iterations = 10;
      const times: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        await gateway.inject({
          method: 'POST',
          url: '/v1/studies',
          headers: { authorization: `Bearer ${testApiKey}`, 'content-type': 'application/json' },
          payload: { manifest },
        });
        times.push(performance.now() - start);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      results.push({ size, avgTime });
    }

    // Validation time should scale reasonably (not exponentially)
    // Allow 10x time increase for 20x size increase
    const smallManifestTime = results[0].avgTime;
    const largeManifestTime = results[results.length - 1].avgTime;

    expect(largeManifestTime).toBeLessThan(smallManifestTime * 10);

    console.log('Manifest validation times by query count:');
    results.forEach(r => console.log(`  ${r.size} queries: ${r.avgTime.toFixed(2)}ms`));
  });
});

describe('Performance: Error Handling', () => {
  let gateway: FastifyInstance;

  beforeEach(async () => {
    const apiKeyStore = new InMemoryApiKeyStore();

    const studyService = {
      createStudy: vi.fn(async () => { throw new Error('Test error'); }),
      getStudyStatus: vi.fn(async () => null),
      getStudyResults: vi.fn(async () => null),
      cancelStudy: vi.fn(async () => false),
      pauseStudy: vi.fn(async () => false),
      resumeStudy: vi.fn(async () => false),
    };

    const healthService = {
      checkDatabase: vi.fn(async () => true),
      checkRedis: vi.fn(async () => true),
      checkOrchestrator: vi.fn(async () => true),
    };

    const costService = {
      getStudyCosts: vi.fn(async () => null),
    };

    gateway = await createGateway(
      {
        rateLimit: { enabled: false, max: 10000, windowMs: 60000 },
        logging: { level: 'error', pretty: false },
      },
      {
        studyService,
        healthService,
        costService,
        apiKeyStore,
      }
    );
  });

  afterEach(async () => {
    await gateway.close();
  });

  it('should handle auth failures efficiently', async () => {
    const iterations = 100;
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await gateway.inject({
        method: 'GET',
        url: '/v1/studies/study-123',
        headers: { authorization: 'Bearer invalid_key' },
      });
      times.push(performance.now() - start);
    }

    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;

    // Auth failures should be fast (fail-fast principle)
    expect(avgTime).toBeLessThan(50);

    console.log(`Auth failure handling - Avg: ${avgTime.toFixed(2)}ms`);
  });

  it('should handle 404 responses efficiently', async () => {
    const apiKey = generateApiKey();
    const apiKeyStore = new InMemoryApiKeyStore();
    apiKeyStore.addKey({
      id: 'test-key',
      tenantId: 'tenant-test',
      keyHash: hashApiKey(apiKey),
      name: 'Test Key',
      permissions: ['*'],
      rateLimit: 1000,
      createdAt: new Date(),
    });

    // Need to recreate gateway with this key store
    await gateway.close();
    gateway = await createGateway(
      {
        rateLimit: { enabled: false, max: 10000, windowMs: 60000 },
        logging: { level: 'error', pretty: false },
      },
      {
        studyService: {
          createStudy: vi.fn(async () => ({ studyId: 'test', status: 'validating' as const, createdAt: new Date() })),
          getStudyStatus: vi.fn(async () => null), // Always returns null (not found)
          getStudyResults: vi.fn(async () => null),
          cancelStudy: vi.fn(async () => false),
          pauseStudy: vi.fn(async () => false),
          resumeStudy: vi.fn(async () => false),
        },
        healthService: {
          checkDatabase: vi.fn(async () => true),
          checkRedis: vi.fn(async () => true),
          checkOrchestrator: vi.fn(async () => true),
        },
        costService: { getStudyCosts: vi.fn(async () => null) },
        apiKeyStore,
      }
    );

    const iterations = 100;
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      const response = await gateway.inject({
        method: 'GET',
        url: '/v1/studies/nonexistent',
        headers: { authorization: `Bearer ${apiKey}` },
      });
      expect(response.statusCode).toBe(404);
      times.push(performance.now() - start);
    }

    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;

    // 404 responses should be fast
    expect(avgTime).toBeLessThan(50);

    console.log(`404 handling - Avg: ${avgTime.toFixed(2)}ms`);
  });
});
