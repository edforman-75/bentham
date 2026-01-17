/**
 * API Gateway Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createGateway, type GatewayDependencies } from '../../gateway.js';
import { InMemoryApiKeyStore, hashApiKey, generateApiKey } from '../../middleware/auth.js';
import type { FastifyInstance } from 'fastify';
import type { StudyService } from '../../routes/studies.js';
import type { HealthService } from '../../routes/health.js';
import type { CostService } from '../../routes/costs.js';

describe('API Gateway', () => {
  let gateway: FastifyInstance;
  let apiKeyStore: InMemoryApiKeyStore;
  let studyService: StudyService;
  let healthService: HealthService;
  let costService: CostService;
  let testApiKey: string;

  beforeEach(async () => {
    // Create mock services
    studyService = {
      createStudy: vi.fn().mockResolvedValue({
        studyId: 'study-123',
        status: 'manifest_received',
        createdAt: new Date(),
      }),
      getStudyStatus: vi.fn().mockResolvedValue({
        studyId: 'study-123',
        status: 'running',
        progress: {
          totalJobs: 100,
          completedJobs: 50,
          failedJobs: 0,
          pendingJobs: 50,
          completionPercentage: 50,
        },
        surfaces: [],
        createdAt: new Date(),
      }),
      getStudyResults: vi.fn().mockResolvedValue({
        studyId: 'study-123',
        status: 'completed',
        results: [],
        summary: {
          totalQueries: 100,
          successfulQueries: 100,
          failedQueries: 0,
          averageResponseTime: 1000,
        },
      }),
      cancelStudy: vi.fn().mockResolvedValue(true),
      pauseStudy: vi.fn().mockResolvedValue(true),
      resumeStudy: vi.fn().mockResolvedValue(true),
    };

    healthService = {
      checkDatabase: vi.fn().mockResolvedValue(true),
      checkRedis: vi.fn().mockResolvedValue(true),
      checkOrchestrator: vi.fn().mockResolvedValue(true),
    };

    costService = {
      getStudyCosts: vi.fn().mockResolvedValue({
        studyId: 'study-123',
        costs: {
          total: 10.00,
          currency: 'USD',
          breakdown: {
            apiCalls: 7.00,
            proxyUsage: 2.00,
            storage: 0.50,
            compute: 0.50,
          },
        },
      }),
    };

    // Create API key store with test key
    apiKeyStore = new InMemoryApiKeyStore();
    testApiKey = generateApiKey();
    apiKeyStore.addKey({
      id: 'test-key-1',
      tenantId: 'tenant-test',
      keyHash: hashApiKey(testApiKey),
      name: 'Test Key',
      permissions: ['*'],
      rateLimit: 1000,
      createdAt: new Date(),
    });

    const dependencies: GatewayDependencies = {
      studyService,
      healthService,
      costService,
      apiKeyStore,
    };

    gateway = await createGateway(
      {
        rateLimit: { enabled: false, max: 100, windowMs: 60000 },
        logging: { level: 'error', pretty: false },
      },
      dependencies
    );
  });

  afterEach(async () => {
    await gateway.close();
  });

  describe('Health Endpoints', () => {
    it('should return ok for simple health check', async () => {
      const response = await gateway.inject({
        method: 'GET',
        url: '/health',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok' });
    });

    it('should return detailed health status', async () => {
      const response = await gateway.inject({
        method: 'GET',
        url: '/v1/health',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe('healthy');
      expect(body.version).toBe('0.0.1');
      expect(body.checks.database).toBe('ok');
      expect(body.checks.redis).toBe('ok');
      expect(body.checks.orchestrator).toBe('ok');
    });

    it('should return degraded when some checks fail', async () => {
      vi.mocked(healthService.checkRedis).mockResolvedValue(false);

      const response = await gateway.inject({
        method: 'GET',
        url: '/v1/health',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe('degraded');
      expect(body.checks.redis).toBe('error');
    });
  });

  describe('Authentication', () => {
    it('should reject requests without API key', async () => {
      const response = await gateway.inject({
        method: 'GET',
        url: '/v1/studies/study-123',
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHORIZED');
    });

    it('should reject requests with invalid API key', async () => {
      const response = await gateway.inject({
        method: 'GET',
        url: '/v1/studies/study-123',
        headers: {
          authorization: 'Bearer invalid_key',
        },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('INVALID_API_KEY');
    });

    it('should accept requests with valid API key in Authorization header', async () => {
      const response = await gateway.inject({
        method: 'GET',
        url: '/v1/studies/study-123',
        headers: {
          authorization: `Bearer ${testApiKey}`,
        },
      });

      expect(response.statusCode).toBe(200);
    });

    it('should accept requests with valid API key in X-API-Key header', async () => {
      const response = await gateway.inject({
        method: 'GET',
        url: '/v1/studies/study-123',
        headers: {
          'x-api-key': testApiKey,
        },
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Studies Endpoints', () => {
    it('should create a study', async () => {
      // Deadline must be in the future
      const futureDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const manifest = {
        version: '1.0',
        name: 'Test Study',
        queries: [{ text: 'What is AI?' }],
        surfaces: [{ id: 'openai-api', required: true }],
        locations: [{
          id: 'us-nyc',
          name: 'New York',
          country: 'US',
          proxyType: 'residential',
          requireSticky: false,
        }],
        qualityGates: { minResponseLength: 10, requireActualContent: true },
        completionCriteria: {
          requiredSurfaces: { surfaceIds: ['openai-api'], coverageThreshold: 0.8 },
          maxRetriesPerCell: 3,
        },
        evidenceLevel: 'metadata',
        legalHold: false,
        sessionIsolation: 'shared',
        deadline: futureDeadline,
      };

      const response = await gateway.inject({
        method: 'POST',
        url: '/v1/studies',
        headers: {
          authorization: `Bearer ${testApiKey}`,
          'content-type': 'application/json',
        },
        payload: { manifest },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.studyId).toBe('study-123');
      expect(studyService.createStudy).toHaveBeenCalled();
    });

    it('should get study status', async () => {
      const response = await gateway.inject({
        method: 'GET',
        url: '/v1/studies/study-123',
        headers: {
          authorization: `Bearer ${testApiKey}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.studyId).toBe('study-123');
      expect(body.data.status).toBe('running');
    });

    it('should return 404 for non-existent study', async () => {
      vi.mocked(studyService.getStudyStatus).mockResolvedValue(null);

      const response = await gateway.inject({
        method: 'GET',
        url: '/v1/studies/non-existent',
        headers: {
          authorization: `Bearer ${testApiKey}`,
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('STUDY_NOT_FOUND');
    });

    it('should get study results', async () => {
      const response = await gateway.inject({
        method: 'GET',
        url: '/v1/studies/study-123/results',
        headers: {
          authorization: `Bearer ${testApiKey}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.summary.totalQueries).toBe(100);
    });

    it('should cancel a study', async () => {
      const response = await gateway.inject({
        method: 'DELETE',
        url: '/v1/studies/study-123',
        headers: {
          authorization: `Bearer ${testApiKey}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('cancelled');
      expect(studyService.cancelStudy).toHaveBeenCalledWith('tenant-test', 'study-123');
    });

    it('should pause a study', async () => {
      const response = await gateway.inject({
        method: 'POST',
        url: '/v1/studies/study-123/pause',
        headers: {
          authorization: `Bearer ${testApiKey}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('paused');
    });

    it('should resume a study', async () => {
      const response = await gateway.inject({
        method: 'POST',
        url: '/v1/studies/study-123/resume',
        headers: {
          authorization: `Bearer ${testApiKey}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('running');
    });
  });

  describe('Costs Endpoints', () => {
    it('should get study costs', async () => {
      const response = await gateway.inject({
        method: 'GET',
        url: '/v1/costs/study-123',
        headers: {
          authorization: `Bearer ${testApiKey}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.costs.total).toBe(10.00);
    });

    it('should return 404 for non-existent study costs', async () => {
      vi.mocked(costService.getStudyCosts).mockResolvedValue(null);

      const response = await gateway.inject({
        method: 'GET',
        url: '/v1/costs/non-existent',
        headers: {
          authorization: `Bearer ${testApiKey}`,
        },
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await gateway.inject({
        method: 'GET',
        url: '/v1/unknown-route',
        headers: {
          authorization: `Bearer ${testApiKey}`,
        },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('RESOURCE_NOT_FOUND');
    });

    it('should include request ID in error responses', async () => {
      const response = await gateway.inject({
        method: 'GET',
        url: '/v1/studies/study-123',
      });

      expect(response.statusCode).toBe(401);
      const body = response.json();
      expect(body.error.requestId).toBeDefined();
      expect(body.error.requestId).toMatch(/^req_/);
    });
  });

  describe('Root Endpoint', () => {
    it('should return API info', async () => {
      const response = await gateway.inject({
        method: 'GET',
        url: '/',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.name).toBe('Bentham API Gateway');
      expect(body.version).toBe('0.0.1');
    });
  });
});

describe('API Key Utilities', () => {
  it('should generate unique API keys', () => {
    const key1 = generateApiKey();
    const key2 = generateApiKey();

    expect(key1).not.toBe(key2);
    expect(key1).toMatch(/^btm_/);
    expect(key2).toMatch(/^btm_/);
  });

  it('should hash API keys consistently', () => {
    const key = 'test_api_key';
    const hash1 = hashApiKey(key);
    const hash2 = hashApiKey(key);

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(key);
  });

  it('should produce different hashes for different keys', () => {
    const hash1 = hashApiKey('key1');
    const hash2 = hashApiKey('key2');

    expect(hash1).not.toBe(hash2);
  });
});

describe('InMemoryApiKeyStore', () => {
  it('should store and retrieve keys', async () => {
    const store = new InMemoryApiKeyStore();
    const keyHash = hashApiKey('test_key');

    store.addKey({
      id: 'key-1',
      tenantId: 'tenant-1',
      keyHash,
      name: 'Test Key',
      permissions: ['*'],
      rateLimit: 100,
      createdAt: new Date(),
    });

    const retrieved = await store.getByHash(keyHash);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.id).toBe('key-1');
    expect(retrieved!.tenantId).toBe('tenant-1');
  });

  it('should return null for unknown keys', async () => {
    const store = new InMemoryApiKeyStore();
    const retrieved = await store.getByHash('unknown_hash');
    expect(retrieved).toBeNull();
  });

  it('should update last used timestamp', async () => {
    const store = new InMemoryApiKeyStore();
    const keyHash = hashApiKey('test_key');

    store.addKey({
      id: 'key-1',
      tenantId: 'tenant-1',
      keyHash,
      name: 'Test Key',
      permissions: ['*'],
      rateLimit: 100,
      createdAt: new Date(),
    });

    await store.updateLastUsed('key-1');

    const retrieved = await store.getByHash(keyHash);
    expect(retrieved!.lastUsedAt).toBeDefined();
  });
});
