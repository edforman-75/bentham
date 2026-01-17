/**
 * Server Entry Point
 *
 * Starts the API gateway with real dependencies.
 */

import { Gateway } from './gateway.js';
import { InMemoryApiKeyStore, hashApiKey } from './middleware/auth.js';
import type { StudyService } from './routes/studies.js';
import type { HealthService } from './routes/health.js';
import type { CostService } from './routes/costs.js';

/**
 * Create mock services for development
 * In production, these would be real service implementations
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
          total: 12.50,
          currency: 'USD',
          breakdown: {
            apiCalls: 8.00,
            proxyUsage: 3.50,
            storage: 0.50,
            compute: 0.50,
          },
        },
        estimatedFinalCost: 25.00,
      };
    },
  };

  return { studyService, healthService, costService };
}

/**
 * Create API key store with development key
 */
function createApiKeyStore(): InMemoryApiKeyStore {
  const store = new InMemoryApiKeyStore();

  // Add development API key
  const devKey = 'btm_dev_key_for_testing';
  store.addKey({
    id: 'dev-key-1',
    tenantId: 'tenant-dev',
    keyHash: hashApiKey(devKey),
    name: 'Development Key',
    permissions: ['*'],
    rateLimit: 1000,
    createdAt: new Date(),
  });

  console.log(`\nDevelopment API Key: ${devKey}\n`);

  return store;
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  const services = createMockServices();
  const apiKeyStore = createApiKeyStore();

  const gateway = new Gateway(
    {
      port: parseInt(process.env.PORT ?? '3000', 10),
      host: process.env.HOST ?? '0.0.0.0',
      logging: {
        level: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') ?? 'info',
        pretty: process.env.NODE_ENV !== 'production',
      },
    },
    {
      ...services,
      apiKeyStore,
    }
  );

  // Handle shutdown
  const shutdown = async () => {
    console.log('\nShutting down...');
    await gateway.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await gateway.start();
}

main().catch((error) => {
  console.error('Failed to start gateway:', error);
  process.exit(1);
});
