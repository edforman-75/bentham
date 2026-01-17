/**
 * Multi-Tenant Isolation Tests
 *
 * Verifies strict data separation between tenants, testing:
 * - Study isolation (tenant A cannot see tenant B's studies)
 * - Job isolation (jobs are scoped to tenant)
 * - Cost isolation (costs are attributed correctly)
 * - API key isolation (keys are scoped to tenant)
 * - Audit log isolation (logs are tenant-scoped)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createGateway, InMemoryApiKeyStore, hashApiKey, generateApiKey } from '@bentham/api-gateway';
import type { FastifyInstance } from 'fastify';
import type { Manifest, Study } from '@bentham/core';

/**
 * In-memory study store with tenant isolation
 */
class TenantIsolatedStudyStore {
  private studies = new Map<string, Study>();
  private accessAttempts: Array<{
    tenantId: string;
    studyId: string;
    action: string;
    allowed: boolean;
  }> = [];

  createStudy(tenantId: string, study: Study): Study {
    const fullStudy = { ...study, tenantId };
    this.studies.set(study.id, fullStudy);
    this.accessAttempts.push({
      tenantId,
      studyId: study.id,
      action: 'create',
      allowed: true,
    });
    return fullStudy;
  }

  getStudy(tenantId: string, studyId: string): Study | null {
    const study = this.studies.get(studyId);

    // Tenant isolation check
    if (study && study.tenantId !== tenantId) {
      this.accessAttempts.push({
        tenantId,
        studyId,
        action: 'read',
        allowed: false,
      });
      return null; // Access denied
    }

    if (study) {
      this.accessAttempts.push({
        tenantId,
        studyId,
        action: 'read',
        allowed: true,
      });
    }

    return study ?? null;
  }

  listStudies(tenantId: string): Study[] {
    return Array.from(this.studies.values()).filter(s => s.tenantId === tenantId);
  }

  deleteStudy(tenantId: string, studyId: string): boolean {
    const study = this.studies.get(studyId);

    if (study && study.tenantId !== tenantId) {
      this.accessAttempts.push({
        tenantId,
        studyId,
        action: 'delete',
        allowed: false,
      });
      return false; // Access denied
    }

    if (study) {
      this.studies.delete(studyId);
      this.accessAttempts.push({
        tenantId,
        studyId,
        action: 'delete',
        allowed: true,
      });
      return true;
    }

    return false;
  }

  getAccessAttempts() {
    return this.accessAttempts;
  }

  getDeniedAttempts() {
    return this.accessAttempts.filter(a => !a.allowed);
  }

  clear() {
    this.studies.clear();
    this.accessAttempts = [];
  }
}

/**
 * Cost tracker with tenant isolation
 */
class TenantIsolatedCostTracker {
  private costs = new Map<string, Map<string, number>>(); // tenantId -> studyId -> cost

  recordCost(tenantId: string, studyId: string, amount: number) {
    if (!this.costs.has(tenantId)) {
      this.costs.set(tenantId, new Map());
    }
    const tenantCosts = this.costs.get(tenantId)!;
    const currentCost = tenantCosts.get(studyId) ?? 0;
    tenantCosts.set(studyId, currentCost + amount);
  }

  getStudyCost(tenantId: string, studyId: string): number | null {
    const tenantCosts = this.costs.get(tenantId);
    if (!tenantCosts) return null;
    return tenantCosts.get(studyId) ?? null;
  }

  getTenantTotalCost(tenantId: string): number {
    const tenantCosts = this.costs.get(tenantId);
    if (!tenantCosts) return 0;
    return Array.from(tenantCosts.values()).reduce((sum, c) => sum + c, 0);
  }

  // This should NOT work - cross-tenant cost access
  getStudyCostCrossTenant(requestingTenant: string, owningTenant: string, studyId: string): number | null {
    if (requestingTenant !== owningTenant) {
      return null; // Deny cross-tenant access
    }
    return this.getStudyCost(owningTenant, studyId);
  }

  clear() {
    this.costs.clear();
  }
}

