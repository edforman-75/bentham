/**
 * Vercel Serverless Function Handler
 *
 * Wraps the Fastify application for Vercel deployment.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createGateway, InMemoryApiKeyStore, hashApiKey } from '../src/index.js';
import type { StudyService } from '../src/routes/studies.js';
import type { HealthService } from '../src/routes/health.js';
import type { CostService } from '../src/routes/costs.js';

// Cache the Fastify instance for warm starts
let app: Awaited<ReturnType<typeof createGateway>> | null = null;

/**
 * Create mock services for staging/demo
 * In production, these would connect to real services
 */
function createMockServices() {
  const studyService: StudyService = {
    async createStudy(_tenantId, _request) {
      const studyId = `study_${Date.now().toString(36)}`;
      return {
        studyId,
        status: 'validating' as const,
        createdAt: new Date(),
        estimatedCompletionTime: new Date(Date.now() + 60 * 60 * 1000),
      };
    },

    async getStudyStatus(_tenantId, studyId) {
      return {
        studyId,
        status: 'executing' as const,
        progress: {
          totalJobs: 100,
          completedJobs: 45,
          failedJobs: 2,
          pendingJobs: 53,
          completionPercentage: 45,
        },
        surfaces: [
          { surfaceId: 'openai-api', completed: 20, failed: 1, pending: 29 },
          { surfaceId: 'anthropic-api', completed: 25, failed: 1, pending: 24 },
        ],
        createdAt: new Date(Date.now() - 30 * 60 * 1000),
        startedAt: new Date(Date.now() - 25 * 60 * 1000),
      };
    },

    async getStudyResults(_tenantId, studyId) {
      return {
        studyId,
        status: 'complete' as const,
        results: [],
        summary: {
          totalQueries: 100,
          successfulQueries: 98,
          failedQueries: 2,
          averageResponseTime: 1250,
        },
        completedAt: new Date(),
      };
    },

    async cancelStudy(_tenantId, _studyId) {
      return true;
    },

    async pauseStudy(_tenantId, _studyId) {
      return true;
    },

    async resumeStudy(_tenantId, _studyId) {
      return true;
    },
  };

  const healthService: HealthService = {
    async checkDatabase() {
      return true;
    },
    async checkRedis() {
      return true;
    },
    async checkOrchestrator() {
      return true;
    },
  };

  const costService: CostService = {
    async getStudyCosts(_tenantId, studyId) {
      return {
        studyId,
        costs: {
          total: 12.5,
          currency: 'USD',
          breakdown: {
            apiCalls: 8.0,
            proxyUsage: 3.5,
            storage: 0.5,
            compute: 0.5,
          },
        },
        estimatedFinalCost: 25.0,
      };
    },
  };

  return { studyService, healthService, costService };
}

/**
 * Create API key store with staging keys
 */
function createApiKeyStore(): InMemoryApiKeyStore {
  const store = new InMemoryApiKeyStore();

  // Add staging API key from environment
  const stagingKey = process.env.STAGING_API_KEY || 'btm_staging_test_key';
  store.addKey({
    id: 'staging-key-1',
    tenantId: 'tenant-staging',
    keyHash: hashApiKey(stagingKey),
    name: 'Staging Key',
    permissions: ['*'],
    rateLimit: 1000,
    createdAt: new Date(),
  });

  // Add Kyanos key if configured
  if (process.env.KYANOS_API_KEY) {
    store.addKey({
      id: 'kyanos-key',
      tenantId: 'tenant-kyanos',
      keyHash: hashApiKey(process.env.KYANOS_API_KEY),
      name: 'Kyanos Production Key',
      permissions: ['*'],
      rateLimit: 1000,
      createdAt: new Date(),
    });
  }

  return store;
}

/**
 * Initialize Fastify app (cached for warm starts)
 */
async function getApp() {
  if (app) {
    return app;
  }

  const services = createMockServices();
  const apiKeyStore = createApiKeyStore();

  app = await createGateway(
    {
      rateLimit: {
        enabled: true,
        max: 100,
        windowMs: 60000,
      },
      logging: {
        level: 'info',
        pretty: false,
      },
    },
    {
      ...services,
      apiKeyStore,
    }
  );

  return app;
}

/**
 * Vercel serverless handler
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const fastify = await getApp();

  // Convert Vercel request to Fastify format
  const response = await fastify.inject({
    method: req.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS',
    url: req.url || '/',
    headers: req.headers as Record<string, string>,
    payload: req.body,
  });

  // Set response headers
  Object.entries(response.headers).forEach(([key, value]) => {
    if (value) {
      res.setHeader(key, value);
    }
  });

  // Send response
  res.status(response.statusCode).send(response.body);
}
