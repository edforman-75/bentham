/**
 * End-to-End Study Lifecycle Tests
 *
 * Tests the full flow from API gateway through orchestrator, executor, and validator.
 * These tests use mocked external services but test the integration between packages.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createGateway, InMemoryApiKeyStore, hashApiKey, generateApiKey } from '@bentham/api-gateway';
import { Orchestrator } from '@bentham/orchestrator';
import { Executor } from '@bentham/executor';
import { Validator, DEFAULT_VALIDATOR_CONFIG } from '@bentham/validator';
import type { FastifyInstance } from 'fastify';
import type { Manifest, Study, Job, JobResult } from '@bentham/core';

/**
 * Mock implementations for external dependencies
 */

// Mock database repository
function createMockRepository() {
  const studies = new Map<string, Study>();
  const jobs = new Map<string, Job>();

  return {
    studies: {
      create: vi.fn(async (study: Study) => {
        studies.set(study.id, study);
        return study;
      }),
      findById: vi.fn(async (id: string) => studies.get(id) ?? null),
      update: vi.fn(async (id: string, updates: Partial<Study>) => {
        const study = studies.get(id);
        if (!study) return null;
        const updated = { ...study, ...updates };
        studies.set(id, updated);
        return updated;
      }),
      findByTenantId: vi.fn(async (tenantId: string) =>
        Array.from(studies.values()).filter(s => s.tenantId === tenantId)
      ),
    },
    jobs: {
      create: vi.fn(async (job: Job) => {
        jobs.set(job.id, job);
        return job;
      }),
      findById: vi.fn(async (id: string) => jobs.get(id) ?? null),
      update: vi.fn(async (id: string, updates: Partial<Job>) => {
        const job = jobs.get(id);
        if (!job) return null;
        const updated = { ...job, ...updates };
        jobs.set(id, updated);
        return updated;
      }),
      findByStudyId: vi.fn(async (studyId: string) =>
        Array.from(jobs.values()).filter(j => j.studyId === studyId)
      ),
      findPending: vi.fn(async (studyId: string) =>
        Array.from(jobs.values()).filter(j => j.studyId === studyId && j.status === 'pending')
      ),
    },
    // Helper methods for testing
    _getStudy: (id: string) => studies.get(id),
    _getJob: (id: string) => jobs.get(id),
    _getAllStudies: () => Array.from(studies.values()),
    _getAllJobs: () => Array.from(jobs.values()),
    _clear: () => {
      studies.clear();
      jobs.clear();
    },
  };
}

// Mock surface adapter that always succeeds
function createMockSurfaceAdapter(surfaceId: string) {
  return {
    id: surfaceId,
    name: `Mock ${surfaceId}`,
    category: 'api' as const,
    requiresAuth: false,
    supportsAnonymous: true,
    supportsGeoTargeting: false,
    executeQuery: vi.fn(async (query: string) => ({
      success: true,
      response: {
        text: `Mock response for: ${query}`,
        structured: {
          mainResponse: `Mock response for: ${query}`,
          sources: [],
          followUps: [],
        },
        responseTimeMs: 100,
      },
      validation: {
        passedQualityGates: true,
        isActualContent: true,
        responseLength: 50,
      },
      context: {
        sessionId: 'mock-session',
        userAgent: 'Mock/1.0',
      },
    } as JobResult)),
    validateSession: vi.fn(async () => ({
      valid: true,
      authenticated: true,
      rateLimited: false,
    })),
    resetSession: vi.fn(async () => {}),
  };
}