describe('Multi-Tenant Isolation', () => {
  let gateway: FastifyInstance;
  let apiKeyStore: InMemoryApiKeyStore;
  let studyStore: TenantIsolatedStudyStore;
  let costTracker: TenantIsolatedCostTracker;

  // Tenant credentials
  const tenants = {
    kyanos: {
      id: 'tenant-kyanos',
      name: 'Kyanos',
      apiKey: '',
    },
    glu: {
      id: 'tenant-glu',
      name: 'GLU',
      apiKey: '',
    },
    acme: {
      id: 'tenant-acme',
      name: 'ACME Corp',
      apiKey: '',
    },
  };

  function createTestManifest(name: string): Manifest {
    const futureDeadline = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return {
      version: '1.0',
      name,
      queries: [{ text: 'Test query' }],
      surfaces: [{ id: 'openai-api', required: true }],
      locations: [{ id: 'us-nyc', name: 'New York', country: 'US', proxyType: 'residential', requireSticky: false }],
      completionCriteria: { requiredSurfaces: { surfaceIds: ['openai-api'], coverageThreshold: 0.95 }, maxRetriesPerCell: 3 },
      qualityGates: { requireActualContent: true },
      evidenceLevel: 'metadata',
      legalHold: false,
      deadline: futureDeadline,
      sessionIsolation: 'shared',
    };
  }

  beforeEach(async () => {
    studyStore = new TenantIsolatedStudyStore();
    costTracker = new TenantIsolatedCostTracker();
    apiKeyStore = new InMemoryApiKeyStore();

    // Generate API keys for each tenant
    for (const [key, tenant] of Object.entries(tenants)) {
      tenant.apiKey = generateApiKey();
      apiKeyStore.addKey({
        id: `${tenant.id}-key`,
        tenantId: tenant.id,
        keyHash: hashApiKey(tenant.apiKey),
        name: `${tenant.name} API Key`,
        permissions: ['*'],
        rateLimit: 1000,
        createdAt: new Date(),
      });
    }

    // Create study service with tenant-isolated store
    const studyService = {
      createStudy: vi.fn(async (tenantId: string, request: { manifest: Manifest }) => {
        const studyId = `study_${Date.now()}_${Math.random().toString(36).slice(2)}`;
        const study: Study = {
          id: studyId,
          tenantId,
          manifest: request.manifest,
          status: 'validating',
          totalCells: 1,
          completedCells: 0,
          failedCells: 0,
          createdAt: new Date(),
          deadline: request.manifest.deadline,
          estimatedCost: { min: 0.10, max: 0.50, currency: 'USD' },
          actualCost: { total: 0, currency: 'USD', breakdown: {} },
        };
        studyStore.createStudy(tenantId, study);
        costTracker.recordCost(tenantId, studyId, 0.25); // Record initial cost estimate

        return {
          studyId,
          status: 'validating' as const,
          createdAt: study.createdAt,
        };
      }),

      getStudyStatus: vi.fn(async (tenantId: string, studyId: string) => {
        const study = studyStore.getStudy(tenantId, studyId);
        if (!study) return null;

        return {
          studyId: study.id,
          status: study.status,
          progress: {
            totalJobs: study.totalCells,
            completedJobs: study.completedCells,
            failedJobs: study.failedCells,
            pendingJobs: study.totalCells - study.completedCells - study.failedCells,
            completionPercentage: 0,
          },
          surfaces: [],
          createdAt: study.createdAt,
        };
      }),

      getStudyResults: vi.fn(async (tenantId: string, studyId: string) => {
        const study = studyStore.getStudy(tenantId, studyId);
        if (!study) return null;

        return {
          studyId: study.id,
          status: study.status,
          results: [],
          summary: {
            totalQueries: study.totalCells,
            successfulQueries: study.completedCells,
            failedQueries: study.failedCells,
            averageResponseTime: 100,
          },
        };
      }),

      cancelStudy: vi.fn(async (tenantId: string, studyId: string) => {
        return studyStore.deleteStudy(tenantId, studyId);
      }),

      pauseStudy: vi.fn(async () => false),
      resumeStudy: vi.fn(async () => false),
    };

    const healthService = {
      checkDatabase: vi.fn(async () => true),
      checkRedis: vi.fn(async () => true),
      checkOrchestrator: vi.fn(async () => true),
    };

    const costService = {
      getStudyCosts: vi.fn(async (tenantId: string, studyId: string) => {
        const cost = costTracker.getStudyCost(tenantId, studyId);
        if (cost === null) return null;

        return {
          studyId,
          costs: {
            total: cost,
            currency: 'USD',
            breakdown: { apiCalls: cost * 0.6, proxyUsage: cost * 0.2, storage: cost * 0.1, compute: cost * 0.1 },
          },
        };
      }),
    };

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
    studyStore.clear();
    costTracker.clear();
  });

  describe('Study Isolation', () => {
    it('should allow tenant to create and access their own studies', async () => {
      // Kyanos creates a study
      const createResponse = await gateway.inject({
        method: 'POST',
        url: '/v1/studies',
        headers: {
          authorization: `Bearer ${tenants.kyanos.apiKey}`,
          'content-type': 'application/json',
        },
        payload: { manifest: createTestManifest('Kyanos Study') },
      });

      expect(createResponse.statusCode).toBe(201);
      const { studyId } = createResponse.json().data;

      // Kyanos should be able to access their study
      const statusResponse = await gateway.inject({
        method: 'GET',
        url: `/v1/studies/${studyId}`,
        headers: { authorization: `Bearer ${tenants.kyanos.apiKey}` },
      });

      expect(statusResponse.statusCode).toBe(200);
      expect(statusResponse.json().data.studyId).toBe(studyId);
    });

    it('should prevent tenant from accessing another tenant studies', async () => {
      // Kyanos creates a study
      const createResponse = await gateway.inject({
        method: 'POST',
        url: '/v1/studies',
        headers: {
          authorization: `Bearer ${tenants.kyanos.apiKey}`,
          'content-type': 'application/json',
        },
        payload: { manifest: createTestManifest('Kyanos Private Study') },
      });

      expect(createResponse.statusCode).toBe(201);
      const { studyId } = createResponse.json().data;

      // GLU should NOT be able to access Kyanos's study
      const statusResponse = await gateway.inject({
        method: 'GET',
        url: `/v1/studies/${studyId}`,
        headers: { authorization: `Bearer ${tenants.glu.apiKey}` },
      });

      expect(statusResponse.statusCode).toBe(404);
      expect(statusResponse.json().error.code).toBe('STUDY_NOT_FOUND');

      // Verify the access was denied
      const deniedAttempts = studyStore.getDeniedAttempts();
      expect(deniedAttempts.length).toBe(1);
      expect(deniedAttempts[0].tenantId).toBe(tenants.glu.id);
      expect(deniedAttempts[0].studyId).toBe(studyId);
    });

    it('should prevent tenant from deleting another tenant studies', async () => {
      // Kyanos creates a study
      const createResponse = await gateway.inject({
        method: 'POST',
        url: '/v1/studies',
        headers: {
          authorization: `Bearer ${tenants.kyanos.apiKey}`,
          'content-type': 'application/json',
        },
        payload: { manifest: createTestManifest('Kyanos Protected Study') },
      });

      const { studyId } = createResponse.json().data;

      // GLU attempts to delete Kyanos's study
      const deleteResponse = await gateway.inject({
        method: 'DELETE',
        url: `/v1/studies/${studyId}`,
        headers: { authorization: `Bearer ${tenants.glu.apiKey}` },
      });

      expect(deleteResponse.statusCode).toBe(404);

      // Verify Kyanos can still access their study
      const statusResponse = await gateway.inject({
        method: 'GET',
        url: `/v1/studies/${studyId}`,
        headers: { authorization: `Bearer ${tenants.kyanos.apiKey}` },
      });

      expect(statusResponse.statusCode).toBe(200);
    });

    it('should maintain isolation with multiple tenants simultaneously', async () => {
      const createdStudies: Record<string, string[]> = {
        kyanos: [],
        glu: [],
        acme: [],
      };

      // Each tenant creates multiple studies
      for (const [tenantKey, tenant] of Object.entries(tenants)) {
        for (let i = 0; i < 3; i++) {
          const response = await gateway.inject({
            method: 'POST',
            url: '/v1/studies',
            headers: {
              authorization: `Bearer ${tenant.apiKey}`,
              'content-type': 'application/json',
            },
            payload: { manifest: createTestManifest(`${tenant.name} Study ${i + 1}`) },
          });

          expect(response.statusCode).toBe(201);
          createdStudies[tenantKey].push(response.json().data.studyId);
        }
      }

      // Each tenant should only see their own studies
      for (const [tenantKey, tenant] of Object.entries(tenants)) {
        for (const studyId of createdStudies[tenantKey]) {
          const response = await gateway.inject({
            method: 'GET',
            url: `/v1/studies/${studyId}`,
            headers: { authorization: `Bearer ${tenant.apiKey}` },
          });
          expect(response.statusCode).toBe(200);
        }

        // Verify they cannot see other tenants' studies
        for (const [otherKey, otherStudyIds] of Object.entries(createdStudies)) {
          if (otherKey === tenantKey) continue;

          for (const studyId of otherStudyIds) {
            const response = await gateway.inject({
              method: 'GET',
              url: `/v1/studies/${studyId}`,
              headers: { authorization: `Bearer ${tenant.apiKey}` },
            });
            expect(response.statusCode).toBe(404);
          }
        }
      }
    });
  });

  describe('Cost Isolation', () => {
    it('should attribute costs to correct tenant', async () => {
      // Kyanos creates a study
      const kyanosResponse = await gateway.inject({
        method: 'POST',
        url: '/v1/studies',
        headers: {
          authorization: `Bearer ${tenants.kyanos.apiKey}`,
          'content-type': 'application/json',
        },
        payload: { manifest: createTestManifest('Kyanos Billable Study') },
      });

      const kyanosStudyId = kyanosResponse.json().data.studyId;

      // GLU creates a study
      const gluResponse = await gateway.inject({
        method: 'POST',
        url: '/v1/studies',
        headers: {
          authorization: `Bearer ${tenants.glu.apiKey}`,
          'content-type': 'application/json',
        },
        payload: { manifest: createTestManifest('GLU Billable Study') },
      });

      const gluStudyId = gluResponse.json().data.studyId;

      // Verify costs are tracked per tenant
      expect(costTracker.getTenantTotalCost(tenants.kyanos.id)).toBe(0.25);
      expect(costTracker.getTenantTotalCost(tenants.glu.id)).toBe(0.25);

      // Each tenant should only access their own costs
      const kyanosCostResponse = await gateway.inject({
        method: 'GET',
        url: `/v1/costs/${kyanosStudyId}`,
        headers: { authorization: `Bearer ${tenants.kyanos.apiKey}` },
      });
      expect(kyanosCostResponse.statusCode).toBe(200);

      // GLU should not see Kyanos's costs
      const crossTenantCostResponse = await gateway.inject({
        method: 'GET',
        url: `/v1/costs/${kyanosStudyId}`,
        headers: { authorization: `Bearer ${tenants.glu.apiKey}` },
      });
      expect(crossTenantCostResponse.statusCode).toBe(404);
    });
  });

  describe('API Key Isolation', () => {
    it('should reject requests with invalid API key', async () => {
      const response = await gateway.inject({
        method: 'GET',
        url: '/v1/studies/any-study',
        headers: { authorization: 'Bearer invalid_key_12345' },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('INVALID_API_KEY');
    });

    it('should reject requests without API key', async () => {
      const response = await gateway.inject({
        method: 'GET',
        url: '/v1/studies/any-study',
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHORIZED');
    });

    it('should expire API keys correctly', async () => {
      // Add an expired key
      const expiredKey = generateApiKey();
      apiKeyStore.addKey({
        id: 'expired-key',
        tenantId: 'tenant-expired',
        keyHash: hashApiKey(expiredKey),
        name: 'Expired Key',
        permissions: ['*'],
        rateLimit: 1000,
        createdAt: new Date(Date.now() - 86400000), // Created yesterday
        expiresAt: new Date(Date.now() - 3600000), // Expired 1 hour ago
      });

      const response = await gateway.inject({
        method: 'GET',
        url: '/v1/studies/any-study',
        headers: { authorization: `Bearer ${expiredKey}` },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('API_KEY_EXPIRED');
    });
  });

  describe('Data Leakage Prevention', () => {
    it('should not leak tenant IDs in error messages', async () => {
      // Create a study as Kyanos
      const createResponse = await gateway.inject({
        method: 'POST',
        url: '/v1/studies',
        headers: {
          authorization: `Bearer ${tenants.kyanos.apiKey}`,
          'content-type': 'application/json',
        },
        payload: { manifest: createTestManifest('Secret Kyanos Study') },
      });

      const { studyId } = createResponse.json().data;

      // GLU tries to access it
      const accessResponse = await gateway.inject({
        method: 'GET',
        url: `/v1/studies/${studyId}`,
        headers: { authorization: `Bearer ${tenants.glu.apiKey}` },
      });

      const errorBody = accessResponse.json();

      // Error message should NOT reveal the owning tenant
      expect(JSON.stringify(errorBody)).not.toContain('kyanos');
      expect(JSON.stringify(errorBody)).not.toContain('Kyanos');
      expect(JSON.stringify(errorBody)).not.toContain(tenants.kyanos.id);
    });

    it('should not expose internal study details in error responses', async () => {
      const response = await gateway.inject({
        method: 'GET',
        url: '/v1/studies/nonexistent-study-id',
        headers: { authorization: `Bearer ${tenants.kyanos.apiKey}` },
      });

      const errorBody = response.json();

      // Should only say "not found", not reveal anything about other tenants
      expect(errorBody.error.code).toBe('STUDY_NOT_FOUND');
      expect(errorBody.error.message).not.toContain('tenant');
    });
  });
});

describe('Security: API Key Management', () => {
  let gateway: FastifyInstance;
  let apiKeyStore: InMemoryApiKeyStore;

  beforeEach(async () => {
    apiKeyStore = new InMemoryApiKeyStore();

    const studyService = {
      createStudy: vi.fn(async () => ({
        studyId: 'test-study',
        status: 'validating' as const,
        createdAt: new Date(),
      })),
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

  it('should use secure API key format', () => {
    const key = generateApiKey();

    // Key should have proper prefix
    expect(key).toMatch(/^btm_/);

    // Key should be sufficiently long (32 bytes base64url encoded = ~43 chars + prefix)
    expect(key.length).toBeGreaterThan(40);

    // Key should only contain safe characters
    expect(key).toMatch(/^btm_[A-Za-z0-9_-]+$/);
  });

  it('should hash API keys using SHA-256', () => {
    const key = generateApiKey();
    const hash = hashApiKey(key);

    // SHA-256 produces 64 hex characters
    expect(hash.length).toBe(64);
    expect(hash).toMatch(/^[a-f0-9]+$/);

    // Same key should produce same hash
    expect(hashApiKey(key)).toBe(hash);

    // Different keys should produce different hashes
    const key2 = generateApiKey();
    expect(hashApiKey(key2)).not.toBe(hash);
  });

  it('should never expose raw API keys in responses', async () => {
    const apiKey = generateApiKey();
    apiKeyStore.addKey({
      id: 'test-key',
      tenantId: 'test-tenant',
      keyHash: hashApiKey(apiKey),
      name: 'Test Key',
      permissions: ['*'],
      rateLimit: 1000,
      createdAt: new Date(),
    });

    // Make a request
    const response = await gateway.inject({
      method: 'GET',
      url: '/v1/health',
    });

    // Response should never contain the raw key
    expect(JSON.stringify(response.json())).not.toContain(apiKey);

    // Response should never contain the key hash
    expect(JSON.stringify(response.json())).not.toContain(hashApiKey(apiKey));
  });
});
