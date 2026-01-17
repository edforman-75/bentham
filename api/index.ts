/**
 * Vercel Serverless Function Handler
 *
 * Standalone API implementation for staging deployment.
 * In production, this would be replaced with the full api-gateway package.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { createHash } from 'crypto';

// Cache the Fastify instance for warm starts
let app: FastifyInstance | null = null;

/**
 * Hash an API key using SHA-256
 */
function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Simple API key store
 */
const apiKeys = new Map<string, { id: string; tenantId: string; name: string }>();

// Initialize staging key
const stagingKey = process.env.STAGING_API_KEY || 'btm_staging_test_key';
apiKeys.set(hashApiKey(stagingKey), {
  id: 'staging-key-1',
  tenantId: 'tenant-staging',
  name: 'Staging Key',
});

// Add Kyanos key if configured
if (process.env.KYANOS_API_KEY) {
  apiKeys.set(hashApiKey(process.env.KYANOS_API_KEY), {
    id: 'kyanos-key',
    tenantId: 'tenant-kyanos',
    name: 'Kyanos Production Key',
  });
}

// Add GLU key if configured
if (process.env.GLU_API_KEY) {
  apiKeys.set(hashApiKey(process.env.GLU_API_KEY), {
    id: 'glu-key',
    tenantId: 'tenant-glu',
    name: 'GLU Production Key',
  });
}

/**
 * Initialize Fastify app
 */