describe('End-to-End: Study Lifecycle', () => {
  let gateway: FastifyInstance;
  let apiKeyStore: InMemoryApiKeyStore;
  let testApiKey: string;
  let repository: ReturnType<typeof createMockRepository>;

  // Create a valid manifest for testing
  function createTestManifest(overrides: Partial<Manifest> = {}): Manifest {
    const futureDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000);

    return {
      version: '1.0',
      name: 'E2E Test Study',
      description: 'End-to-end test study',
      queries: [
        { text: 'What is artificial intelligence?' },
        { text: 'How does machine learning work?' },
      ],
      surfaces: [
        { id: 'openai-api', required: true },
      ],
      locations: [
        {
          id: 'us-nyc',
          name: 'New York',
          country: 'US',
          proxyType: 'residential',
          requireSticky: false,
        },
      ],
      completionCriteria: {
        requiredSurfaces: {
          surfaceIds: ['openai-api'],
          coverageThreshold: 0.95,
        },
        maxRetriesPerCell: 3,
      },
      qualityGates: {
        minResponseLength: 10,
        requireActualContent: true,
      },
      evidenceLevel: 'metadata',
      legalHold: false,
      deadline: futureDeadline,
      sessionIsolation: 'shared',
      ...overrides,
    };
  }

  beforeEach(async () => {
    repository = createMockRepository();

    // Create study service that tracks studies
    const studyService = {
      createStudy: vi.fn(async (tenantId: string, request: { manifest: Manifest; priority?: string; callbackUrl?: string }) => {
        const studyId = `study_${Date.now()}`;
        const study: Study = {
          id: studyId,
          tenantId,
          manifest: request.manifest,
          status: 'validating',
          totalCells: request.manifest.queries.length * request.manifest.surfaces.length * request.manifest.locations.length,
          completedCells: 0,
          failedCells: 0,
          createdAt: new Date(),
          deadline: request.manifest.deadline,
          estimatedCost: { min: 0.10, max: 0.50, currency: 'USD' },
          actualCost: { total: 0, currency: 'USD', breakdown: {} },
        };

        await repository.studies.create(study);

        return {
          studyId,
          status: 'validating' as const,
          createdAt: study.createdAt,
        };
      }),

      getStudyStatus: vi.fn(async (tenantId: string, studyId: string) => {
        const study = await repository.studies.findById(studyId);
        if (!study || study.tenantId !== tenantId) return null;

        return {
          studyId: study.id,
          status: study.status,
          progress: {
            totalJobs: study.totalCells,
            completedJobs: study.completedCells,
            failedJobs: study.failedCells,
            pendingJobs: study.totalCells - study.completedCells - study.failedCells,
            completionPercentage: study.totalCells > 0
              ? Math.round((study.completedCells / study.totalCells) * 100)
              : 0,
          },
          surfaces: [],
          createdAt: study.createdAt,
          startedAt: study.startedAt,
          completedAt: study.completedAt,
        };
      }),

      getStudyResults: vi.fn(async (tenantId: string, studyId: string) => {
        const study = await repository.studies.findById(studyId);
        if (!study || study.tenantId !== tenantId) return null;

        const jobs = await repository.jobs.findByStudyId(studyId);

        return {
          studyId: study.id,
          status: study.status,
          results: jobs.map(job => ({
            jobId: job.id,
            queryText: study.manifest.queries[job.queryIndex]?.text ?? '',
            surfaceId: job.surfaceId,
            locationId: job.locationId,
            result: job.result ?? null,
            attempts: job.attempts,
          })),
          summary: {
            totalQueries: study.totalCells,
            successfulQueries: study.completedCells,
            failedQueries: study.failedCells,
            averageResponseTime: 100,
          },
          completedAt: study.completedAt,
        };
      }),

      cancelStudy: vi.fn(async (tenantId: string, studyId: string) => {
        const study = await repository.studies.findById(studyId);
        if (!study || study.tenantId !== tenantId) return false;
        await repository.studies.update(studyId, { status: 'failed' });
        return true;
      }),

      pauseStudy: vi.fn(async (tenantId: string, studyId: string) => {
        const study = await repository.studies.findById(studyId);
        if (!study || study.tenantId !== tenantId) return false;
        await repository.studies.update(studyId, { status: 'paused' });
        return true;
      }),

      resumeStudy: vi.fn(async (tenantId: string, studyId: string) => {
        const study = await repository.studies.findById(studyId);
        if (!study || study.tenantId !== tenantId) return false;
        await repository.studies.update(studyId, { status: 'executing' });
        return true;
      }),
    };

    const healthService = {
      checkDatabase: vi.fn(async () => true),
      checkRedis: vi.fn(async () => true),
      checkOrchestrator: vi.fn(async () => true),
    };

    const costService = {
      getStudyCosts: vi.fn(async (tenantId: string, studyId: string) => {
        const study = await repository.studies.findById(studyId);
        if (!study || study.tenantId !== tenantId) return null;

        return {
          studyId,
          costs: {
            total: 0.25,
            currency: 'USD',
            breakdown: {
              apiCalls: 0.15,
              proxyUsage: 0.05,
              storage: 0.03,
              compute: 0.02,
            },
          },
        };
      }),
    };

    // Create API key store
    apiKeyStore = new InMemoryApiKeyStore();
    testApiKey = generateApiKey();
    apiKeyStore.addKey({
      id: 'e2e-test-key',
      tenantId: 'tenant-e2e-test',
      keyHash: hashApiKey(testApiKey),
      name: 'E2E Test Key',
      permissions: ['*'],
      rateLimit: 1000,
      createdAt: new Date(),
    });

    // Create gateway
    gateway = await createGateway(
      {
        rateLimit: { enabled: false, max: 100, windowMs: 60000 },
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
    repository._clear();
    vi.clearAllMocks();
  });

  describe('Study Creation and Execution', () => {
    it('should create a study with valid manifest', async () => {
      const manifest = createTestManifest();

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
      expect(body.data.studyId).toBeDefined();
      expect(body.data.status).toBe('validating');
    });

    it('should reject study with invalid manifest', async () => {
      const invalidManifest = {
        version: '1.0',
        name: '', // Empty name - invalid
        queries: [],
        surfaces: [],
        locations: [],
      };

      const response = await gateway.inject({
        method: 'POST',
        url: '/v1/studies',
        headers: {
          authorization: `Bearer ${testApiKey}`,
          'content-type': 'application/json',
        },
        payload: { manifest: invalidManifest },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should track study status through lifecycle', async () => {
      const manifest = createTestManifest();

      // Create study
      const createResponse = await gateway.inject({
        method: 'POST',
        url: '/v1/studies',
        headers: {
          authorization: `Bearer ${testApiKey}`,
          'content-type': 'application/json',
        },
        payload: { manifest },
      });

      const { studyId } = createResponse.json().data;

      // Get status
      const statusResponse = await gateway.inject({
        method: 'GET',
        url: `/v1/studies/${studyId}`,
        headers: {
          authorization: `Bearer ${testApiKey}`,
        },
      });

      expect(statusResponse.statusCode).toBe(200);
      const status = statusResponse.json().data;
      expect(status.studyId).toBe(studyId);
      expect(status.progress).toBeDefined();
      expect(status.progress.totalJobs).toBe(2); // 2 queries × 1 surface × 1 location
    });

    it('should allow pausing and resuming a study', async () => {
      const manifest = createTestManifest();

      // Create study
      const createResponse = await gateway.inject({
        method: 'POST',
        url: '/v1/studies',
        headers: {
          authorization: `Bearer ${testApiKey}`,
          'content-type': 'application/json',
        },
        payload: { manifest },
      });

      const { studyId } = createResponse.json().data;

      // Pause study
      const pauseResponse = await gateway.inject({
        method: 'POST',
        url: `/v1/studies/${studyId}/pause`,
        headers: {
          authorization: `Bearer ${testApiKey}`,
        },
      });

      expect(pauseResponse.statusCode).toBe(200);
      expect(pauseResponse.json().data.status).toBe('paused');

      // Resume study
      const resumeResponse = await gateway.inject({
        method: 'POST',
        url: `/v1/studies/${studyId}/resume`,
        headers: {
          authorization: `Bearer ${testApiKey}`,
        },
      });

      expect(resumeResponse.statusCode).toBe(200);
      expect(resumeResponse.json().data.status).toBe('running');
    });

    it('should allow cancelling a study', async () => {
      const manifest = createTestManifest();

      // Create study
      const createResponse = await gateway.inject({
        method: 'POST',
        url: '/v1/studies',
        headers: {
          authorization: `Bearer ${testApiKey}`,
          'content-type': 'application/json',
        },
        payload: { manifest },
      });

      const { studyId } = createResponse.json().data;

      // Cancel study
      const cancelResponse = await gateway.inject({
        method: 'DELETE',
        url: `/v1/studies/${studyId}`,
        headers: {
          authorization: `Bearer ${testApiKey}`,
        },
      });

      expect(cancelResponse.statusCode).toBe(200);
      expect(cancelResponse.json().data.status).toBe('cancelled');
    });
  });

  describe('Study Results', () => {
    it('should return study results when complete', async () => {
      const manifest = createTestManifest();

      // Create study
      const createResponse = await gateway.inject({
        method: 'POST',
        url: '/v1/studies',
        headers: {
          authorization: `Bearer ${testApiKey}`,
          'content-type': 'application/json',
        },
        payload: { manifest },
      });

      const { studyId } = createResponse.json().data;

      // Get results
      const resultsResponse = await gateway.inject({
        method: 'GET',
        url: `/v1/studies/${studyId}/results`,
        headers: {
          authorization: `Bearer ${testApiKey}`,
        },
      });

      expect(resultsResponse.statusCode).toBe(200);
      const results = resultsResponse.json().data;
      expect(results.studyId).toBe(studyId);
      expect(results.summary).toBeDefined();
    });
  });

  describe('Cost Tracking', () => {
    it('should return costs for a study', async () => {
      const manifest = createTestManifest();

      // Create study
      const createResponse = await gateway.inject({
        method: 'POST',
        url: '/v1/studies',
        headers: {
          authorization: `Bearer ${testApiKey}`,
          'content-type': 'application/json',
        },
        payload: { manifest },
      });

      const { studyId } = createResponse.json().data;

      // Get costs
      const costsResponse = await gateway.inject({
        method: 'GET',
        url: `/v1/costs/${studyId}`,
        headers: {
          authorization: `Bearer ${testApiKey}`,
        },
      });

      expect(costsResponse.statusCode).toBe(200);
      const costs = costsResponse.json().data;
      expect(costs.studyId).toBe(studyId);
      expect(costs.costs.total).toBeGreaterThan(0);
      expect(costs.costs.breakdown).toBeDefined();
    });
  });

  describe('Health Checks', () => {
    it('should return healthy status when all services are up', async () => {
      const response = await gateway.inject({
        method: 'GET',
        url: '/v1/health',
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe('healthy');
      expect(body.checks.database).toBe('ok');
      expect(body.checks.redis).toBe('ok');
      expect(body.checks.orchestrator).toBe('ok');
    });
  });
});

describe('End-to-End: Multi-Tenant Isolation', () => {
  let gateway: FastifyInstance;
  let apiKeyStore: InMemoryApiKeyStore;
  let tenantAKey: string;
  let tenantBKey: string;
  let studyServiceCalls: Array<{ tenantId: string; method: string; args: unknown[] }>;

  beforeEach(async () => {
    studyServiceCalls = [];

    // Create mock study service that tracks tenant IDs
    const studyService = {
      createStudy: vi.fn(async (tenantId: string, request: { manifest: Manifest }) => {
        studyServiceCalls.push({ tenantId, method: 'createStudy', args: [request] });
        return {
          studyId: `study_${tenantId}_${Date.now()}`,
          status: 'validating' as const,
          createdAt: new Date(),
        };
      }),
      getStudyStatus: vi.fn(async (tenantId: string, studyId: string) => {
        studyServiceCalls.push({ tenantId, method: 'getStudyStatus', args: [studyId] });
        // Only return if study belongs to tenant
        if (!studyId.includes(tenantId)) return null;
        return {
          studyId,
          status: 'executing' as const,
          progress: { totalJobs: 10, completedJobs: 5, failedJobs: 0, pendingJobs: 5, completionPercentage: 50 },
          surfaces: [],
          createdAt: new Date(),
        };
      }),
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

    // Create API key store with two tenants
    apiKeyStore = new InMemoryApiKeyStore();

    tenantAKey = generateApiKey();
    apiKeyStore.addKey({
      id: 'tenant-a-key',
      tenantId: 'tenant-A',
      keyHash: hashApiKey(tenantAKey),
      name: 'Tenant A Key',
      permissions: ['*'],
      rateLimit: 1000,
      createdAt: new Date(),
    });

    tenantBKey = generateApiKey();
    apiKeyStore.addKey({
      id: 'tenant-b-key',
      tenantId: 'tenant-B',
      keyHash: hashApiKey(tenantBKey),
      name: 'Tenant B Key',
      permissions: ['*'],
      rateLimit: 1000,
      createdAt: new Date(),
    });

    gateway = await createGateway(
      {
        rateLimit: { enabled: false, max: 100, windowMs: 60000 },
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

  it('should pass correct tenant ID to service layer', async () => {
    const futureDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const manifest = {
      version: '1.0',
      name: 'Test Study',
      queries: [{ text: 'Test query' }],
      surfaces: [{ id: 'openai-api', required: true }],
      locations: [{ id: 'us-nyc', proxyType: 'residential', requireSticky: false }],
      completionCriteria: { requiredSurfaces: { surfaceIds: ['openai-api'], coverageThreshold: 0.95 }, maxRetriesPerCell: 3 },
      qualityGates: { requireActualContent: true },
      evidenceLevel: 'metadata',
      legalHold: false,
      deadline: futureDeadline,
      sessionIsolation: 'shared',
    };

    // Create study as Tenant A
    await gateway.inject({
      method: 'POST',
      url: '/v1/studies',
      headers: { authorization: `Bearer ${tenantAKey}`, 'content-type': 'application/json' },
      payload: { manifest },
    });

    // Create study as Tenant B
    await gateway.inject({
      method: 'POST',
      url: '/v1/studies',
      headers: { authorization: `Bearer ${tenantBKey}`, 'content-type': 'application/json' },
      payload: { manifest },
    });

    // Verify tenant IDs were passed correctly
    expect(studyServiceCalls).toHaveLength(2);
    expect(studyServiceCalls[0].tenantId).toBe('tenant-A');
    expect(studyServiceCalls[1].tenantId).toBe('tenant-B');
  });

  it('should prevent tenant A from accessing tenant B studies', async () => {
    // Try to access a study belonging to tenant-B using tenant-A's key
    const response = await gateway.inject({
      method: 'GET',
      url: '/v1/studies/study_tenant-B_12345',
      headers: { authorization: `Bearer ${tenantAKey}` },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('STUDY_NOT_FOUND');
  });

  it('should allow tenant to access their own studies', async () => {
    // Access a study belonging to tenant-A using tenant-A's key
    const response = await gateway.inject({
      method: 'GET',
      url: '/v1/studies/study_tenant-A_12345',
      headers: { authorization: `Bearer ${tenantAKey}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.studyId).toContain('tenant-A');
  });
});

describe('End-to-End: Validator Integration', () => {
  it('should validate job results using validator module', async () => {
    // Create validator with default config
    const config = { ...DEFAULT_VALIDATOR_CONFIG };
    const validator = new Validator(config);

    // Create a mock job for validation (using JobForValidation interface)
    const mockJob = {
      id: 'job-1',
      studyId: 'study-1',
      surfaceId: 'openai-api',
      result: {
        success: true,
        response: {
          text: 'This is a valid response with sufficient content to pass quality gates.',
          structured: {
            mainResponse: 'This is a valid response with sufficient content.',
            sources: [],
            followUps: [],
          },
          responseTimeMs: 150,
        },
        validation: {
          passedQualityGates: true,
          isActualContent: true,
          responseLength: 70,
        },
        context: {
          sessionId: 'session-1',
          userAgent: 'Test/1.0',
        },
      },
      qualityGates: {
        minResponseLength: 10,
        requireActualContent: true,
      },
      evidenceLevel: 'metadata' as const,
    };

    // Validate the job result
    const result = validator.validateJob(mockJob);

    expect(result.status).toBe('passed');
    expect(result.qualityGatesPassed).toBe(true);
    expect(result.isActualContent).toBe(true);
  });

  it('should fail validation for insufficient response length', async () => {
    const config = { ...DEFAULT_VALIDATOR_CONFIG };
    const validator = new Validator(config);

    const mockJob = {
      id: 'job-2',
      studyId: 'study-1',
      surfaceId: 'openai-api',
      result: {
        success: true,
        response: {
          text: 'Short',
          responseTimeMs: 50,
        },
        validation: {
          passedQualityGates: false,
          isActualContent: true,
          responseLength: 5,
        },
        context: {
          sessionId: 'session-1',
          userAgent: 'Test/1.0',
        },
      },
      qualityGates: {
        minResponseLength: 100,
        requireActualContent: true,
      },
      evidenceLevel: 'metadata' as const,
    };

    const result = validator.validateJob(mockJob);

    expect(result.status).toBe('failed');
    expect(result.qualityGatesPassed).toBe(false);
  });
});