async function getApp(): Promise<FastifyInstance> {
  if (app) return app;

  const fastify = Fastify({
    logger: { level: 'info' },
    trustProxy: true,
  });

  // Security headers
  await fastify.register(helmet, { contentSecurityPolicy: false });

  // CORS
  await fastify.register(cors, {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  });

  // Health check (no auth)
  fastify.get('/health', async () => ({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '0.0.1',
  }));

  // Root route (no auth)
  fastify.get('/', async () => ({
    name: 'Bentham API Gateway',
    version: '0.0.1',
    status: 'operational',
    endpoints: {
      health: '/health',
      studies: '/v1/studies',
    },
  }));

  // Auth middleware for protected routes
  fastify.addHook('onRequest', async (request, reply) => {
    const path = request.url?.split('?')[0] || '';

    // Skip auth for health and root
    if (path === '/' || path === '/health' || path === '/v1/health') {
      return;
    }

    const apiKey = request.headers['x-api-key'] as string | undefined;
    if (!apiKey) {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'API key required' },
      });
    }

    const keyHash = hashApiKey(apiKey);
    const keyData = apiKeys.get(keyHash);

    if (!keyData) {
      return reply.status(401).send({
        success: false,
        error: { code: 'INVALID_API_KEY', message: 'Invalid API key' },
      });
    }

    // Attach tenant info to request
    (request as any).tenantId = keyData.tenantId;
  });

  // V1 Studies routes
  fastify.post('/v1/studies', async (request, reply) => {
    const studyId = `study_${Date.now().toString(36)}`;
    return reply.status(201).send({
      success: true,
      data: {
        studyId,
        status: 'validating',
        createdAt: new Date().toISOString(),
        estimatedCompletionTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
    });
  });

  fastify.get('/v1/studies/:id', async (request) => {
    const { id } = request.params as { id: string };
    return {
      success: true,
      data: {
        studyId: id,
        status: 'executing',
        progress: {
          totalJobs: 100,
          completedJobs: 45,
          failedJobs: 2,
          pendingJobs: 53,
          completionPercentage: 45,
        },
        createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        startedAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
      },
    };
  });

  fastify.get('/v1/studies/:id/results', async (request) => {
    const { id } = request.params as { id: string };
    return {
      success: true,
      data: {
        studyId: id,
        status: 'complete',
        results: [],
        summary: {
          totalQueries: 100,
          successfulQueries: 98,
          failedQueries: 2,
          averageResponseTime: 1250,
        },
        completedAt: new Date().toISOString(),
      },
    };
  });

  fastify.delete('/v1/studies/:id', async (request, reply) => {
    return reply.status(204).send();
  });

  // V1 Costs routes
  fastify.get('/v1/studies/:id/costs', async (request) => {
    const { id } = request.params as { id: string };
    return {
      success: true,
      data: {
        studyId: id,
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
      },
    };
  });

  // V1 Health
  fastify.get('/v1/health', async () => ({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '0.0.1',
    services: {
      database: 'healthy',
      redis: 'healthy',
      orchestrator: 'healthy',
    },
  }));

  // === Operator Dashboard Endpoints ===

  // Overall system health
  fastify.get('/v1/operator/health', async () => ({
    success: true,
    data: {
      overallScore: 85,
      surfaces: {
        'openai-api': {
          surfaceId: 'openai-api',
          overallScore: 75,
          healthyCount: 1,
          degradedCount: 1,
          unhealthyCount: 0,
          totalCount: 2,
          canServe: true,
          adapters: [
            { id: 'openai-primary', score: 90, state: 'closed', enabled: true },
            { id: 'openai-backup', score: 60, state: 'half-open', enabled: true },
          ],
        },
        'anthropic-api': {
          surfaceId: 'anthropic-api',
          overallScore: 95,
          healthyCount: 1,
          degradedCount: 0,
          unhealthyCount: 0,
          totalCount: 1,
          canServe: true,
          adapters: [
            { id: 'anthropic-primary', score: 95, state: 'closed', enabled: true },
          ],
        },
        'google-ai-api': {
          surfaceId: 'google-ai-api',
          overallScore: 100,
          healthyCount: 1,
          degradedCount: 0,
          unhealthyCount: 0,
          totalCount: 1,
          canServe: true,
          adapters: [
            { id: 'google-primary', score: 100, state: 'closed', enabled: true },
          ],
        },
        'perplexity-api': {
          surfaceId: 'perplexity-api',
          overallScore: 0,
          healthyCount: 0,
          degradedCount: 0,
          unhealthyCount: 1,
          totalCount: 1,
          canServe: false,
          adapters: [
            { id: 'perplexity-primary', score: 0, state: 'open', enabled: true },
          ],
        },
      },
      totalHealthyAdapters: 3,
      totalDegradedAdapters: 1,
      totalUnhealthyAdapters: 1,
      unavailableSurfaces: ['perplexity-api'],
      timestamp: new Date().toISOString(),
    },
  }));

  // Active incidents
  fastify.get('/v1/operator/incidents', async () => ({
    success: true,
    data: {
      incidents: [
        {
          id: 'INC-ABC123',
          surfaceId: 'openai-api',
          adapterId: 'openai-backup',
          title: 'openai-api: Rate Limit Exceeded',
          description: 'Rate limit exceeded on backup adapter',
          severity: 'warning',
          status: 'active',
          errorCode: 'RATE_LIMITED',
          errorMessage: 'Rate limit exceeded. Please try again in 60 seconds.',
          firstOccurredAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
          lastOccurredAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
          occurrenceCount: 12,
          impact: {
            queriesBlocked: 5,
            costImpactPerHour: 0,
            affectedStudies: [],
            affectedSurfaces: ['openai-api'],
            capacityImpactPercent: 25,
            userImpactDescription: 'Some queries to openai-api may be delayed',
          },
          suggestedActions: [
            {
              id: 'wait',
              description: 'Wait for rate limit window to reset',
              automatable: true,
              priority: 1,
              estimatedImpact: 'Queries will resume automatically after cooldown period',
            },
            {
              id: 'add-keys',
              description: 'Add additional API keys to the pool',
              automatable: false,
              priority: 2,
              estimatedImpact: 'Increases capacity and distributes rate limit burden',
            },
          ],
        },
        {
          id: 'INC-DEF456',
          surfaceId: 'perplexity-api',
          adapterId: 'perplexity-primary',
          title: 'perplexity-api: API Quota Exhausted',
          description: 'Perplexity API key has exceeded its quota',
          severity: 'critical',
          status: 'active',
          errorCode: 'QUOTA_EXCEEDED',
          errorMessage: 'You exceeded your current quota. Please check your plan and billing details.',
          firstOccurredAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
          lastOccurredAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          occurrenceCount: 45,
          impact: {
            queriesBlocked: 45,
            costImpactPerHour: 2.5,
            affectedStudies: ['study_abc123'],
            affectedSurfaces: ['perplexity-api'],
            capacityImpactPercent: 100,
            userImpactDescription: 'All queries to perplexity-api will fail',
          },
          suggestedActions: [
            {
              id: 'add-credits',
              description: 'Add credits or upgrade billing plan',
              automatable: false,
              priority: 1,
              estimatedImpact: 'Restores full service immediately after payment processes',
            },
            {
              id: 'use-backup',
              description: 'Switch to backup API provider',
              automatable: true,
              priority: 2,
              estimatedImpact: 'May have different pricing and capabilities',
            },
          ],
        },
      ],
      summary: {
        total: 2,
        active: 2,
        acknowledged: 0,
        investigating: 0,
        resolved: 0,
        bySeverity: { info: 0, warning: 1, critical: 1, outage: 0 },
      },
    },
  }));

  // Surface-specific status
  fastify.get('/v1/operator/surfaces/:id/status', async (request) => {
    const { id } = request.params as { id: string };

    // Mock data for different surfaces
    const surfaceData: Record<string, object> = {
      'openai-api': {
        surfaceId: 'openai-api',
        name: 'OpenAI API',
        overallScore: 75,
        status: 'degraded',
        adapters: [
          {
            id: 'openai-primary',
            score: 90,
            state: 'closed',
            enabled: true,
            stats: {
              totalQueries: 1250,
              successfulQueries: 1240,
              failedQueries: 10,
              avgResponseTimeMs: 850,
              totalTokensUsed: 125000,
              totalCostUsd: 1.25,
            },
          },
          {
            id: 'openai-backup',
            score: 60,
            state: 'half-open',
            enabled: true,
            stats: {
              totalQueries: 45,
              successfulQueries: 30,
              failedQueries: 15,
              avgResponseTimeMs: 1200,
              totalTokensUsed: 4500,
              totalCostUsd: 0.05,
            },
          },
        ],
        recentErrors: [
          { code: 'RATE_LIMITED', count: 12, lastOccurred: new Date(Date.now() - 2 * 60 * 1000).toISOString() },
        ],
      },
      'anthropic-api': {
        surfaceId: 'anthropic-api',
        name: 'Anthropic Claude API',
        overallScore: 95,
        status: 'healthy',
        adapters: [
          {
            id: 'anthropic-primary',
            score: 95,
            state: 'closed',
            enabled: true,
            stats: {
              totalQueries: 890,
              successfulQueries: 888,
              failedQueries: 2,
              avgResponseTimeMs: 920,
              totalTokensUsed: 98000,
              totalCostUsd: 0.98,
            },
          },
        ],
        recentErrors: [],
      },
    };

    const data = surfaceData[id];
    if (!data) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: `Surface ${id} not found` },
      };
    }

    return { success: true, data };
  });

  // Acknowledge an incident
  fastify.post('/v1/operator/incidents/:id/acknowledge', async (request) => {
    const { id } = request.params as { id: string };
    return {
      success: true,
      data: {
        incidentId: id,
        status: 'acknowledged',
        acknowledgedAt: new Date().toISOString(),
        acknowledgedBy: 'operator@example.com',
      },
    };
  });

  // Resolve an incident
  fastify.post('/v1/operator/incidents/:id/resolve', async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as { resolutionNotes?: string } | undefined;
    return {
      success: true,
      data: {
        incidentId: id,
        status: 'resolved',
        resolvedAt: new Date().toISOString(),
        resolutionNotes: body?.resolutionNotes ?? 'Resolved by operator',
      },
    };
  });

  app = fastify;
  return fastify;
}

/**
 * Vercel serverless handler
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const fastify = await getApp();

  const response = await fastify.inject({
    method: req.method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS',
    url: req.url || '/',
    headers: req.headers as Record<string, string>,
    payload: req.body,
  });

  // Set response headers
  Object.entries(response.headers).forEach(([key, value]) => {
    if (value && typeof value === 'string') {
      res.setHeader(key, value);
    } else if (Array.isArray(value)) {
      res.setHeader(key, value);
    }
  });

  res.status(response.statusCode).send(response.body);
}
